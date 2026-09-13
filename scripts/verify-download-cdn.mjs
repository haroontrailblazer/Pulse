import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(
    new URL("../shared/release-assets.json", import.meta.url),
    "utf8",
  ),
);
const base = `https://pulse-status-zeta.vercel.app/downloads/v${manifest.version}`;
for (const asset of manifest.assets) {
  const started = performance.now();
  const response = await fetch(`${base}/${asset.name}`, {
    signal: AbortSignal.timeout(300000),
  });
  if (
    response.status !== 200 ||
    response.redirected ||
    !response.headers.get("content-disposition")?.includes("attachment")
  ) {
    throw new Error(`Invalid direct download response: ${asset.name}`);
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  if (bytes !== asset.bytes || hash.digest("hex") !== asset.sha256)
    throw new Error(`CDN checksum mismatch: ${asset.name}`);
  const seconds = (performance.now() - started) / 1000;
  const resumed = await fetch(`${base}/${asset.name}`, {
    headers: { Range: "bytes=1024-2047" },
    signal: AbortSignal.timeout(30000),
  });
  if (
    resumed.status !== 206 ||
    resumed.headers.get("content-range") !== `bytes 1024-2047/${asset.bytes}` ||
    (await resumed.arrayBuffer()).byteLength !== 1024
  ) {
    throw new Error(`Resume check failed: ${asset.name}`);
  }
  console.log(
    JSON.stringify({
      name: asset.name,
      bytes,
      sha256: asset.sha256,
      seconds: Number(seconds.toFixed(2)),
      resume: "passed",
      cache: response.headers.get("x-vercel-cache"),
    }),
  );
}
