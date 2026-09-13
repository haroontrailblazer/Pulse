import { extractFile, listPackage } from "@electron/asar";
import yauzl from "yauzl";
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import assert from "node:assert/strict";
import { buildIdentity } from "./build-identity.mjs";

const identity = buildIdentity();
const windows = "releases/win-unpacked/resources/app.asar";
const apk = `releases/Pulse-${identity.version}-Android.apk`;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const forbidden = /(^|\/)dist\/(downloads|marketing)\/|\.(apk|exe)$/i;
const winFiles = listPackage(windows).map((f) => f.replaceAll("\\", "/"));
assert.ok(!winFiles.some((f) => forbidden.test(f)), "Windows contains installers or marketing assets");
const winIdentity = JSON.parse(extractFile(windows, join("dist", "pulse-build.json")));
assert.deepEqual(winIdentity, identity, "Windows build is stale");
let androidIdentity, webFiles = 0;
await new Promise((resolve, reject) => {
  yauzl.open(apk, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry) => {
      const name = entry.fileName;
      if (/\/$/.test(name)) return zip.readEntry();
      if (/\.(apk|exe)$/i.test(name) || /^assets\/public\/(downloads|marketing)\//.test(name)) {
        zip.close(); return reject(new Error(`Nested delivery asset: ${name}`));
      }
      if (!name.startsWith("assets/public/")) return zip.readEntry();
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => {
          try {
            const data = Buffer.concat(chunks);
            const relative = name.slice("assets/public/".length);
            if (relative === "pulse-build.json") androidIdentity = JSON.parse(data);
            // Capacitor injects bridge files; the app's HTML, CSS, JS, fonts,
            // logos and icons must be byte-identical to the Windows build.
            if (!/^capacitor|^cordova/.test(relative)) {
              assert.equal(sha(data), sha(extractFile(windows, join("dist", ...relative.split("/")))), `Platform asset mismatch: ${relative}`);
              webFiles++;
            }
            zip.readEntry();
          } catch (error) { zip.close(); reject(error); }
        });
      });
    });
    zip.readEntry();
  });
});
assert.deepEqual(androidIdentity, identity, "Android build is stale");
assert.ok(statSync(apk).size < 15_000_000, "APK exceeds the 15 MB size guard; investigate before publishing");
assert.ok(webFiles > 10, "Expected app assets were not found");
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/native-parity.json", JSON.stringify({ ...identity, identicalWebFiles: webFiles, androidBytes: statSync(apk).size, windowsBytes: statSync(`releases/Pulse-${identity.version}-Windows.exe`).size }, null, 2));
console.log(`Verified ${webFiles} identical app assets in APK and Windows; source ${identity.sourceHash.slice(0, 12)}.`);
