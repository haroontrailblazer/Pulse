import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { downloads, releaseVersion } from "../shared/downloads.js";
import { latestManifest } from "../shared/updates.js";
import { buildIdentity } from "./build-identity.mjs";

// GitHub's large-asset response can be slow to start or stream during a
// deployment. Keep the guard, but allow the verified Windows installer time
// to finish instead of aborting an otherwise healthy transfer at five minutes.
const DOWNLOAD_TIMEOUT_MS = 900_000;

async function verifiedFile(path, asset) {
  try {
    if ((await stat(path)).size !== asset.bytes) return false;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex") === asset.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function stageAsset(
  asset,
  { source, cacheDir, outputDir, fetcher = fetch },
) {
  if (
    !/^Pulse-[\d.]+-(Android\.apk|Windows\.exe)$/.test(asset.name) ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes <= 0
  ) {
    throw new Error("Invalid release asset metadata");
  }
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  const cached = join(cacheDir, asset.name);
  if (!(await verifiedFile(cached, asset))) {
    const partial = `${cached}.partial`;
    try {
      const response = await fetcher(`${source}/${asset.name}`, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok || !response.body)
        throw new Error(
          `Download failed: ${asset.name} (HTTP ${response.status})`,
        );
      let bytes = 0;
      const hash = createHash("sha256");
      const verify = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > asset.bytes)
            return callback(
              new Error(`Unexpected download size: ${asset.name}`),
            );
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body),
        verify,
        createWriteStream(partial),
      );
      if (bytes !== asset.bytes || hash.digest("hex") !== asset.sha256) {
        throw new Error(`Release checksum mismatch: ${asset.name}`);
      }
      await rename(partial, cached);
    } finally {
      await rm(partial, { force: true });
    }
  }
  await copyFile(cached, join(outputDir, asset.name));
  console.log(`Verified CDN download: ${asset.name} (${asset.bytes} bytes)`);
}

async function main() {
  const manifest = JSON.parse(
    await readFile(
      new URL("../shared/release-assets.json", import.meta.url),
      "utf8",
    ),
  );
  if (manifest.version !== releaseVersion)
    throw new Error("Download manifest must match the release version");
  // The installers this deployment offers were built from `sourceHash`, and
  // normally the site is built from that same source -- one product, three
  // surfaces, shipped together.
  //
  // AGENTS.md allows a deliberately web-only change with explicit
  // confirmation, and this is where that confirmation lives. The site may run
  // ahead of the installers, but only at a source someone wrote down: the hash
  // is in the manifest, it is visible in the diff, and the very next edit to
  // any fingerprinted file invalidates it again. So a web-only deploy stays a
  // decision rather than becoming the default, and "stale installers" still
  // means stale installers.
  //
  // What it does not relax: the version must still match, and the bytes are
  // still downloaded and verified against the digests below. A visitor is
  // offered exactly the installers this manifest names.
  const identity = buildIdentity();
  const built = manifest.sourceHash === identity.sourceHash;
  const webOnly = manifest.webOnly?.sourceHash === identity.sourceHash;
  if (!built && !webOnly)
    throw new Error(
      `Installers are stale for this app source (${identity.sourceHash.slice(0, 12)}). Run npm run build:all-downloads before publishing, or record a deliberate web-only deploy in shared/release-assets.json.`,
    );
  if (webOnly)
    console.log(
      `Web-only deploy: the site is ahead of the v${manifest.version} installers at source ${identity.sourceHash.slice(0, 12)} -- ${manifest.webOnly.reason}`,
    );
  const outputDir = resolve("dist/downloads", `v${manifest.version}`);
  const cacheDir = resolve(".cache/download-mirror", `v${manifest.version}`);
  const source = `https://github.com/haroontrailblazer/Pulse/releases/download/v${manifest.version}`;
  for (const asset of manifest.assets) {
    const local = resolve("public/downloads", `v${manifest.version}`, asset.name);
    if (await verifiedFile(local, asset)) {
      await mkdir(cacheDir, { recursive: true });
      await copyFile(local, join(cacheDir, asset.name));
    }
    await stageAsset(asset, { source, cacheDir, outputDir });
  }
  await writeFile(
    join(outputDir, "SHA256SUMS.txt"),
    manifest.assets
      .map((a) => `${a.sha256.toUpperCase()}  ${a.name}\n`)
      .join(""),
  );
  // The one thing that tells a running APK or EXE that a newer Pulse exists, and
  // it is written HERE, as the last thing this script does, for a reason worth
  // stating. By this line every installer named in it has been downloaded,
  // size-checked and SHA-256 verified into the same dist/ that is about to be
  // deployed as one unit -- and the two guards at the top of main() have already
  // refused to run unless the release metadata matches both the app version and
  // the current source. So the manifest cannot go live announcing a version whose
  // installers are not yet downloadable at the URLs it prints. That ordering is
  // the only real hazard in the release sequence, and closing it by structure
  // beats remembering to.
  //
  // Into dist/ rather than public/, which matters twice. public/ is copied into
  // every build, so the APK and the Electron asar would each carry a stale copy
  // that a relative fetch would read instead of the network -- and public/ is
  // inside buildIdentity()'s fingerprint, so a release writing its own checksums
  // there would invalidate the sourceHash guard that let it start. This script
  // runs only from `npm run build:deploy`, never from the `npm run build` the two
  // native packages are built from, so neither can contain this file at all.
  await writeFile(
    resolve("dist/latest.json"),
    `${JSON.stringify(latestManifest(manifest, downloads), null, 2)}\n`,
  );
  console.log(`Published latest.json for v${manifest.version}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
