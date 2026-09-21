import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { stageAsset } from "../scripts/prepare-downloads.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "pulse-download-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = Buffer.from([
    0x4d, 0x5a, 0x00, 0xff, 0x50, 0x75, 0x6c, 0x73, 0x65,
  ]);
  return {
    content,
    asset: {
      name: "Pulse-1.0.2-Windows.exe",
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    },
    options: {
      source: "https://example.invalid/releases/v1.0.2",
      cacheDir: join(root, "cache"),
      outputDir: join(root, "output"),
    },
  };
}

test("download mirror preserves exact binary bytes and reuses only a verified cache", async (t) => {
  const { content, asset, options } = await fixture(t);
  let requests = 0;
  options.fetcher = async () => {
    requests++;
    return new Response(content);
  };
  await stageAsset(asset, options);
  assert.deepEqual(
    await readFile(join(options.outputDir, asset.name)),
    content,
  );
  await stageAsset(asset, options);
  assert.equal(requests, 1);
  await writeFile(
    join(options.cacheDir, asset.name),
    Buffer.alloc(content.length),
  );
  await stageAsset(asset, options);
  assert.equal(requests, 2);
  assert.deepEqual(
    await readFile(join(options.outputDir, asset.name)),
    content,
  );
});

test("download mirror refuses altered, truncated, oversized, and failed downloads", async (t) => {
  for (const [name, response] of [
    ["altered", () => new Response(Buffer.alloc(9))],
    ["truncated", () => new Response(Buffer.alloc(2))],
    ["oversized", () => new Response(Buffer.alloc(10))],
    ["HTTP error", () => new Response("unavailable", { status: 503 })],
  ]) {
    await t.test(name, async (t) => {
      const { asset, options } = await fixture(t);
      await assert.rejects(
        stageAsset(asset, { ...options, fetcher: async () => response() }),
      );
      await assert.rejects(access(join(options.outputDir, asset.name)));
      await assert.rejects(
        access(join(options.cacheDir, `${asset.name}.partial`)),
      );
    });
  }
});

// The deploy guard's one escape hatch, and the reason it is narrow.
//
// The installers a deployment offers are normally built from the same source as
// the site -- one product, three surfaces, shipped together. AGENTS.md allows a
// deliberately web-only change with explicit confirmation, so the site may run
// ahead of the installers, but only at a source someone wrote down: the hash
// lives in the manifest, it is visible in the diff, and the next edit to any
// fingerprinted file invalidates it again. That is what keeps a web-only deploy
// a decision rather than the default.
test("a web-only deploy is recorded, not assumed", () => {
  const guard = readFileSync(
    new URL("../scripts/prepare-downloads.mjs", import.meta.url),
    "utf8",
  );
  // Both hashes are consulted, and the recorded one is the only way past.
  assert.match(guard, /const built = manifest\.sourceHash === identity\.sourceHash;/);
  assert.match(guard, /const webOnly = manifest\.webOnly\?\.sourceHash === identity\.sourceHash;/);
  assert.match(guard, /if \(!built && !webOnly\)/);
  // An environment variable would let a deploy opt itself out with nothing in
  // the repository to show for it, which is the opposite of the point.
  assert.doesNotMatch(
    guard.slice(guard.indexOf("async function main()")),
    /process\.env/,
    "the acknowledgement must live in the manifest, not in the environment",
  );
  // What it does not relax. The version still has to match, and the bytes are
  // still fetched and hashed, so a visitor is offered exactly what is named.
  assert.match(guard, /manifest\.version !== releaseVersion/);
  assert.match(guard, /await stageAsset\(asset, \{ source, cacheDir, outputDir \}\)/);
  // And it says so out loud in the build log, with the reason it was given.
  assert.match(guard, /Web-only deploy: the site is ahead of/);
  assert.match(guard, /manifest\.webOnly\.reason/);
});

test("the shipped manifest still names the installers it was built from", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../shared/release-assets.json", import.meta.url), "utf8"),
  );
  // `sourceHash` is always the installers' own source. A web-only deploy adds a
  // second hash beside it rather than overwriting the first, so what the
  // binaries were built from is never lost.
  assert.match(manifest.sourceHash, /^[a-f0-9]{64}$/);
  if (!manifest.webOnly) return;
  assert.match(manifest.webOnly.sourceHash, /^[a-f0-9]{64}$/);
  assert.notEqual(
    manifest.webOnly.sourceHash,
    manifest.sourceHash,
    "a web-only record that matches the installers is a leftover, not a deploy",
  );
  assert.ok(
    manifest.webOnly.reason?.length > 20,
    "a web-only deploy has to say what it is for",
  );
});
