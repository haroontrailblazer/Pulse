import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseVersion } from "../shared/downloads.js";

const root = resolve(import.meta.dirname, "..");
const resultsDirectory = join(root, "test-results");
const defaultOrigin = "https://pulse-status-zeta.vercel.app";
const desktopPort = 47823;

const sleep = (milliseconds) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function usage() {
  console.log(`Pulse release harness

Usage:
  node scripts/release-harness.mjs prepare [--launch-native] [--android-serial SERIAL]
  node scripts/release-harness.mjs verify-live [--url URL] [--wait-seconds SECONDS]

prepare builds and verifies the web app, APK, and portable Windows EXE. Add
--launch-native to install and open the APK on one connected ADB device and
to open the Windows EXE against its bundled local server.

verify-live requires the current HEAD to be on origin/main. It waits for the
production CDN, verifies both installer bytes and ranges, and checks the live
marketing page, dashboard, and status API.
`);
}

export function parseHarnessArgs(argv) {
  const [requestedCommand = "help", ...rest] = argv;
  const command =
    requestedCommand === "--help" || requestedCommand === "-h"
      ? "help"
      : requestedCommand;
  const options = {
    command,
    launchNative: false,
    keepNativeOpen: false,
    allowPublishedVersion: false,
    androidSerial: null,
    origin: process.env.PULSE_RELEASE_URL || defaultOrigin,
    waitSeconds: 900,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = () => {
      const next = rest[index + 1];
      if (!next || next.startsWith("--"))
        throw new Error(`${argument} requires a value`);
      index += 1;
      return next;
    };
    if (argument === "--launch-native") options.launchNative = true;
    else if (argument === "--keep-native-open") options.keepNativeOpen = true;
    else if (argument === "--allow-published-version")
      options.allowPublishedVersion = true;
    else if (argument === "--android-serial") options.androidSerial = value();
    else if (argument === "--url") options.origin = value();
    else if (argument === "--wait-seconds") {
      const seconds = Number(value());
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800)
        throw new Error("--wait-seconds must be an integer from 1 to 1800");
      options.waitSeconds = seconds;
    } else if (argument === "--help" || argument === "-h") options.command = "help";
    else throw new Error(`Unknown harness option: ${argument}`);
  }
  if (!["prepare", "verify-live", "help"].includes(options.command))
    throw new Error(`Unknown harness command: ${options.command}`);
  if (options.keepNativeOpen && !options.launchNative)
    throw new Error("--keep-native-open requires --launch-native");
  options.origin = new URL(options.origin).origin;
  return options;
}

export function parseChecksumManifest(text) {
  const entries = new Map();
  for (const rawLine of text.trim().split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const match = rawLine.match(/^([A-Fa-f0-9]{64}) {2}(.+)$/);
    if (!match) throw new Error(`Invalid checksum manifest line: ${rawLine}`);
    if (entries.has(match[2]))
      throw new Error(`Duplicate checksum manifest entry: ${match[2]}`);
    entries.set(match[2], match[1].toLowerCase());
  }
  return entries;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function readReleaseContract() {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(
    await readFile(join(root, "shared", "release-assets.json"), "utf8"),
  );
  const gradle = await readFile(join(root, "android", "app", "build.gradle"), "utf8");
  const version = packageJson.version;
  const names = [
    `Pulse-${version}-Android.apk`,
    `Pulse-${version}-Windows.exe`,
  ];

  assert.match(version, /^\d+\.\d+\.\d+$/, "package version must be x.y.z");
  assert.equal(
    releaseVersion,
    version,
    "shared/downloads.js must use the package version",
  );
  assert.equal(
    manifest.version,
    version,
    "release-assets.json must use the package version",
  );
  assert.match(
    gradle,
    new RegExp(`versionName\\s+["']${version.replaceAll(".", "\\.")}["']`),
    "Android versionName must use the package version",
  );
  assert.deepEqual(
    manifest.assets.map((asset) => asset.name).sort(),
    names.sort(),
    "release manifest must contain exactly the versioned APK and EXE",
  );
  for (const asset of manifest.assets) {
    assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, `${asset.name} has invalid byte count`);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/, `${asset.name} has invalid SHA-256`);
  }
  assert.match(manifest.sourceHash, /^[a-f0-9]{64}$/, "release manifest has invalid source fingerprint");
  return { version, manifest, names };
}

function run(command, args, label, { capture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    console.log(`\n[harness] ${label}`);
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
    }
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`${label} failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

function runNpm(args, label) {
  return process.platform === "win32"
    ? run("cmd.exe", ["/d", "/c", "npm.cmd", ...args], label)
    : run("npm", args, label);
}

async function writeReport(name, report) {
  await mkdir(resultsDirectory, { recursive: true });
  const path = join(resultsDirectory, `release-harness-${name}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[harness] Wrote ${path}`);
}

async function ensureVersionIsAvailable(version, allowPublishedVersion) {
  const response = await fetch(
    `https://api.github.com/repos/haroontrailblazer/Pulse/releases/tags/v${version}`,
    { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30000) },
  );
  if (response.status === 404) return false;
  if (!response.ok)
    throw new Error(`Could not check GitHub release v${version}: HTTP ${response.status}`);
  const release = await response.json();
  if (!allowPublishedVersion && !release.draft)
    throw new Error(
      `v${version} is already published. Bump package.json, Android, downloads, and release metadata before preparing another release.`,
    );
  return !release.draft;
}

