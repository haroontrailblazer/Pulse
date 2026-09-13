import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { watch } from "node:fs";

const watchedRoots = ["src", "shared", "server", "public", "desktop", "android/app/src/main/java", "android/app/src/main/res", "package.json", "package-lock.json", "vite.config.js", "android/app/build.gradle", "scripts"];
const skip = new Set([
  "node_modules",
  ".git",
  ".cache",
  "releases",
  "dist",
  "downloads",
  "release-assets.json",
]);

function shouldIgnore(filePath) {
  const clean = filePath.replaceAll("\\", "/");
  const parts = clean.split("/");
  return [...skip].some((segment) => parts.includes(segment));
}

let timer = null;
let building = false;
let queued = false;

function runBuild() {
  if (building) {
    queued = true;
    return;
  }

  building = true;
  console.log(`[watch] Change detected. Rebuilding portable downloads at ${new Date().toLocaleTimeString()}`);

  const [command, args] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/c", "npm.cmd run build:all-downloads"]]
      : ["npm", ["run", "build:all-downloads"]];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: "pipe",
  });

  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));

  child.on("close", (code) => {
    building = false;
    if (code !== 0) {
      console.error(`[watch] build:all-downloads failed with code ${code}`);
    } else {
      console.log("[watch] Rebuild complete.");
    }
    if (queued) {
      queued = false;
      runBuild();
    }
  });
}

for (const root of watchedRoots) {
  if (!existsSync(root)) continue;
  watch(root, { recursive: true }, (_eventType, fileName) => {
    if (!fileName || shouldIgnore(`${root}/${fileName}`)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => runBuild(), 1200);
  });
}

console.log("[watch] Monitoring web source paths for rebuild: src, shared, marketing, design, server, public");
console.log("[watch] Press Ctrl+C to stop. Each change triggers npm run build:all-downloads.");

runBuild();
