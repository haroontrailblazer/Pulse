// The design system is a contract, not a suggestion. These tests read
// src/tokens.css directly so a hand-edited colour or a stray type step fails
// the build rather than shipping as a contrast or legibility regression.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { providers, categories } from "../shared/providers.js";
import { readableMark } from "../shared/brand.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/tokens.css"), "utf8");

function declarations(selector) {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `tokens.css must define ${selector}`);
  const start = css.indexOf("{", at);
  let depth = 0,
    end = start;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (!depth) {
        end = i;
        break;
      }
    }
  }
  const out = {};
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].trim();
  return out;
}

const light = declarations(":root {");
const dark = { ...light, ...declarations(':root[data-theme="dark"]') };

function rgb(value, vars, depth = 0) {
  if (depth > 6 || !value) return null;
  const ref = value.trim().match(/^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/);
  if (ref) return rgb(vars[ref[1]] ?? ref[2], vars, depth + 1);
  const hex = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!hex) return null;
  let h = hex[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function contrast(a, b) {
  const lum = (c) =>
    0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
  const chan = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const SURFACES = ["--canvas", "--surface", "--surface-sunken"];
const INK = ["--text", "--text-secondary", "--text-muted"];
const STATES = ["positive", "warning", "negative", "info", "neutral"];

for (const [name, vars] of [
  ["light", light],
  ["dark", dark],
]) {
  test(`${name} theme: body ink meets WCAG AA on every surface`, () => {
    for (const ink of INK)
      for (const surface of SURFACES) {
        const ratio = contrast(rgb(vars[ink], vars), rgb(vars[surface], vars));
        assert.ok(
          ratio >= 4.5,
          `${ink} on ${surface} is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum`,
        );
      }
  });

  test(`${name} theme: status text is readable on its own container and on a card`, () => {
    for (const state of STATES)
      for (const surface of [`--${state}-bg`, "--surface", "--canvas"]) {
        const ratio = contrast(
          rgb(vars[`--${state}`], vars),
          rgb(vars[surface], vars),
        );
        assert.ok(
          ratio >= 4.5,
          `--${state} on ${surface} is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum`,
        );
      }
  });

  test(`${name} theme: status marks are distinguishable on every surface they sit on`, () => {
    for (const state of STATES)
      for (const surface of ["--surface", "--canvas", "--surface-sunken"]) {
        const ratio = contrast(
          rgb(vars[`--mark-${state}`], vars),
          rgb(vars[surface], vars),
        );
        assert.ok(
          ratio >= 3,
          `--mark-${state} on ${surface} is ${ratio.toFixed(2)}:1, below the 3:1 non-text minimum`,
        );
      }
  });

  test(`${name} theme: text on the accent fill is readable`, () => {
    const ratio = contrast(
      rgb(vars["--on-accent"], vars),
      rgb(vars["--accent"], vars),
    );
    assert.ok(ratio >= 4.5, `--on-accent on --accent is ${ratio.toFixed(2)}:1`);
  });
}

test("no type step that carries meaning drops below 12px", () => {
  for (const m of css.matchAll(/(--fs-[\w-]+)\s*:\s*([\d.]+)px/g))
    assert.ok(
      Number(m[2]) >= 12,
      `${m[1]} is ${m[2]}px; the minimum legible step is 12px`,
    );
});

test("form inputs stay at 16px on phones so iOS does not zoom on focus", () => {
  const value = light["--fs-input"];
  assert.equal(value, "16px", `--fs-input is ${value}; phones need 16px`);
});

test("spacing is a 4px grid and radius is a fixed ladder", () => {
  const spacing = Object.entries(light)
    .filter(([k]) => /^--space-\d$/.test(k))
    .map(([, v]) => parseInt(v, 10));
  assert.ok(
    spacing.length >= 8,
    "the spacing scale must have at least 8 steps",
  );
  for (const step of spacing)
    assert.equal(step % 4, 0, `${step}px is not on the 4px grid`);
  assert.deepEqual(
    [...spacing].sort((a, b) => a - b),
    spacing,
    "spacing steps must be declared in ascending order",
  );

  const radii = Object.entries(light)
    .filter(([k]) => /^--radius-(xs|sm|md|lg|xl)$/.test(k))
    .map(([, v]) => parseInt(v, 10));
  assert.equal(
    radii.length,
    5,
    "the radius ladder must have exactly five sized steps",
  );
  assert.equal(light["--radius-pill"], "999px");
});

test("touch targets are declared at the 44px platform minimum", () => {
  assert.equal(light["--tap"], "44px");
});

test("only tokens.css declares design tokens", () => {
  // A second stylesheet re-declaring a token silently shadows the whole layer:
  // tokens.css loads first, so the later file wins.
  const sheets = readdirSync(resolve(root, "src")).filter((f) =>
    f.endsWith(".css"),
  );
  const owned = new Set(Object.keys(light));
  for (const file of sheets) {
    if (file === "tokens.css") continue;
    const text = readFileSync(resolve(root, "src", file), "utf8");
    for (const m of text.matchAll(/(^|[{;\s])(--[\w-]+)\s*:/g))
      assert.ok(
        !owned.has(m[2]),
        `${file} redeclares ${m[2]}; tokens.css owns it`,
      );
    // components.css is the designated base-type layer; nothing else may set
    // a root font size, because that silently rescales every rem in the app.
    if (file === "components.css") continue;
    for (const m of text.matchAll(/:root\s*\{([^}]*)\}/g))
      assert.ok(
        !/font-size\s*:/.test(m[1]),
        `${file} sets a :root font-size; components.css owns base type`,
      );
  }
});

test("no stylesheet ships a font size below the 12px floor", () => {
  const sheets = readdirSync(resolve(root, "src")).filter((f) =>
    f.endsWith(".css"),
  );
  const offenders = [];
  for (const file of sheets) {
    const text = readFileSync(resolve(root, "src", file), "utf8");
    for (const m of text.matchAll(/font-size:\s*([\d.]+)px/g))
      if (Number(m[1]) < 12) offenders.push(`${file}: ${m[1]}px`);
  }
  assert.deepEqual(
    offenders,
    [],
    `sub-12px type found: ${offenders.join(", ")}`,
  );
});

test("both themes define the same token names", () => {
  const darkOnly = declarations(':root[data-theme="dark"]');
  for (const key of Object.keys(darkOnly))
    assert.ok(
      key in light,
      `${key} is declared for dark only; every token needs a light default`,
    );
  // Every colour token that differs per theme must actually be overridden.
  const themed = [
    "--canvas",
    "--surface",
    "--surface-sunken",
    "--surface-hover",
    "--chrome",
    "--text",
    "--text-secondary",
    "--text-muted",
    "--line",
    "--line-strong",
    "--accent",
    "--accent-soft",
    "--on-accent",
    ...STATES.flatMap((s) => [
      `--${s}`,
      `--${s}-bg`,
      `--${s}-line`,
      `--mark-${s}`,
    ]),
  ];
  for (const key of themed)
    assert.ok(key in darkOnly, `${key} has no dark-theme value`);
});

test("icons are drawn at the four sizes in the scale", () => {
  const ICON_SCALE = new Set([16, 20, 24, 32]);
  const offenders = [];
  for (const file of readdirSync(resolve(root, "src")).filter((f) =>
    f.endsWith(".jsx"),
  )) {
    const text = readFileSync(resolve(root, "src", file), "utf8");
    for (const m of text.matchAll(/size=\{(\d+)\}/g))
      if (!ICON_SCALE.has(Number(m[1])))
        offenders.push(`${file}: size={${m[1]}}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `off-scale icon sizes: ${offenders.join(", ")} (use 16, 20, 24 or 32)`,
  );
});

// The catalogue's size appears in prose that no runtime value can reach: five
// meta tags in landing.html, including the JSON-LD description Google indexes,
// and two lines of the README. Every count inside the app is derived, so these
// are the only ones that can quietly go stale -- and they did, twice, before
// this test existed.
test("the counts written in prose are the catalogue's real size", () => {
  const services = String(providers.length);
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  const landing = readFileSync(resolve(root, "landing.html"), "utf8");
  const stale = [...landing.matchAll(/\b(\d{2,3}) (services|status dots)\b/g)]
    .filter((m) => m[1] !== services)
    .map((m) => m[0]);
  assert.deepEqual(
    stale,
    [],
    `landing.html still says ${stale.join(", ")}; the catalogue has ${services} services`,
  );
  assert.ok(
    landing.includes(`${services} services`),
    "landing.html never states the catalogue size at all",
  );

  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  const wrongServices = [
    ...readme.matchAll(/\b(\d{2,3}) technology providers\b/g),
  ]
    .filter((m) => m[1] !== services)
    .map((m) => m[0]);
  assert.deepEqual(
    wrongServices,
    [],
    `README says ${wrongServices.join(", ")}`,
  );
  const wrongCategories = [...readme.matchAll(/\b([a-z]+) categories\b/g)]
    .filter((m) => m[1] !== words[categories.length])
    .map((m) => m[0]);
  assert.deepEqual(
    wrongCategories,
    [],
    `README says ${wrongCategories.join(", ")}; there are ${categories.length} (${words[categories.length]})`,
  );
});

// Brand marks used to be corrected by a hand-written list of CSS exceptions.
// That list was right when it was written and could only rot: it had to be
// re-measured every time the catalogue grew, and at seventy-seven providers
// forty-six need an adjustment on one theme or the other. The adjustment is
// computed now, so this asserts the property rather than the list.
test("every brand mark is legible on both tiles", () => {
  // The tiles ProviderLogo draws on: --surface-tile, light and dark.
  const tiles = {
    light: light["--surface-tile"],
    dark: dark["--surface-tile"],
  };
  const failures = [];
  for (const provider of providers)
    for (const theme of ["light", "dark"]) {
      const ink = rgb(readableMark(provider.color, theme), {});
      const ratio = contrast(ink, rgb(tiles[theme], {}));
      if (ratio < 3)
        failures.push(`${provider.id} ${theme}: ${ratio.toFixed(2)}:1`);
    }
  assert.deepEqual(
    failures,
    [],
    `brand marks below the 3:1 non-text floor: ${failures.join(", ")}`,
  );
});

test("a mark is only moved when it has to be, and never off-hue", () => {
  // The point is legibility, not uniformity: a brand that already clears the
  // floor must come through untouched, or the map and the directory stop
  // looking like the companies they name.
  const untouched = providers.filter(
    (p) =>
      readableMark(p.color, "light") === p.color.toLowerCase() &&
      readableMark(p.color, "dark") === p.color.toLowerCase(),
  );
  assert.ok(
    untouched.length > providers.length / 3,
    `only ${untouched.length} of ${providers.length} marks survive unchanged; the adjustment is too aggressive`,
  );
  // And an adjustment keeps the hue: the channel ordering cannot flip.
  const order = (hex) => {
    const [r, g, b] = rgb(hex, {});
    return [r >= g, g >= b, r >= b].join();
  };
  for (const p of providers)
    for (const theme of ["light", "dark"])
      assert.equal(
        order(readableMark(p.color, theme)),
        order(p.color),
        `${p.id} changed hue on ${theme}`,
      );
});
