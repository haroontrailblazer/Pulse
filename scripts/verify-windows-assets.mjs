import { extractFile } from "@electron/asar";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const files = [
  "index.html",
  "favicon.svg",
  ...readdirSync("dist/assets")
    .filter((n) => /\.(js|css)$/.test(n))
    .map((n) => join("assets", n)),
  ...readdirSync("dist/brand").map((n) => join("brand", n)),
];
for (const file of files)
  if (
    sha(
      extractFile(
        "releases/win-unpacked/resources/app.asar",
        join("dist", file),
      ),
    ) !== sha(readFileSync(join("dist", file)))
  )
    throw Error("Asset mismatch " + file);
for (const file of [
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "desktop/background.cjs",
  "shared/alerts.js",
  "shared/providers.js",
  "shared/cloud-feeds.js",
  "server/status.js",
])
  if (
    sha(
      extractFile(
        "releases/win-unpacked/resources/app.asar",
        join(...file.split("/")),
      ),
    ) !== sha(readFileSync(file))
  )
    throw Error("Native source mismatch " + file);
console.log(
  `${files.length} Windows web/brand assets and seven monitoring modules match current sources.`,
);
