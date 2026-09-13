import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildIdentity } from "./build-identity.mjs";

function sha256Of(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function main() {
  const manifestPath = resolve("shared", "release-assets.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const updated = await Promise.all(
    manifest.assets.map(async (asset) => {
      const source = resolve("releases", asset.name);
      const statInfo = await stat(source);
      const sha256 = await sha256Of(source);
      return { ...asset, bytes: statInfo.size, sha256 };
    }),
  );
  const output = JSON.stringify({ ...manifest, sourceHash: buildIdentity().sourceHash, assets: updated }, null, 2) + "\n";
  await writeFile(manifestPath, output, "utf8");
  for (const asset of updated)
    console.log(`metadata updated: ${asset.name} -> ${asset.bytes} bytes`);
}

await main();
