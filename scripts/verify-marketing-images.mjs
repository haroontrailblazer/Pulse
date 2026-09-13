import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const url =
  process.env.PULSE_MARKETING_URL || "http://localhost:5173/landing.html";
const manifest = JSON.parse(
  await readFile("public/marketing/screenshots.json", "utf8"),
);
await mkdir(".cache/playwright-quality", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
const results = [];
const checkedFiles = new Set();
try {
  for (const [name, viewport, deviceScaleFactor] of [
    ["desktop", { width: 1440, height: 1000 }, 2],
    ["mobile", { width: 390, height: 844 }, 3],
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const checkImage = async (selector) => {
      const info = await page.locator(selector).evaluate(async (img) => {
        await img.decode();
        return {
          file: decodeURIComponent(
            new URL(img.currentSrc).pathname.split("/").pop(),
          ),
          displayedWidth: img.getBoundingClientRect().width,
          requiredPixels: img.getBoundingClientRect().width * devicePixelRatio,
        };
      });
      const entry = manifest.files.find((f) => f.file === info.file);
      assert.ok(entry, `Unexpected screenshot ${info.file}`);
      if (!checkedFiles.has(info.file)) {
        const response = await page.request.get(
          new URL(`/marketing/${info.file}`, url).href,
        );
        assert.equal(response.status(), 200);
        const bytes = await response.body();
        assert.equal(bytes.readUInt32BE(16), entry.width);
        assert.equal(bytes.readUInt32BE(20), entry.height);
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          entry.sha256,
          `Served bytes differ from the Playwright capture: ${info.file}`,
        );
        checkedFiles.add(info.file);
      }
      assert.ok(
        entry.width >= info.requiredPixels,
        `${info.file} is being upscaled for this display.`,
      );
      results.push({ viewport: name, ...info, actualPixels: entry.width });
    };
    await checkImage(".screenshot-button img");
    await page.screenshot({
      path: `.cache/playwright-quality/${name}-hero.png`,
      scale: "css",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Dark screenshot", exact: true })
      .click();
    await checkImage(".screenshot-button img");
    for (const tab of [
      "Check your stack",
      "Read the latest update",
      "Understand the impact",
      "See the bigger picture",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await checkImage(".tour-screen img");
    }
    await page
      .getByRole("button", {
        name: "Enlarge See the bigger picture screenshot",
        exact: true,
      })
      .click();
    await page.locator("dialog img").evaluate((img) => img.decode());
    assert.match(
      await page.locator("dialog img").getAttribute("src"),
      /@2x\.png$/,
    );
    await page.getByRole("button", { name: "Close screenshot" }).click();
    await page.locator(".android-art").scrollIntoViewIfNeeded();
    const android = await page
      .locator(".android-art img")
      .evaluate(async (img) => {
        await img.decode();
        return {
          pixels: img.naturalWidth,
          required: img.getBoundingClientRect().width * devicePixelRatio,
        };
      });
    assert.ok(
      android.pixels >= android.required,
      "Android artwork is upscaled",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Horizontal overflow",
    );
    await context.close();
  }
  await writeFile(
    ".cache/playwright-quality/results.json",
    JSON.stringify(
      { url, verifiedAt: new Date().toISOString(), results },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
  console.log(
    "PASS: desktop/mobile image loading, sufficient source pixels, theme/tour switches, full-resolution zoom, Android art, and no horizontal overflow.",
  );
} finally {
  await browser.close();
}
