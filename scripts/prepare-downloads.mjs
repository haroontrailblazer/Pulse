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
import { releaseVersion } from "../shared/downloads.js";

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
        signal: AbortSignal.timeout(300000),
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
  const outputDir = resolve("dist/downloads", `v${manifest.version}`);
  const cacheDir = resolve(".cache/download-mirror", `v${manifest.version}`);
  const source = `https://github.com/haroontrailblazer/Pulse/releases/download/v${manifest.version}`;
  for (const asset of manifest.assets)
    await stageAsset(asset, { source, cacheDir, outputDir });
  await writeFile(
    join(outputDir, "SHA256SUMS.txt"),
    manifest.assets
      .map((a) => `${a.sha256.toUpperCase()}  ${a.name}\n`)
      .join(""),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
