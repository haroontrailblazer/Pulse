import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qrMatrix, qrSvg } from "../shared/qr.js";
import { encodeTransfer } from "../shared/watchlist-transfer.js";
import { providers } from "../shared/providers.js";

// These are not expectations someone wrote down. Each one is output from this
// encoder that was compared, module for module, against Python's `qrcode`
// library -- an implementation that shares no code with this one -- and matched
// exactly. Between them they cover versions 1, 6, 10 and 16, so both
// character-count widths, single-block and multi-block interleaving, the version
// information that only exists from version 7, four different masks, and a
// payload that is not ASCII.
//
// Two real defects were found by that comparison and neither was visible by
// reading the code: the format bits were placed least-significant first, and the
// generator polynomial was built constant-term first and consumed as though it
// were the other way round. Both produce something that looks exactly like a QR
// code and decodes as nothing at all, which is the failure this file exists to
// prevent coming back.
const fixtures = JSON.parse(readFileSync("tests/qr-fixtures.json", "utf8"));

for (const fixture of fixtures)
  test(`version ${fixture.version} mask ${fixture.mask} still encodes exactly as verified`, () => {
    const { size, modules, version, mask } = qrMatrix(fixture.text);
    assert.equal(version, fixture.version);
    assert.equal(mask, fixture.mask);
    assert.equal(size, fixture.size);
    const rows = modules.map((row) =>
      row.map((cell) => (cell ? 1 : 0)).join(""),
    );
    // Compared row by row so a failure names where it went wrong rather than
    // printing two matrices.
    for (let y = 0; y < size; y++)
      assert.equal(
        rows[y],
        fixture.rows[y],
        `row ${y} of a version ${version} code`,
      );
  });

test("the grid is the size the version says it is", () => {
  for (const length of [1, 40, 120, 300]) {
    const { size, version } = qrMatrix("x".repeat(length));
    assert.equal(size, version * 4 + 17);
  }
});

test("the three finder patterns are where a scanner looks for them", () => {
  const { size, modules } = qrMatrix(encodeTransfer({ watchlist: ["openai"] }));
  for (const [ox, oy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ])
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        assert.equal(
          modules[oy + y][ox + x],
          ring !== 2,
          `finder at ${ox},${oy} is wrong at ${x},${y}`,
        );
      }
});

test("the timing patterns alternate the whole way across", () => {
  const { size, modules } = qrMatrix("x".repeat(200));
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6][i], i % 2 === 0, `horizontal timing at ${i}`);
    assert.equal(modules[i][6], i % 2 === 0, `vertical timing at ${i}`);
  }
});

test("the module that is always dark, is", () => {
  const { size, modules } = qrMatrix("x".repeat(60));
  assert.equal(modules[size - 8][8], true);
});

test("a real transfer code fits in a square a phone can read", () => {
  // Ten services and an added page is a realistic watchlist, and it measures at
  // version 11 -- 61 modules. The panel renders the square at 280 CSS pixels, so
  // that is about 4.6 device pixels per module before any display scaling, which
  // is comfortably above the three a camera needs to separate them. 73 modules is
  // where this stops being true at that size, so that is the bound.
  const code = encodeTransfer({
    watchlist: providers.slice(0, 10).map((provider) => provider.id),
    custom: [{ url: "https://status.example.com", name: "Example" }],
  });
  const { size } = qrMatrix(code);
  assert.ok(size <= 73, `a ten-service code needs ${size} modules`);
});

test("the whole catalogue now gets a square", () => {
  // It did not, before the payload stopped going through JSON and base64: the same
  // watchlist was 1,104 characters and no version this encoder draws could hold
  // it, so the reader who watched everything was the one reader who could not scan.
  const everything = encodeTransfer({
    watchlist: providers.map((provider) => provider.id),
  });
  const { version, size } = qrMatrix(everything);
  assert.ok(version <= 22, `the whole catalogue needs version ${version}`);
  assert.ok(size <= 105, `${size} modules`);
});

test("a payload past the ceiling is refused, not silently truncated", () => {
  // 1,059 bytes is the most a version 26 symbol at this error level holds. Past
  // that the panel offers the code without a square; what it must never do is draw
  // a square holding part of a watchlist.
  assert.doesNotThrow(() => qrMatrix("A".repeat(1059)));
  assert.throws(
    () => qrMatrix("A".repeat(1060)),
    /more than a version 26 QR code holds/,
  );
});

test("the svg draws one path and carries a quiet zone", () => {
  const svg = qrSvg("PULSE1.abc");
  // A version 10 code is over 1,500 dark modules. As individual rects that is a
  // measurable amount of DOM for a picture that never changes.
  assert.equal(svg.match(/<path/g).length, 1);
  assert.ok(!/<rect[^>]*x=/.test(svg), "modules should not be drawn as rects");
  // 21 modules plus a 4-module quiet zone on each side. Scanners need the margin.
  assert.match(svg, /viewBox="0 0 29 29"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test("the svg is self-contained, so it can be inlined anywhere", () => {
  const svg = qrSvg("PULSE1.abc");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(!/<image|<use|href=/.test(svg), "no external references");
});
