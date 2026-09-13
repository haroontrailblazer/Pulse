export const releaseVersion = "1.0.4";
const releaseBase = `https://pulse-status-zeta.vercel.app/downloads/v${releaseVersion}`;
export const downloads = {
  windows: `${releaseBase}/Pulse-1.0.4-Windows.exe`,
  android: `${releaseBase}/Pulse-1.0.4-Android.apk`,
  checksums: `${releaseBase}/SHA256SUMS.txt`,
};
