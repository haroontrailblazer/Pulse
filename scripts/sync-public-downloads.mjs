import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { releaseVersion } from "../shared/downloads.js";

function parseManifest(manifest, version) {
  if (!manifest || manifest.version !== version) {
    throw new Error("Release manifest version does not match downloads version.");
  }
  return manifest.assets;
}

async function verifyFile(path, expectedSize, expectedHash) {
  const file = await stat(path);
  if (file.size !== expectedSize)
    throw new Error(`Size mismatch for ${path}: ${file.size} != ${expectedSize}`);

  const hash = createHash("sha256");
  await new Promise((resolveHash, reject) => {
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash());
  });

  const actual = hash.digest("hex");
  if (actual !== expectedHash)
    throw new Error(`SHA mismatch for ${path}: ${actual} != ${expectedHash}`);
}

async function sync() {
  const manifest = JSON.parse(
    await readFile(resolve("shared/release-assets.json"), "utf8"),
  );
  const assets = parseManifest(manifest, releaseVersion);
  const targetDir = resolve("public", "downloads", `v${manifest.version}`);
  await mkdir(targetDir, { recursive: true });

  for (const asset of assets) {
    const source = resolve("releases", asset.name);
    await verifyFile(source, asset.bytes, asset.sha256);
    await mkdir(dirname(join(targetDir, asset.name)), { recursive: true });
    await copyFile(source, join(targetDir, asset.name));
    console.log(`Synced ${asset.name} -> public/downloads/v${manifest.version}`);
  }

  await writeFile(
    join(targetDir, "SHA256SUMS.txt"),
    assets
      .map((asset) => `${asset.sha256.toUpperCase()}  ${asset.name}\n`)
      .join(""),
    "utf8",
  );
  console.log(`Wrote SHA256SUMS.txt to ${targetDir}`);
}

await sync();
