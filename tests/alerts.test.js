import test from "node:test";
import assert from "node:assert/strict";
import { nextAlert, requestBudget } from "../shared/alerts.js";
import { providers } from "../shared/providers.js";
const reading = (status = "operational", extra = {}) => ({
  id: "openai",
  status,
  checkedAt: new Date().toISOString(),
  components: [],
  incidents: [],
  ...extra,
});
test("alerts report current issues once, survive failed checks, and notify after a new recurrence", () => {
  const first = nextAlert(undefined, reading("degraded"));
  assert.equal(first.notify, true);
  assert.equal(nextAlert(first.signature, reading("degraded")).notify, false);
  const failed = nextAlert(
    first.signature,
    reading("unknown", { stale: true }),
  );
  assert.equal(failed.signature, first.signature);
  assert.equal(failed.notify, false);
  assert.equal(nextAlert(failed.signature, reading("degraded")).notify, false);
  const clear = nextAlert(first.signature, reading());
  assert.equal(clear.notify, false);
  assert.equal(nextAlert(clear.signature, reading("degraded")).notify, true);
});
test("component issues and active incidents alert even with an operational aggregate", () => {
  const next = reading("operational", {
    components: [{ id: "api", status: "partial_outage" }],
    incidents: [{ id: "i", status: "investigating", impact: "major" }],
  });
  const first = nextAlert("", next);
  assert.equal(first.notify, true);
  assert.equal(
    nextAlert(first.signature, {
      ...next,
      incidents: [
        { ...next.incidents[0], status: "monitoring", updatedAt: "later" },
      ],
    }).notify,
    false,
  );
  assert.equal(
    nextAlert(first.signature, { ...next, incidents: [] }).notify,
    false,
  );
  assert.equal(
    nextAlert(first.signature, {
      ...next,
      incidents: [
        ...next.incidents,
        { id: "new", status: "investigating", impact: "minor" },
      ],
    }).notify,
    true,
  );
  assert.equal(
    nextAlert(
      "",
      reading("operational", {
        incidents: [{ id: "i", status: "resolved", impact: "major" }],
      }),
    ).notify,
    false,
  );
});
test("request budget uses feed count and watched services, not fictional battery percentages", () => {
  // Pinned to the arithmetic rather than to today's catalogue: the numbers
  // below are what 77 automated feeds cost, and a catalogue that grows has to
  // move them deliberately rather than quietly spending more of a reader's
  // battery and bandwidth.
  const count = providers.filter((p) => p.format !== "source-only").length;
  assert.equal(count, 77);
  assert.deepEqual(requestBudget(4, count), {
    oldHourly: 9240,
    foregroundHourly: 9240,
    androidHourly: 120,
    desktopHourly: 480,
  });
  assert.equal(requestBudget(0).androidHourly, 0);
});
