import test from "node:test";
import assert from "node:assert/strict";
import {
  BUCKET_MS,
  BUCKETS,
  HISTORY_VERSION,
  bucketAt,
  bucketStates,
  decodeHistory,
  emptyHistory,
  encodeHistory,
  recordState,
} from "../shared/history.js";

// The journal is a fixed-length ring of one character per bucket. Everything
// here is about the two things a strip has to get right: that "we were not
// looking" is never drawn as "it was fine", and that a short outage inside a
// longer bucket is not erased.

const at = (minutes) => Date.UTC(2026, 0, 1, 0, 0) + minutes * 60_000;

test("the ring covers the advertised window exactly", () => {
  assert.equal(BUCKETS * BUCKET_MS, 30 * 24 * 60 * 60 * 1000, "30 days");
  assert.equal(BUCKET_MS, 5 * 60_000, "five-minute buckets");
});

test("a new journal is entirely unobserved, not entirely healthy", () => {
  const entry = emptyHistory("openai", "OpenAI");
  const states = bucketStates(entry);
  assert.equal(states.length, BUCKETS);
  assert.ok(
    states.every((s) => s === "unrecorded"),
    "an empty strip must not read as operational",
  );
});

test("a recorded state lands in the bucket for its timestamp", () => {
  let entry = emptyHistory("openai", "OpenAI");
  entry = recordState(entry, "operational", at(0));
  const states = bucketStates(entry);
  assert.equal(states.at(-1), "operational");
  assert.equal(states.at(-2), "unrecorded");
});

test("the worst state in a bucket survives, so a short outage is not erased", () => {
  let entry = emptyHistory("openai", "OpenAI");
  // Three readings inside one five-minute bucket: fine, broken, fine again.
  entry = recordState(entry, "operational", at(0));
  entry = recordState(entry, "major_outage", at(1));
  entry = recordState(entry, "operational", at(2));
  assert.equal(
    bucketStates(entry).at(-1),
    "major_outage",
    "last-write-wins would hide the outage entirely",
  );
});

test("a gap in observation is drawn as a gap, never as health", () => {
  let entry = emptyHistory("openai", "OpenAI");
  entry = recordState(entry, "operational", at(0));
  // The laptop is shut for an hour: twelve buckets pass unobserved.
  entry = recordState(entry, "operational", at(60));
  const states = bucketStates(entry);
  assert.equal(states.at(-1), "operational");
  const skipped = states.slice(-12, -1);
  assert.equal(skipped.length, 11);
  assert.ok(
    skipped.every((s) => s === "unrecorded"),
    `a closed laptop must not backfill as operational, got ${skipped.join(",")}`,
  );
});

test("looked-and-unreachable is a different mark from never-looked", () => {
  let entry = emptyHistory("openai", "OpenAI");
  entry = recordState(entry, "unknown", at(0));
  const states = bucketStates(entry);
  assert.equal(
    states.at(-1),
    "unknown",
    "a feed Pulse tried and could not read is evidence, not absence",
  );
  assert.notEqual(states.at(-1), states.at(-2));
  assert.equal(states.at(-2), "unrecorded");
});

test("time moving backwards never corrupts the ring", () => {
  let entry = emptyHistory("openai", "OpenAI");
  entry = recordState(entry, "operational", at(100));
  const before = encodeHistory(entry);
  // A clock correction, or a reading that arrives late.
  entry = recordState(entry, "major_outage", at(10));
  assert.equal(
    encodeHistory(entry),
    before,
    "a stale timestamp must be dropped rather than rewriting history",
  );
});

test("the window slides, dropping only what has aged out", () => {
  let entry = emptyHistory("openai", "OpenAI");
  entry = recordState(entry, "major_outage", at(0));
  // Advance one full window plus a bucket: the outage must fall off the end.
  entry = recordState(entry, "operational", at(30 * 24 * 60 + 5));
  const states = bucketStates(entry);
  assert.equal(states.at(-1), "operational");
  assert.ok(
    !states.includes("major_outage"),
    "a reading older than the window must not linger",
  );
  assert.equal(states.length, BUCKETS, "the ring never changes length");
});

test("a journal round-trips through storage unchanged", () => {
  let entry = emptyHistory("custom:abc1234", "My Vendor");
  entry = recordState(entry, "degraded_performance", at(0));
  entry = recordState(entry, "operational", at(10));
  const restored = decodeHistory(encodeHistory(entry));
  assert.deepEqual(bucketStates(restored), bucketStates(entry));
  assert.equal(restored.name, "My Vendor", "the label outlives the catalog");
  assert.equal(restored.id, "custom:abc1234");
});

test("a journal written by another schema or bucket size is discarded, not misread", () => {
  const entry = emptyHistory("openai", "OpenAI");
  const wrongVersion = JSON.parse(encodeHistory(entry));
  wrongVersion.v = HISTORY_VERSION + 1;
  assert.equal(decodeHistory(JSON.stringify(wrongVersion)), null);

  const wrongBucket = JSON.parse(encodeHistory(entry));
  wrongBucket.slotMs = BUCKET_MS * 2;
  assert.equal(
    decodeHistory(JSON.stringify(wrongBucket)),
    null,
    "a different time axis must be dropped rather than drawn on the wrong scale",
  );

  for (const junk of ["", "{", "null", "[]", '{"v":1}'])
    assert.equal(decodeHistory(junk), null, `accepted ${JSON.stringify(junk)}`);
});

test("a stored ring of the wrong length is refused", () => {
  const entry = emptyHistory("openai", "OpenAI");
  const truncated = JSON.parse(encodeHistory(entry));
  truncated.b = truncated.b.slice(0, 10);
  assert.equal(decodeHistory(JSON.stringify(truncated)), null);
});

test("bucketAt is the absolute epoch index the ring is keyed on", () => {
  assert.equal(bucketAt(at(0)), Math.floor(at(0) / BUCKET_MS));
  assert.equal(bucketAt(at(5)) - bucketAt(at(0)), 1);
  assert.equal(bucketAt(at(4)) - bucketAt(at(0)), 0, "under one bucket is the same bucket");
});

test("one provider's journal stays under a sane share of the origin quota", () => {
  let entry = emptyHistory("openai", "OpenAI");
  for (let i = 0; i < BUCKETS; i++) entry = recordState(entry, "operational", at(i * 5));
  const bytes = encodeHistory(entry).length;
  // 77 built-ins plus room for the reader's own. localStorage is commonly
  // ~5M UTF-16 characters; this keeps the whole journal well inside it.
  assert.ok(bytes < 10_000, `one provider encodes to ${bytes} chars`);
  assert.ok(bytes * 90 < 1_000_000, `90 providers would be ${bytes * 90} chars`);
});
