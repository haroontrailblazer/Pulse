import test from "node:test";
import assert from "node:assert/strict";
import {
  parseChecksumManifest,
  parseHarnessArgs,
  readReleaseContract,
} from "../scripts/release-harness.mjs";

test("release harness parses the production commands and safety switches", () => {
  assert.equal(parseHarnessArgs(["--help"]).command, "help");
  const options = parseHarnessArgs([
    "prepare",
    "--launch-native",
    "--android-serial",
    "emulator-5554",
    "--keep-native-open",
  ]);
  assert.equal(options.command, "prepare");
  assert.equal(options.launchNative, true);
  assert.equal(options.androidSerial, "emulator-5554");
  assert.equal(options.keepNativeOpen, true);
  assert.throws(
    () => parseHarnessArgs(["prepare", "--keep-native-open"]),
    /requires --launch-native/,
  );
});

test("release harness accepts only canonical SHA256SUMS entries", () => {
  const entries = parseChecksumManifest(
    "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789  Pulse.apk\n",
  );
  assert.equal(
    entries.get("Pulse.apk"),
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  );
  assert.throws(() => parseChecksumManifest("not-a-checksum Pulse.apk"), /Invalid checksum/);
  assert.throws(
    () => parseChecksumManifest("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789  Pulse.apk\nABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789  Pulse.apk"),
    /Duplicate checksum/,
  );
});

test("release harness keeps the three native release version declarations aligned", async () => {
  const contract = await readReleaseContract();
  assert.equal(contract.manifest.assets.length, 2);
  assert.deepEqual(contract.names, [
    `Pulse-${contract.version}-Android.apk`,
    `Pulse-${contract.version}-Windows.exe`,
  ]);
});
