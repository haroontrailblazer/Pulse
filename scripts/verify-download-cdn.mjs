import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/**
 * What distinguishes a broken download from a slow one is not how long it takes
 * but whether bytes are still arriving. A flat timeout aborted a healthy 105MB
 * transfer, and sizing the budget by an assumed throughput is no better: this
 * link has served the 6MB APK at 20KB/s and the 105MB EXE at 100KB/s, so any
 * floor picked in advance is wrong for one of them. Abort on a stall instead,
 * and keep a generous overall cap only as a backstop.
 */
export const IDLE_TIMEOUT_MS = Number(process.env.PULSE_CDN_IDLE_MS || 120_000);
export const MIN_BYTES_PER_SECOND = Number(
  process.env.PULSE_CDN_MIN_BPS || 5_000,
);
const HANDSHAKE_MS = 60_000;
/** Small enough to stay a liveness check rather than a transfer budget. */
const RANGE_TIMEOUT_MS = 60_000;

export function downloadBudgetMs(bytes, bytesPerSecond = MIN_BYTES_PER_SECOND) {
  const rate = bytesPerSecond > 0 ? bytesPerSecond : 1;
  return HANDSHAKE_MS + Math.ceil((Math.max(0, bytes) / rate) * 1000);
}

export async function verifyDownloads(manifest) {
  const base = `https://www.pulses4u.in/downloads/v${manifest.version}`;
  const results = [];
  for (const asset of manifest.assets) {
    const started = performance.now();
    const budget = downloadBudgetMs(asset.bytes);
    const response = await fetch(`${base}/${asset.name}`, {
      signal: AbortSignal.timeout(budget),
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
    let idle = null;
    const stalled = () =>
      new Promise((_, reject) => {
        idle = setTimeout(
          () =>
            reject(
              new Error(
                `CDN download stalled: ${asset.name} after ${bytes} bytes`,
              ),
            ),
          IDLE_TIMEOUT_MS,
        );
      });
    try {
      const reader = response.body[Symbol.asyncIterator]();
      for (;;) {
        // Race each chunk against the idle timer: a slow link keeps winning,
        // a dead connection does not.
        const next = await Promise.race([reader.next(), stalled()]);
        clearTimeout(idle);
        if (next.done) break;
        bytes += next.value.length;
        hash.update(next.value);
      }
    } finally {
      clearTimeout(idle);
    }
    if (bytes !== asset.bytes || hash.digest("hex") !== asset.sha256)
      throw new Error(`CDN checksum mismatch: ${asset.name}`);
    const seconds = (performance.now() - started) / 1000;
    const resumed = await fetch(`${base}/${asset.name}`, {
      headers: { Range: "bytes=1024-2047" },
      signal: AbortSignal.timeout(RANGE_TIMEOUT_MS),
    });
    if (
      resumed.status !== 206 ||
      resumed.headers.get("content-range") !==
        `bytes 1024-2047/${asset.bytes}` ||
      (await resumed.arrayBuffer()).byteLength !== 1024
    ) {
      throw new Error(`Resume check failed: ${asset.name}`);
    }
    const result = {
      name: asset.name,
      bytes,
      sha256: asset.sha256,
      seconds: Number(seconds.toFixed(2)),
      budgetSeconds: Math.round(budget / 1000),
      resume: "passed",
      cache: response.headers.get("x-vercel-cache"),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  return results;
}

// Importing this module must stay side-effect free so the budget arithmetic can
// be tested without downloading two installers.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifest = JSON.parse(
    await readFile(
      new URL("../shared/release-assets.json", import.meta.url),
      "utf8",
    ),
  );
  await verifyDownloads(manifest);
}
