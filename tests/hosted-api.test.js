import test from "node:test";
import assert from "node:assert/strict";
import { createStatusHandler } from "../api/status.js";
function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}
test("hosted status endpoint returns the provider snapshot and bounds CDN caching", async () => {
  const snapshot = {
    providers: [{ id: "npm", status: "unknown", checkedAt: null }],
    fetchedAt: "2026-09-13T00:00:00Z",
  };
  const res = response();
  await createStatusHandler({ refresh: async () => snapshot })(
    { method: "GET" },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), snapshot);
  assert.match(res.headers["Cache-Control"], /s-maxage=30/);
  assert.equal(res.headers["Content-Type"], "application/json");
});
test("hosted status endpoint rejects mutations without fetching sources", async () => {
  let called = false;
  const res = response();
  await createStatusHandler({
    refresh: async () => {
      called = true;
    },
  })({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
  assert.equal(called, false);
});
test("hosted source failure is explicit and never cached as healthy", async () => {
  const res = response();
  await createStatusHandler({
    refresh: async () => {
      throw new Error("source unavailable");
    },
  })({ method: "GET" }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(res.body), {
    error: "Status sources unavailable",
  });
});
