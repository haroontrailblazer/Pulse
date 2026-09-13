import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const toolchain = join(root, ".cache", "android-toolchain");
const executable = process.platform === "win32" ? "java.exe" : "java";
const localJdk = join(toolchain, "jdk");
const candidates = existsSync(localJdk)
  ? [
      localJdk,
      ...readdirSync(localJdk, { withFileTypes: true })
        .filter((p) => p.isDirectory())
        .map((p) => join(localJdk, p.name)),
    ]
  : [];
const javaHome =
  candidates.find((p) => existsSync(join(p, "bin", executable))) ||
  process.env.JAVA_HOME;
const localSdk = join(toolchain, "sdk");
const sdk = existsSync(join(localSdk, "platforms", "android-36", "android.jar"))
  ? localSdk
  : process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!javaHome || !sdk) {
  console.error(
    "Java 21 and Android SDK 36 are required. See the Android setup section in README.md.",
  );
  process.exit(1);
}
const javaCheck = spawnSync(join(javaHome, "bin", executable), ["-version"], {
  encoding: "utf8",
});
const version = `${javaCheck.stdout || ""}${javaCheck.stderr || ""}`.match(
  /version "(\d+)/,
)?.[1];
if (Number(version) < 21 || !version) {
  console.error(
    "The Android build requires Java 21 or newer. Select a compatible JAVA_HOME.",
  );
  process.exit(1);
}
const androidUser = join(toolchain, "user");
mkdirSync(androidUser, { recursive: true });
writeFileSync(
  join(root, "android", "local.properties"),
  `sdk.dir=${sdk.replaceAll("\\", "/")}\n`,
);
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ANDROID_USER_HOME: androidUser,
  GRADLE_USER_HOME:
    process.env.GRADLE_USER_HOME ||
    (process.platform === "win32"
      ? join(tmpdir(), "pulse-gradle")
      : join(root, ".cache", "gradle")),
};
const args = [
  "-p",
  "android",
  "assembleDebug",
  "testDebugUnitTest",
  "--no-daemon",
  "--max-workers=2",
  "--console=plain",
  "--no-watch-fs",
];
const result =
  process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/c", "android\\gradlew.bat", ...args], {
        cwd: root,
        env,
        stdio: "inherit",
      })
    : spawnSync("./android/gradlew", args, {
        cwd: root,
        env,
        stdio: "inherit",
      });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
const versionName = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
const output = join(root, "releases", `Pulse-${versionName}-Android.apk`);
mkdirSync(join(root, "releases"), { recursive: true });
copyFileSync(
  join(
    root,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk",
  ),
  output,
);
console.log(`\nInstallable development APK: ${output}`);
