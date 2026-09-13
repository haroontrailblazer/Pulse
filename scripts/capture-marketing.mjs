import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const origin =
  process.env.PULSE_CAPTURE_URL || "https://pulse-status-zeta.vercel.app/app";
const viewport = { width: 1440, height: 900 };
const deviceScaleFactor = 2;
const output = resolve("public/marketing");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("pulse-theme", "light");
    localStorage.setItem(
      "pulse-watchlist",
      JSON.stringify([
        "openai",
        "anthropic",
        "cloudflare",
        "github",
        "npm",
        "pypi",
      ]),
    );
  });
  const page = await context.newPage();
  const responsePromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/status" && r.status() === 200,
    { timeout: 45000 },
  );
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const data = await (await responsePromise).json();
  if (!data.providers?.some((p) => p.checkedAt && !p.stale))
    throw new Error("No current official readings available for capture.");
  await page
    .getByRole("button", { name: /[1-9]\d*\/28 feeds current/ })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  const actual = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scale: devicePixelRatio,
  }));
  if (
    actual.width !== viewport.width ||
    actual.height !== viewport.height ||
    actual.scale !== deviceScaleFactor
  )
    throw new Error(`Unexpected capture geometry: ${JSON.stringify(actual)}`);
  const files = [];
  const capture = async (name) => {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    for (const [scale, suffix, factor] of [
      ["css", "", 1],
      ["device", "@2x", 2],
    ]) {
      const file = `${name}${suffix}.png`;
      const image = await page.screenshot({
        path: resolve(output, file),
        type: "png",
        scale,
        fullPage: false,
        animations: "disabled",
      });
      const width = image.readUInt32BE(16),
        height = image.readUInt32BE(20);
      if (
        width !== viewport.width * factor ||
        height !== viewport.height * factor
      )
        throw new Error(`Incorrect dimensions for ${file}: ${width}x${height}`);
      files.push({
        file,
        width,
        height,
        bytes: image.length,
        sha256: createHash("sha256").update(image).digest("hex"),
      });
      console.log(
        `${file}: ${width}x${height}, ${Math.round(image.length / 1024)} KiB, lossless PNG`,
      );
    }
  };
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await capture("overview");
  await navigation
    .getByRole("button", { name: "Global map", exact: true })
    .click();
  await capture("map-light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await capture("map-dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await navigation.getByRole("button", { name: /^Incidents/ }).click();
  await capture("incidents");
  await navigation
    .getByRole("button", { name: "Dependency insights", exact: true })
    .click();
  await capture("insights");
  await writeFile(
    resolve(output, "screenshots.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        sourceUrl: origin,
        source:
          "Actual Pulse application using official status feeds. Screenshots are illustrative snapshots, not current readings.",
        tool: "Playwright",
        browser: browser.version(),
        viewport,
        deviceScaleFactor,
        format: "Lossless PNG",
        fontsReady: true,
        files,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