async function verifyLocalArtifacts(contract) {
  const results = [];
  for (const asset of contract.manifest.assets) {
    const path = join(root, "releases", asset.name);
    const details = await stat(path);
    const digest = await sha256(path);
    assert.equal(details.size, asset.bytes, `${asset.name} byte count does not match release metadata`);
    assert.equal(digest, asset.sha256, `${asset.name} SHA-256 does not match release metadata`);
    results.push({ name: asset.name, bytes: details.size, sha256: digest });
  }
  return results;
}

function checkDesktopPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", (error) => rejectPort(error));
    server.listen(desktopPort, "127.0.0.1", () =>
      server.close((error) => (error ? rejectPort(error) : resolvePort())),
    );
  });
}

async function waitForHttp(url, milliseconds) {
  const deadline = Date.now() + milliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "unavailable"}`);
}

function stopWindowsTree(pid) {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
}

async function smokeWindows(contract, keepOpen) {
  if (process.platform !== "win32")
    throw new Error("Windows launch verification must run on Windows");
  try {
    await checkDesktopPort();
  } catch {
    throw new Error(`Port ${desktopPort} is in use. Quit the running Pulse app before Windows launch verification.`);
  }
  const executable = join(root, "releases", `Pulse-${contract.version}-Windows.exe`);
  const child = spawn(executable, [], {
    cwd: root,
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await sleep(1500);
    if (child.exitCode !== null)
      throw new Error(`Windows executable exited during launch with code ${child.exitCode}`);
    // The portable build unpacks ~105 MB to a temp directory on every launch,
    // which measures about 25 seconds here. Fifteen was below the floor for a
    // healthy EXE, so the gate failed on timing rather than on the app.
    const response = await waitForHttp(`http://127.0.0.1:${desktopPort}/`, 90000);
    const html = await response.text();
    assert.match(html, /Pulse/i, "Windows bundled server did not serve the app");
    return { executable, pid: child.pid, localServer: response.status };
  } finally {
    if (!keepOpen && child.pid) stopWindowsTree(child.pid);
  }
}

function adbExecutable() {
  const executable = process.platform === "win32" ? "adb.exe" : "adb";
  const homes = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(root, ".cache", "android-toolchain", "sdk"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
  ].filter(Boolean);
  const configured = homes.map((home) => join(home, "platform-tools", executable));
  return configured.find(existsSync) || executable;
}

async function runAdb(adb, args, label) {
  return run(adb, args, label, { capture: true });
}

async function smokeAndroid(contract, serial, keepOpen) {
  const adb = adbExecutable();
  const devices = await runAdb(adb, ["devices"], "discover Android device");
  const connected = devices.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === "device")
    .map(([id]) => id);
  const selected = serial || (connected.length === 1 ? connected[0] : null);
  if (!selected)
    throw new Error(
      `Android launch verification requires exactly one connected ADB device or --android-serial. Found: ${connected.join(", ") || "none"}`,
    );
  if (!connected.includes(selected))
    throw new Error(`Android device ${selected} is not connected and authorized`);
  const debugApk = join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  assert.ok(existsSync(debugApk), "Android debug APK is missing after build");
  const target = ["-s", selected];
  await runAdb(adb, [...target, "install", "-r", debugApk], "install Android APK");
  try {
    const started = await runAdb(
      adb,
      [...target, "shell", "am", "start", "-W", "-n", "app.pulse.status/.MainActivity"],
      "launch Android APK",
    );
    assert.match(started.stdout, /Status:\s*ok|Activity:/i, "Android activity did not report a successful launch");
    const pid = await runAdb(adb, [...target, "shell", "pidof", "app.pulse.status"], "verify Android process");
    assert.ok(pid.stdout.trim(), "Android app process is not running after launch");
    return { serial: selected, apk: `Pulse-${contract.version}-Android.apk`, pid: pid.stdout.trim() };
  } finally {
    if (!keepOpen)
      await runAdb(adb, [...target, "shell", "am", "force-stop", "app.pulse.status"], "stop Android smoke test");
  }
}

