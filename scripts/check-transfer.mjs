// Drives the watchlist transfer panel in a real browser.
//
// Two things here cannot be checked from Node. The panel has two halves that have
// to be wired to each other -- unit-testing the codec proves neither is connected
// to the other -- and the QR is only useful if the pixels a camera would see are
// the modules the encoder produced. So this exports a code from one device, wipes
// the watchlist to imitate a second, pastes it back, and then rasterises the
// inlined SVG and samples the centre of every module back into a grid to compare
// against the encoder.
//
// Sampling rather than decoding because no barcode reader is available on this
// platform: BarcodeDetector is absent from Edge and Chrome on Windows. What that
// leaves unproven is only whether a real camera agrees, and the encoder itself is
// checked against an independent implementation in tests/qr.test.js.
//
//   node scripts/check-transfer.mjs
//
// Needs `npm run build` to have produced dist, and Edge or Chrome installed.
// PLAYWRIGHT_CHANNEL overrides which one.

import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "../server/index.js";
import { qrMatrix } from "../shared/qr.js";
import { transferLink } from "../shared/watchlist-transfer.js";

if (!existsSync("dist/index.html")) {
  console.error("dist is missing. Run `npm run build` first.");
  process.exit(1);
}

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`,
  );
};

const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".nav-item", { timeout: 20000 });

  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pulse-watchlist") || "null"),
  );
  check(
    "the device starts with a watchlist to carry",
    Array.isArray(before) && before.length > 0,
    before,
  );

  const open = async () => {
    await page.getByRole("button", { name: "Move your watchlist" }).click();
    await page.waitForSelector(".transfer-code", { timeout: 10000 });
  };
  await open();

  const code = await page
    .locator('textarea[aria-label="This device\'s transfer code"]')
    .inputValue();
  check("the panel exports a code", /^PULSE1;.*;[a-z0-9]{6}$/.test(code), {
    characters: code.length,
  });

  // ---- the square -------------------------------------------------------
  // The square holds the link form, not the bare code, so that a phone with Pulse
  // installed can open it directly. Expect what the panel draws.
  const expected = qrMatrix(transferLink(code));
  const margin = 4;
  const span = expected.size + margin * 2;
  const viewBox = await page
    .locator(".transfer-qr-plate svg")
    .getAttribute("viewBox");
  check(
    "the square spans the grid plus a quiet zone on both sides",
    viewBox === `0 0 ${span} ${span}`,
    { viewBox, modules: expected.size, version: expected.version },
  );

  const rendered = await page.evaluate(
    async ({ span, size, margin }) => {
      const svg = document.querySelector(".transfer-qr-plate svg").outerHTML;
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src =
          "data:image/svg+xml;base64," +
          btoa(unescape(encodeURIComponent(svg)));
      });
      const scale = 6;
      const canvas = document.createElement("canvas");
      canvas.width = span * scale;
      canvas.height = span * scale;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dark = (x, y) => {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        return (r + g + b) / 3 < 128;
      };
      const rows = [];
      for (let y = 0; y < size; y++) {
        let row = "";
        for (let x = 0; x < size; x++)
          row += dark(
            Math.floor((x + margin + 0.5) * scale),
            Math.floor((y + margin + 0.5) * scale),
          )
            ? "1"
            : "0";
        rows.push(row);
      }
      const edge = canvas.width - 3;
      return {
        rows,
        quiet: [
          [2, 2],
          [edge, 2],
          [2, edge],
          [edge, edge],
        ].map(([x, y]) => !dark(x, y)),
      };
    },
    { span, size: expected.size, margin },
  );

  const wanted = expected.modules.map((row) =>
    row.map((cell) => (cell ? 1 : 0)).join(""),
  );
  const wrong = wanted.filter(
    (row, index) => row !== rendered.rows[index],
  ).length;
  check(
    "every painted module is the module the encoder produced",
    wrong === 0,
    {
      rows: wanted.length,
      wrongRows: wrong,
    },
  );
  check(
    "the quiet zone is light on all four corners",
    rendered.quiet.every(Boolean),
    rendered.quiet,
  );

  // A camera needs roughly three device pixels per module to separate them.
  const plate = await page.locator(".transfer-qr-plate").boundingBox();
  const perModule = (plate.width - 24) / span;
  check(
    "the square is drawn with enough pixels per module to scan",
    perModule >= 3,
    { plateWidth: Math.round(plate.width), perModule: perModule.toFixed(2) },
  );

  // The plate has to stay light when the app does not, or some readers refuse it.
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  const plateColour = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector(".transfer-qr-plate"))
        .backgroundColor,
  );
  check(
    "the plate stays white in the dark theme",
    /255,\s*255,\s*255/.test(plateColour),
    plateColour,
  );
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });

  // ---- carrying it to a second device -----------------------------------
  await page.evaluate(() => {
    localStorage.setItem("pulse-watchlist", "[]");
    localStorage.removeItem("pulse-custom-providers");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".nav-item", { timeout: 20000 });
  await open();

  await page.locator('textarea[placeholder="PULSE1;…"]').fill(code);
  await page.waitForSelector(".transfer-preview", { timeout: 10000 });
  const preview = await page.locator(".transfer-preview").innerText();
  check(
    "it says what will change before anything changes",
    new RegExp(`Adds\\s+${before.length}\\b`).test(
      preview.replace(/\s+/g, " "),
    ),
    preview.replace(/\s+/g, " ").slice(0, 80),
  );

  await page.getByRole("button", { name: "Add to this device" }).click();
  await page.waitForSelector(".transfer-applied", { timeout: 10000 });
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pulse-watchlist") || "null"),
  );
  check(
    "the watchlist arrived intact",
    JSON.stringify(after) === JSON.stringify(before),
    { after, expected: before },
  );

  // Merging, not replacing: applying the same code again must add nothing.
  await page.locator('textarea[placeholder="PULSE1;…"]').fill(code);
  await page.waitForTimeout(200);
  const repeat = await page.locator(".transfer-preview").innerText();
  check(
    "applying a code twice adds nothing the second time",
    /Adds\s+0\b/.test(repeat.replace(/\s+/g, " ")),
    repeat.replace(/\s+/g, " ").slice(0, 60),
  );

  // ---- arriving from a scan ---------------------------------------------
  // Both natives hand a scanned code over as ?transfer=. The panel has to open
  // with it already in the field, and the address has to lose it again, because a
  // code left in a URL is a watchlist left in browser history.
  await page.evaluate(() => {
    localStorage.setItem("pulse-watchlist", "[]");
  });
  await page.goto(
    `${origin}/?transfer=${encodeURIComponent(code)}&utm_source=x`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForSelector(".transfer-preview", { timeout: 20000 });
  const handed = await page
    .locator('textarea[placeholder="PULSE1;…"]')
    .inputValue();
  check("a handed-in code opens the panel already filled in", handed === code, {
    characters: handed.length,
  });
  const url = await page.evaluate(() => location.href);
  // Only the code is asserted gone. Anything else on the arrival URL may also have
  // gone, and that is navigation.js working as documented rather than a bug here:
  // opening the panel pushes an entry, and every entry after the arrival is a clean
  // path. The arrival entry still holds those parameters.
  check(
    "the code is taken out of the address",
    !url.includes("transfer="),
    url.replace(origin, ""),
  );
  const appliedYet = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pulse-watchlist") || "null"),
  );
  check(
    "arriving from a camera is not consent: nothing is applied until asked",
    Array.isArray(appliedYet) && appliedYet.length === 0,
    appliedYet,
  );

  // And a code that lost its tail is refused in the field, not only in a unit test.
  await page
    .locator('textarea[placeholder="PULSE1;…"]')
    .fill(code.slice(0, code.length - 8));
  await page.waitForSelector(".custom-error", { timeout: 10000 });
  const error = await page.locator(".custom-error").innerText();
  check(
    "a truncated paste is refused with a sentence",
    /incomplete/i.test(error),
    error.trim(),
  );
} finally {
  await browser.close();
  server.close();
}

mkdirSync("test-results", { recursive: true });
const failed = results.filter((entry) => !entry.ok);
writeFileSync(
  "test-results/transfer-check.json",
  JSON.stringify(
    { status: failed.length ? "failed" : "passed", checks: results },
    null,
    2,
  ),
);
console.log(
  failed.length
    ? `\n${failed.length} of ${results.length} checks failed`
    : `\nall ${results.length} transfer checks passed`,
);
process.exit(failed.length ? 1 : 0);
