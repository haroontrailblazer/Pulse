import test from "node:test";
import assert from "node:assert/strict";
import {
  packageQuery,
  queryAdvisories,
  decodeJwt,
  sha256,
} from "../shared/security-tools.js";
import { normalizeSummary, providers } from "../shared/providers.js";
const jwt = (head, payload, signature = "test") =>
  [
    Buffer.from(JSON.stringify(head)).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    signature,
  ].join(".");
test("package lookups accept scoped npm names and normalize PyPI names, but reject ranges and tags", () => {
  assert.deepEqual(packageQuery("npm", " @scope/pkg ", " 1.2.3 "), {
    package: { ecosystem: "npm", name: "@scope/pkg" },
    version: "1.2.3",
  });
  assert.equal(
    packageQuery("PyPI", "My_Package.Name", "1.0rc1").package.name,
    "my-package-name",
  );
  for (const version of ["latest", "^1.2.3", ">=1", "1 || 2", ""])
    assert.throws(() => packageQuery("npm", "lodash", version));
  assert.throws(() => packageQuery("npm", "a;whoami", "1.0.0"));
  assert.throws(() => packageQuery("other", "a", "1"));
});
test("advisories follow pagination, remove withdrawn records, and deduplicate IDs", async () => {
  const query = packageQuery("npm", "lodash", "4.17.20");
  let calls = 0;
  const result = await queryAdvisories(query, async (body) => {
    calls++;
    if (calls === 1)
      return {
        vulns: [
          { id: "A", summary: "a" },
          { id: "OLD", withdrawn: "2026-01-01" },
        ],
        next_page_token: "second",
      };
    assert.equal(body.page_token, "second");
    return {
      vulns: [
        { id: "A", summary: "a" },
        { id: "B", summary: "b" },
      ],
    };
  });
  assert.deepEqual(
    result.advisories.map((v) => v.id),
    ["A", "B"],
  );
  assert.equal(result.incomplete, false);
});
test("OSV errors and malformed results do not become a clean security result; bounded queries report partial coverage", async () => {
  const query = packageQuery("PyPI", "requests", "2.19.0");
  for (const response of [
    null,
    [],
    { error: "failed" },
    { vulns: {} },
    { vulns: [{}] },
  ])
    await assert.rejects(queryAdvisories(query, async () => response));
  await assert.rejects(
    queryAdvisories(query, async () => {
      throw new Error("offline");
    }),
  );
  const result = await queryAdvisories(query, async () => ({
    next_page_token: "more",
  }));
  assert.equal(result.incomplete, true);
  assert.deepEqual(
    (await queryAdvisories(query, async () => ({}))).advisories,
    [],
  );
});
test("JWT inspection handles UTF-8, expiry, future activation, and malformed tokens without claiming verification", () => {
  const result = decodeJwt(
    jwt({ alg: "none" }, { name: "Δοκιμή", exp: 100, nbf: 300 }, ""),
    200000,
  );
  assert.equal(result.payload.name, "Δοκιμή");
  assert.ok(result.notes.some((n) => n.includes("expiry has passed")));
  assert.ok(result.notes.some((n) => n.includes("future")));
  assert.ok(result.notes.some((n) => n.includes("not been verified")));
  assert.ok(
    decodeJwt(jwt({ alg: "HS256" }, { exp: "100" })).notes.some((n) =>
      n.includes("Invalid exp"),
    ),
  );
  for (const token of ["bad", "a.b.c.d.e", "a.b.c", jwt([], {}), jwt({}, [])])
    assert.throws(() => decodeJwt(token));
});
test("SHA-256 matches standard empty and UTF-8 text vectors", async () => {
  assert.equal(
    await sha256(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    await sha256(new Uint8Array()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});
test("component names retain source region context without counting groups as components", () => {
  const data = {
    status: { indicator: "none" },
    components: [
      { id: "us", name: "US", group: true },
      { id: "eu", name: "Europe", group: true },
      { id: "a", group_id: "us", name: "API", status: "operational" },
      { id: "b", group_id: "eu", name: "API", status: "degraded_performance" },
    ],
  };
  assert.deepEqual(
    normalizeSummary(providers[0], data).components.map((c) => c.name),
    ["US / API", "Europe / API"],
  );
});
