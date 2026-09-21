export const releaseVersion = "1.0.27";
const releaseBase = `https://www.pulses4u.in/downloads/v${releaseVersion}`;
export const downloads = {
  windows: `${releaseBase}/Pulse-${releaseVersion}-Windows.exe`,
  android: `${releaseBase}/Pulse-${releaseVersion}-Android.apk`,
  checksums: `${releaseBase}/SHA256SUMS.txt`,
};