async function prepare(options) {
  const startedAt = new Date().toISOString();
  const contract = await readReleaseContract();
  const alreadyPublished = await ensureVersionIsAvailable(
    contract.version,
    options.allowPublishedVersion,
  );
  const steps = [];
  for (const [name, args] of [
    ["tests", ["test"]],
    ["web build", ["run", "build:web"]],
    ["Android build and unit tests", ["run", "build:android"]],
    ["Windows build", ["run", "build:windows"]],
    ["release metadata", ["run", "sync:metadata"]],
    ["native parity", ["run", "verify:native"]],
  ]) {
    const began = Date.now();
    await runNpm(args, name);
    steps.push({ name, seconds: Number(((Date.now() - began) / 1000).toFixed(2)) });
  }
  const artifacts = await verifyLocalArtifacts(await readReleaseContract());
  const launches = options.launchNative
    ? {
        windows: await smokeWindows(contract, options.keepNativeOpen),
        android: await smokeAndroid(contract, options.androidSerial, options.keepNativeOpen),
      }
    : { skipped: "Pass --launch-native to verify real Windows and Android launches." };
  const report = {
    status: "passed",
    command: "prepare",
    startedAt,
    completedAt: new Date().toISOString(),
    version: contract.version,
    publishedVersionOverride: alreadyPublished,
    steps,
    artifacts,
    launches,
  };
  await writeReport("prepare", report);
  return report;
}

async function git(command, args, label) {
  return run(command, args, label, { capture: true });
}

async function assertHeadIsPushed() {
  await git("git", ["fetch", "origin", "main"], "fetch origin/main");
  const check = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], {
    cwd: root,
    stdio: "ignore",
  });
  if (check.status !== 0)
    throw new Error("Current HEAD is not on origin/main. Push the release commit before live verification.");
  const head = await git("git", ["rev-parse", "HEAD"], "read pushed commit");
  return head.stdout.trim();
}

async function waitForCdn(contract, origin, waitSeconds) {
  const manifestUrl = `${origin}/downloads/v${contract.version}/SHA256SUMS.txt`;
  const deadline = Date.now() + waitSeconds * 1000;
  let lastStatus = "not requested";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(manifestUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      lastStatus = `HTTP ${response.status}`;
      if (response.ok) {
        const checksums = parseChecksumManifest(await response.text());
        for (const asset of contract.manifest.assets)
          assert.equal(
            checksums.get(asset.name),
            asset.sha256,
            `CDN checksum manifest is stale for ${asset.name}`,
          );
        return { manifestUrl, checksums: Object.fromEntries(checksums) };
      }
    } catch (error) {
      lastStatus = error.message;
    }
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for production release manifest ${manifestUrl}: ${lastStatus}`);
}

async function verifyPublicPages(contract, origin) {
  const api = await fetch(`${origin}/api/status`, { signal: AbortSignal.timeout(30000) });
  assert.ok(api.ok, `Production status API failed: HTTP ${api.status}`);
  const snapshot = await api.json();
  assert.ok(Array.isArray(snapshot.providers), "Production status API returned no provider array");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  });
  try {
    const landing = await browser.newPage();
    await landing.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 60000 });
    const hrefs = await landing.locator("a").evaluateAll((links) => links.map((link) => link.href));
    for (const asset of contract.manifest.assets)
      assert.ok(hrefs.some((href) => href.includes(asset.name)), `Marketing page has no ${asset.name} download link`);
    const dashboard = await browser.newPage();
    await dashboard.goto(`${origin}/app`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dashboard.getByRole("heading", { name: "Service directory", exact: false }).waitFor({ timeout: 30000 });
    const layout = await dashboard.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(layout.scrollWidth <= layout.width, "Production dashboard has horizontal page overflow");
    return {
      marketingTitle: await landing.title(),
      dashboardTitle: await dashboard.title(),
      providerCount: snapshot.providers.length,
      downloads: contract.manifest.assets.map((asset) => `${origin}/downloads/v${contract.version}/${asset.name}`),
    };
  } finally {
    await browser.close();
  }
}

async function verifyLive(options) {
  const startedAt = new Date().toISOString();
  const contract = await readReleaseContract();
  const commit = await assertHeadIsPushed();
  const cdn = await waitForCdn(contract, options.origin, options.waitSeconds);
  await run(process.execPath, ["scripts/verify-download-cdn.mjs"], "verify full CDN installers and ranges");
  const website = await verifyPublicPages(contract, options.origin);
  const report = {
    status: "passed",
    command: "verify-live",
    startedAt,
    completedAt: new Date().toISOString(),
    version: contract.version,
    commit,
    origin: options.origin,
    cdn,
    website,
  };
  await writeReport("live", report);
  return report;
}

async function main() {
  let options;
  try {
    options = parseHarnessArgs(process.argv.slice(2));
    if (options.command === "help") return usage();
    const report =
      options.command === "prepare"
        ? await prepare(options)
        : await verifyLive(options);
    console.log(`\n[harness] ${report.command} passed for Pulse v${report.version}.`);
  } catch (error) {
    if (options?.command && options.command !== "help")
      await writeReport(options.command, {
        status: "failed",
        command: options.command,
        completedAt: new Date().toISOString(),
        error: error.message,
      });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main().catch((error) => {
    console.error(`\n[harness] ${error.stack || error.message}`);
    process.exitCode = 1;
  });
