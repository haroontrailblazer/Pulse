export function packageQuery(ecosystem, name, version) {
  name = name.trim();
  version = version.trim();
  if (!["npm", "PyPI", "RubyGems"].includes(ecosystem))
    throw new Error("Choose a supported package ecosystem.");
  const pattern =
    ecosystem === "npm"
      ? /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i
      : /^[a-z0-9][a-z0-9._-]*$/i;
  if (!name || name.length > 214 || !pattern.test(name))
    throw new Error(
      "Enter a valid package name, including its scope if needed.",
    );
  if (
    !version ||
    version.length > 80 ||
    !/^[a-z0-9][a-z0-9.!+_-]*$/i.test(version) ||
    ["latest", "next", "stable"].includes(version.toLowerCase())
  )
    throw new Error(
      "Enter an exact installed version, such as 4.17.20. Ranges and tags are not supported.",
    );
  if (ecosystem === "PyPI") name = name.toLowerCase().replace(/[-_.]+/g, "-");
  return { package: { ecosystem, name }, version };
}
export async function queryAdvisories(query, request) {
  const records = new Map();
  let pageToken;
  for (let page = 0; page < 3; page++) {
    const data = await request({
      ...query,
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      data.error ||
      (data.vulns !== undefined && !Array.isArray(data.vulns))
    )
      throw new Error("OSV returned an unsupported response. Try again.");
    for (const v of data.vulns || []) {
      if (!v || typeof v.id !== "string")
        throw new Error("OSV returned an invalid advisory. Try again.");
      if (!v.withdrawn)
        records.set(v.id, {
          id: v.id,
          summary:
            v.summary ||
            v.details?.slice(0, 260) ||
            "Open the advisory for details.",
          aliases: Array.isArray(v.aliases) ? v.aliases : [],
          modified: v.modified,
          severity: v.database_specific?.severity || "Not rated",
        });
    }
    pageToken = data.next_page_token;
    if (pageToken && typeof pageToken !== "string")
      throw new Error("OSV returned an invalid pagination token.");
    if (!pageToken || records.size >= 250) break;
  }
  return {
    query,
    advisories: [...records.values()].slice(0, 250),
    incomplete: Boolean(pageToken) || records.size > 250,
    checkedAt: new Date().toISOString(),
  };
}
export function decodeJwt(token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 65536)
    throw new Error("Token must be under 64 KB.");
  const parts = token.trim().split(".");
  if (parts.length === 5)
    throw new Error(
      "This is an encrypted token (JWE); its claims cannot be decoded here.",
    );
  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p))
  )
    throw new Error("Enter a compact JWT with three base64url segments.");
  let header, payload;
  try {
    const decode = (text) => {
      const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
      const parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(binary, (c) => c.charCodeAt(0)),
        ),
      );
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
      return parsed;
    };
    header = decode(parts[0]);
    payload = decode(parts[1]);
  } catch {
    throw new Error("Header and payload must be valid UTF-8 JSON objects.");
  }
  const notes = [
    "Decoded only. Signature, issuer, and audience have not been verified.",
  ];
  if (header.alg === "none" || !parts[2])
    notes.push("This token declares no signature or has an empty signature.");
  for (const field of ["exp", "nbf", "iat"]) {
    if (payload[field] === undefined) continue;
    const value = payload[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isFinite(new Date(value * 1000).getTime())
    )
      notes.push(`Invalid ${field} claim: expected a NumericDate.`);
    else {
      notes.push(`${field}: ${new Date(value * 1000).toISOString()}`);
      if (field === "exp" && value * 1000 <= now)
        notes.push("The declared expiry has passed.");
      if (field === "nbf" && value * 1000 > now)
        notes.push("The declared activation time is in the future.");
    }
  }
  if (payload.exp === undefined) notes.push("No expiry claim is present.");
  return { header, payload, notes };
}
export async function sha256(bytes) {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
