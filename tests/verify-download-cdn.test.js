import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  downloadBudgetMs,
  IDLE_TIMEOUT_MS,
  MIN_BYTES_PER_SECOND,
} from "../scripts/verify-download-cdn.mjs";

const manifest = JSON.parse(readFileSync("shared/release-assets.json", "utf8"));
const apk = manifest.assets.find((a) => a.name.endsWith(".apk"));
const exe = manifest.assets.find((a) => a.name.endsWith(".exe"));
/** Slowest throughput actually measured from this link, in bytes/second. */
const OBSERVED_SLOWEST = 20_700;

test("a slow download is not mistaken for a broken one", () => {
  // The flat 300s budget aborted a healthy 105MB transfer twice, and a budget
  // sized from an assumed rate aborted a healthy 6MB one at 20.7KB/s. Both
  // installers must now survive the slowest rate this link has produced.
  for (const asset of manifest.assets) {
    const needed = (asset.bytes / OBSERVED_SLOWEST) * 1000;
    assert.ok(
      downloadBudgetMs(asset.bytes) > needed,
      `${asset.name} would abort at the slowest observed throughput`,
    );
    assert.ok(
      downloadBudgetMs(asset.bytes) > 300_000,
      `${asset.name} regressed to the old flat budget`,
    );
  }
  // Stalls are caught by silence, not by elapsed time, so the guard does not
  // depend on guessing a throughput at all.
  assert.ok(IDLE_TIMEOUT_MS > 0 && IDLE_TIMEOUT_MS <= 5 * 60_000);
});

test("the overall cap stays a backstop, not the real guard", () => {
  assert.ok(
    downloadBudgetMs(exe.bytes) > downloadBudgetMs(apk.bytes),
    "a larger asset must never get less time",
  );
  let previous = 0;
  for (let bytes = 0; bytes <= 200_000_000; bytes += 5_000_000) {
    const budget = downloadBudgetMs(bytes);
    assert.ok(budget >= previous, `budget shrank at ${bytes} bytes`);
    previous = budget;
  }
  assert.ok(
    downloadBudgetMs(0) > 0,
    "a zero-byte asset still needs a handshake allowance",
  );
  assert.equal(
    downloadBudgetMs(0),
    downloadBudgetMs(-5),
    "negative sizes must not shrink it",
  );
  assert.ok(
    Number.isFinite(downloadBudgetMs(exe.bytes, 0)),
    "a zero rate must not divide by zero",
  );
  assert.ok(MIN_BYTES_PER_SECOND > 0);
});

test("the verifier aborts a connection that stops delivering bytes", () => {
  const source = readFileSync("scripts/verify-download-cdn.mjs", "utf8");
  // Each chunk is raced against a timer that is cleared on arrival, so silence
  // is what trips it rather than total elapsed time.
  assert.match(source, /Promise\.race/);
  assert.match(source, /stalled/);
  assert.match(source, /clearTimeout/);
});

test("importing the CDN verifier does not download anything", () => {
  const source = readFileSync("scripts/verify-download-cdn.mjs", "utf8");
  const guard = source.indexOf("pathToFileURL(process.argv[1]).href");
  const call = source.lastIndexOf("await verifyDownloads(");
  assert.ok(guard > 0, "no main-module guard");
  assert.ok(call > guard, "verifyDownloads must only run behind the guard");
  assert.equal(
    source.split("await verifyDownloads(").length - 1,
    1,
    "verifyDownloads is invoked more than once",
  );
});
