import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  downloadBudgetMs,
  MIN_BYTES_PER_SECOND,
} from "../scripts/verify-download-cdn.mjs";

test("the CDN download budget scales with the asset instead of a flat timeout", () => {
  const manifest = JSON.parse(
    readFileSync("shared/release-assets.json", "utf8"),
  );
  const apk = manifest.assets.find((a) => a.name.endsWith(".apk"));
  const exe = manifest.assets.find((a) => a.name.endsWith(".exe"));

  // The old flat 300s aborted a healthy 105MB download on a slow link; the EXE
  // must now get far longer than that, and far longer than the small APK.
  assert.ok(
    downloadBudgetMs(exe.bytes) > 300_000,
    "the EXE still cannot finish",
  );
  assert.ok(
    downloadBudgetMs(exe.bytes) > downloadBudgetMs(apk.bytes) * 5,
    "a 16x larger asset must get a proportionally larger budget",
  );

  // A budget that covers the slowest transfer actually observed from this link
  // (~100 KB/s), with headroom.
  assert.ok(
    downloadBudgetMs(exe.bytes) > (exe.bytes / 100_000) * 1000,
    "the budget is tighter than a real observed transfer",
  );

  // It still has to catch a genuinely stalled transfer rather than hang.
  assert.ok(
    downloadBudgetMs(exe.bytes) < 60 * 60_000,
    "the budget is effectively infinite",
  );
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

  // Monotonic: a bigger asset never gets less time.
  let previous = 0;
  for (let bytes = 0; bytes <= 200_000_000; bytes += 5_000_000) {
    const budget = downloadBudgetMs(bytes);
    assert.ok(budget >= previous, `budget shrank at ${bytes} bytes`);
    previous = budget;
  }
  assert.ok(MIN_BYTES_PER_SECOND > 0);
});

test("importing the CDN verifier does not download anything", async () => {
  // The module is imported at the top of this file; if it ran its main block it
  // would have fetched two installers before any test executed.
  const source = readFileSync("scripts/verify-download-cdn.mjs", "utf8");
  // Position-based rather than line-based, so reformatting cannot fake a pass.
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
