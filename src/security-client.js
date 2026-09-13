import { Capacitor, CapacitorHttp } from "@capacitor/core";
export async function requestOsv(payload) {
  const url = "https://api.osv.dev/v1/query";
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      data: payload,
      headers: { "Content-Type": "application/json" },
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    if (response.status !== 200)
      throw new Error(
        `OSV request failed (HTTP ${response.status}). No security conclusion is available.`,
      );
    return typeof response.data === "string"
      ? JSON.parse(response.data)
      : response.data;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      `OSV request failed (HTTP ${response.status}). No security conclusion is available.`,
    );
  return response.json();
}
