import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
