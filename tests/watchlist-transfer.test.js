import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeTransfer,
  describeTransfer,
  encodeTransfer,
} from "../shared/watchlist-transfer.js";
import { providers } from "../shared/providers.js";

const known = providers.map((provider) => provider.id);
const someIds = known.slice(0, 4);

test("a watchlist survives the round trip", () => {
  const code = encodeTransfer({ watchlist: someIds, custom: [] });
  const back = decodeTransfer(code, known);
  assert.deepEqual(back.watchlist, someIds);
  assert.deepEqual(back.custom, []);
});

test("added pages survive the round trip as url and name", () => {
  const code = encodeTransfer({
    watchlist: [],
    custom: [
      {
        url: "https://status.example.com/api/v2/summary.json",
        name: "Example",
      },
    ],
  });
  const back = decodeTransfer(code, known);
  assert.equal(back.custom.length, 1);
  assert.equal(back.custom[0].name, "Example");
  // normalizeCustomUrl reduces a pasted address to its bare https origin, so the
  // feed path the reader happened to paste is not what comes back.
  assert.equal(
    new URL(back.custom[0].url).origin,
    "https://status.example.com",
  );
  // Rebuilt, not carried: the id is derived from the url by the importing build.
  assert.ok(back.custom[0].id.startsWith("custom:"));
  assert.equal(back.custom[0].custom, true);
});

test("a name in another script is not mangled", () => {
  // btoa is latin1. If the bytes did not go through TextEncoder this is where it
  // would show.
  const code = encodeTransfer({
    watchlist: [],
    custom: [{ url: "https://status.example.com", name: "日本のベンダー" }],
  });
  assert.equal(decodeTransfer(code, known).custom[0].name, "日本のベンダー");
});

test("a truncated code is called incomplete, not unrecognised", () => {
  const code = encodeTransfer({ watchlist: someIds });
  // The realistic failure: a text field or a partial selection cut the end off.
  // Losing the tail takes the seal with it, so the message has to come from
  // recognising the prefix rather than from counting the parts -- a reader told
  // "that is not a Pulse code" about a Pulse code goes looking for the wrong
  // problem. Both a tail cut inside the body and one that removes the seal
  // entirely are the same mistake to the person making it.
  for (const cut of [8, 20, 40])
    assert.throws(
      () => decodeTransfer(code.slice(0, code.length - cut), known),
      /incomplete/i,
      `cutting ${cut} characters should read as incomplete`,
    );
});

test("a code with a flipped character is refused", () => {
  const code = encodeTransfer({ watchlist: someIds });
  const middle = Math.floor(code.length / 2);
  const swapped =
    code.slice(0, middle) +
    (code[middle] === "a" ? "b" : "a") +
    code.slice(middle + 1);
  assert.throws(
    () => decodeTransfer(swapped, known),
    /incomplete|could not be read/i,
  );
});

test("something that is not a Pulse code says so", () => {
  assert.throws(
    () => decodeTransfer("hello", known),
    /not a Pulse transfer code/,
  );
  assert.throws(() => decodeTransfer("", known), /Paste a Pulse transfer code/);
});

test("a future version is named rather than partly honoured", () => {
  const code = encodeTransfer({ watchlist: someIds }).replace(
    "PULSE1",
    "PULSE2",
  );
  assert.throws(() => decodeTransfer(code, known), /different version/);
});

test("ids this build does not have are reported, not imported", () => {
  // A code from a newer catalogue. Importing the unknown id would leave a row
  // that can never resolve, which reads as a broken app.
  const code = encodeTransfer({
    watchlist: [...someIds, "not-a-real-provider"],
  });
  const back = decodeTransfer(code, known);
  assert.deepEqual(back.watchlist, someIds);
  assert.equal(back.unknown, 1);
});

test("an imported page cannot smuggle in a non-https address", () => {
  // The same guard the paste field applies. Hand-built payload, because
  // encodeTransfer is not the attacker here.
  const body = Buffer.from(
    JSON.stringify({
      v: 1,
      w: [],
      c: [{ u: "http://insecure.example.com", n: "x" }],
    }),
  ).toString("base64url");
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(body)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const code = `PULSE1.${body}.${hash.toString(36).padStart(6, "0").slice(-6)}`;
  const back = decodeTransfer(code, known);
  assert.deepEqual(back.custom, []);
  assert.equal(back.refused, 1);
});

test("an empty code is refused", () => {
  assert.throws(
    () => decodeTransfer(encodeTransfer({ watchlist: [], custom: [] }), known),
    /empty/,
  );
});

test("whitespace from a wrapped paste is tolerated", () => {
  const code = encodeTransfer({ watchlist: someIds });
  const wrapped = `${code.slice(0, 20)}\n  ${code.slice(20)}\n`;
  assert.deepEqual(decodeTransfer(wrapped, known).watchlist, someIds);
});

test("duplicate ids are collapsed", () => {
  const code = encodeTransfer({
    watchlist: [someIds[0], someIds[0], someIds[1]],
  });
  assert.deepEqual(decodeTransfer(code, known).watchlist, [
    someIds[0],
    someIds[1],
  ]);
});

test("the summary counts only what the device does not already have", () => {
  const incoming = decodeTransfer(
    encodeTransfer({ watchlist: someIds }),
    known,
  );
  const all = describeTransfer(incoming, { watchlist: someIds, custom: [] });
  assert.equal(all.services, 0, "a code you already match adds nothing");
  const some = describeTransfer(incoming, {
    watchlist: someIds.slice(0, 2),
    custom: [],
  });
  assert.equal(some.services, 2);
});

test("a code is short enough to be carried by hand", () => {
  // Ten services and two pages is a realistic load. If this grows past a few
  // hundred characters it stops being something a reader can paste or scan.
  const code = encodeTransfer({
    watchlist: known.slice(0, 10),
    custom: [
      { url: "https://status.one.example.com", name: "One" },
      { url: "https://status.two.example.com", name: "Two" },
    ],
  });
  assert.ok(code.length < 400, `code is ${code.length} characters`);
});
