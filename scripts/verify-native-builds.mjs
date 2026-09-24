import { extractFile, listPackage } from "@electron/asar";
import yauzl from "yauzl";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import assert from "node:assert/strict";
import { buildIdentity } from "./build-identity.mjs";

const identity = buildIdentity();
const unpacked = "releases/win-unpacked";
const windows = `${unpacked}/resources/app.asar`;
const apk = `releases/Pulse-${identity.version}-Android.apk`;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const forbidden = /(^|\/)dist\/(downloads|marketing)\/|\.(apk|exe)$/i;
const winFiles = listPackage(windows).map((f) => f.replaceAll("\\", "/"));
assert.ok(!winFiles.some((f) => forbidden.test(f)), "Windows contains installers or marketing assets");

// An upgrade is not an install, and only the upgrade path has this limit.
// Before NSIS replaces anything it renames every installed file to
// $PLUGINSDIR\old-install\<the same relative path>, and NSIS is not long-path
// aware, so that rename is capped at MAX_PATH. $PLUGINSDIR sits under
// %LOCALAPPDATA%\Temp, which is longer than the install directory, and its
// length depends on the reader's Windows user name -- so a path that installs
// cleanly here can still be unupgradable on someone else's machine. One failed
// rename aborts the old uninstaller with exit 2; the installer retries it five
// times and then waits on a RETRY/CANCEL dialog hidden behind "Installing,
// please wait...", which is exactly how 1.0.28 shipped. Walk the packaged tree
// rather than the asar: the files that broke it were in app.asar.unpacked.
const worstPluginsDir = `C:\\Users\\${"u".repeat(28)}\\AppData\\Local\\Temp\\nsA1B2C.tmp\\old-install\\`;
const pathBudget = 260 - worstPluginsDir.length;
const packaged = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else packaged.push(relative(unpacked, full));
  }
})(unpacked);
const overBudget = packaged.filter((path) => path.length > pathBudget).sort((a, b) => b.length - a.length);
const longestPath = packaged.reduce((longest, path) => Math.max(longest, path.length), 0);
assert.ok(
  overBudget.length === 0,
  `${overBudget.length} Windows path(s) over the ${pathBudget}-character upgrade budget, longest ${overBudget[0]?.length}: ${overBudget[0]}`,
);
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
writeFileSync("test-results/native-parity.json", JSON.stringify({ ...identity, identicalWebFiles: webFiles, androidBytes: statSync(apk).size, windowsBytes: statSync(`releases/Pulse-${identity.version}-Windows.exe`).size, windowsFiles: packaged.length, longestWindowsPath: longestPath, upgradePathBudget: pathBudget }, null, 2));
console.log(`Verified ${webFiles} identical app assets in APK and Windows; source ${identity.sourceHash.slice(0, 12)}.`);
console.log(`Windows package: ${packaged.length} files, longest path ${longestPath} of ${pathBudget} allowed for an upgrade rename.`);
