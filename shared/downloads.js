export const releaseVersion = "1.0.19";
const releaseBase = `https://pulse-status-zeta.vercel.app/downloads/v${releaseVersion}`;
export const downloads = {
  windows: `${releaseBase}/Pulse-${releaseVersion}-Windows.exe`,
  android: `${releaseBase}/Pulse-${releaseVersion}-Android.apk`,
  checksums: `${releaseBase}/SHA256SUMS.txt`,
};
