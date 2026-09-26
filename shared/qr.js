// A QR encoder, byte mode, error correction level M.
//
// Here rather than from a package for two reasons. A transfer code is the one
// thing in this product a reader carries between devices by hand, and reading a
// square off a laptop with a phone is the only way to do that which does not
// involve messaging yourself; and every dependency in this repo is bundled into
// three shipped packages, so a few hundred lines that never change are cheaper
// than an install that has to be audited on every surface.
//
// Level M -- about 15% recovery -- is the usual choice for something displayed on
// a screen: a phone camera reading a monitor at arm's length loses modules to
// moire and glare, not to coffee stains, and L is thin for that while Q and H
// grow the square for robustness nobody here needs.
//
// The tables below are constants of the specification, and constants transcribed
// by hand are exactly the kind of thing that is wrong in one cell. So this was
// checked against an independent implementation rather than reasoned about: every
// module of the output is byte-identical to Python's `qrcode` library at versions
// 1, 6, 10, 16 and 19, which between them exercise both character-count widths,
// one block and fourteen, the version bits that only appear from version 7, and
// multi-byte UTF-8. Two real mistakes were found that way and neither would have
// been visible by inspection: the format bits were written least-significant
// first, and the generator polynomial was built constant-term first but consumed
// as though it were the other way round. Both produce a picture that looks
// exactly like a QR code and scans as nothing. tests/qr.test.js freezes that
// verified output as fixtures so a future change has to keep matching it.
//
// One honest caveat: which of the eight masks gets chosen is ours. The three
// implementations compared here disagree with each other about it, because the
// specification's third penalty rule is fiddly and everyone approximates it
// differently. Mask choice affects only how easily a camera reads the square, not
// whether it decodes -- with the mask forced to the same value, the modules agree
// exactly -- and this scoring errs toward penalising finder-like patterns more
// than the rule strictly requires, which is the cautious direction.

// Data codewords per block, and how many blocks, for level M at versions 1-20.
// Twenty is far past what a transfer code needs -- version 20 holds 666 bytes and
// a ten-service code is under 400 characters -- so nothing here has to guess
// about the larger versions.
const ECC_PER_BLOCK = [
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26,
];
const BLOCKS = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
];
const MAX_VERSION = ECC_PER_BLOCK.length;
const ALIGNMENT_STEP = [
  0, 0, 16, 20, 24, 28, 32, 16, 18, 20, 22, 24, 26, 28, 20, 22, 24, 24, 26, 28,
  28,
];

// Total 8-bit codewords a version holds, function patterns already removed. The
// closed form from the specification, which is less error-prone than another
// table.
function rawCodewords(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2;
    modules -= (25 * alignments - 10) * alignments - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

const dataCodewords = (version) =>
  rawCodewords(version) - ECC_PER_BLOCK[version - 1] * BLOCKS[version - 1];

// GF(256) with the QR field polynomial, 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// The generator polynomial for `degree` check codewords, (x - a^0)…(x - a^n-1).
function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= mul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  // The loop above builds the polynomial constant term first, because that is the
  // direction multiplying by x moves a coefficient. The division below walks it
  // the other way and never needs the leading 1, so it is turned around and
  // dropped here rather than indexed around at the call site -- reading it in the
  // wrong direction produces check bytes that are wrong but plausible, which is
  // a QR code that looks perfect and scans as nothing.
  poly.reverse();
  return poly.slice(1);
}

function remainder(data, degree) {
  const gen = generator(degree);
  const result = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[degree - 1] = 0;
    for (let i = 0; i < degree; i++) result[i] ^= mul(gen[i], factor);
  }
  return result;
}

// Bit writer. QR is a bit stream that only becomes bytes at the end.
class Bits {
  constructor() {
    this.bits = [];
  }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

function smallestVersion(byteLength) {
  for (let version = 1; version <= MAX_VERSION; version++) {
    // 4 bits of mode, then the character count: 8 bits up to version 9, 16 after.
    const header = 4 + (version <= 9 ? 8 : 16);
    if (dataCodewords(version) * 8 >= header + byteLength * 8) return version;
  }
  throw new Error(
    `${byteLength} bytes is more than a version ${MAX_VERSION} QR code holds`,
  );
}

function codewords(bytes, version) {
  const bits = new Bits();
  bits.push(0b0100, 4); // byte mode
  bits.push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) bits.push(byte, 8);

  const capacity = dataCodewords(version) * 8;
  // Terminator, then to a byte boundary, then the specified alternating pad.
  bits.push(0, Math.min(4, capacity - bits.length));
  bits.push(0, (8 - (bits.length % 8)) % 8);
  const data = new Uint8Array(dataCodewords(version));
  for (let i = 0; i < bits.length; i++)
    data[i >>> 3] |= bits.bits[i] << (7 - (i & 7));
  for (let i = bits.length / 8, pad = 0; i < data.length; i++, pad++)
    data[i] = pad % 2 === 0 ? 0xec : 0x11;

  // Split into blocks, add check codewords, then interleave. The longer blocks go
  // last, and the interleave reads column-wise across blocks so a scratch across
  // the square damages every block a little rather than one block fatally.
  const blocks = BLOCKS[version - 1];
  const ecc = ECC_PER_BLOCK[version - 1];
  const shortLength = Math.floor(data.length / blocks);
  const longBlocks = data.length % blocks;
  const dataBlocks = [];
  const eccBlocks = [];
  let at = 0;
  for (let i = 0; i < blocks; i++) {
    const length = shortLength + (i >= blocks - longBlocks ? 1 : 0);
    const block = data.subarray(at, at + length);
    at += length;
    dataBlocks.push(block);
    eccBlocks.push(remainder(block, ecc));
  }
  const out = [];
  for (let i = 0; i < shortLength + 1; i++)
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  for (let i = 0; i < ecc; i++)
    for (const block of eccBlocks) out.push(block[i]);
  return out;
}

// BCH(15,5) for the format bits, BCH(18,6) for the version bits.
function bch(data, generatorPoly, bits) {
  let rest = data << bits;
  for (let i = bits + 4; i >= bits; i--)
    if ((rest >>> i) & 1) rest ^= generatorPoly << (i - bits);
  return rest;
}

function alignmentCentres(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = ALIGNMENT_STEP[version];
  const positions = [6];
  for (let i = 1; i < count; i++)
    positions.push(4 * version + 10 - (count - 1 - i) * step);
  return positions;
}

/**
 * The module grid for a string. `true` is a dark module.
 *
 * Returns the finished, masked matrix including every function pattern, so a
 * renderer only has to draw squares.
 */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  const version = smallestVersion(bytes.length);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () =>
    new Array(size).fill(false),
  );
  // Which cells the data stream must skip. Kept separate from the colours because
  // masking applies to data modules only.
  const reserved = Array.from({ length: size }, () =>
    new Array(size).fill(false),
  );

  const set = (x, y, dark) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  // Finder patterns and their separators, at three corners.
  for (const [ox, oy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ])
    for (let y = -1; y <= 7; y++)
      for (let x = -1; x <= 7; x++) {
        const px = ox + x;
        const py = oy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        set(px, py, ring !== 2 && ring <= 3);
      }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centres = alignmentCentres(version);
  for (const cy of centres)
    for (const cx of centres) {
      if (
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === size - 7) ||
        (cx === size - 7 && cy === 6)
      )
        continue;
      for (let y = -2; y <= 2; y++)
        for (let x = -2; x <= 2; x++)
          set(cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // The format area is reserved now and written once the mask is chosen. The
  // always-dark module below the top-right finder belongs to it.
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) set(i, 8, false);
    if (!reserved[i][8]) set(8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    set(size - 1 - i, 8, false);
    set(8, size - 1 - i, false);
  }
  set(8, size - 8, true);

  if (version >= 7) {
    const info = (version << 12) | bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >>> i) & 1) === 1;
      set(size - 11 + (i % 3), Math.floor(i / 3), bit);
      set(Math.floor(i / 3), size - 11 + (i % 3), bit);
    }
  }

  // Data, up the right-hand column pair and down the next, skipping the timing
  // column entirely.
  const stream = codewords(bytes, version);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (reserved[y][x]) continue;
        modules[y][x] =
          bit < stream.length * 8 &&
          ((stream[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
        bit++;
      }
    }
  }

  // Every mask is decodable; the specification picks the least penalised because
  // large blocks of one colour and anything resembling a finder pattern are what
  // a camera misreads.
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, reserved, mask, size);
    writeFormat(modules, mask, size);
    const score = penalty(modules, size);
    if (!best || score < best.score) best = { mask, score };
    applyMask(modules, reserved, mask, size); // XOR again to undo
  }
  applyMask(modules, reserved, best.mask, size);
  writeFormat(modules, best.mask, size);

  return { size, modules, version, mask: best.mask };
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(modules, reserved, mask, size) {
  const rule = MASKS[mask];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!reserved[y][x] && rule(x, y)) modules[y][x] = !modules[y][x];
}

function writeFormat(modules, mask, size) {
  // Level M is 0b00 in the two-bit error-correction field.
  const data = (0b00 << 3) | mask;
  const bits = ((data << 10) | bch(data, 0x537, 10)) ^ 0x5412;
  // Bit 14 is the most significant and belongs at (8,0), and the two copies do
  // not agree on where their halves divide. Both facts are written out as
  // coordinate lists, most significant first, rather than derived in loops from
  // a bit index: the order is the entire content of this function, an off-by-one
  // reverses it in a way that still looks exactly like a QR code, and nothing
  // will read the result. This was wrong in both respects until segno disagreed.
  const copies = [
    [
      [8, 0],
      [8, 1],
      [8, 2],
      [8, 3],
      [8, 4],
      [8, 5],
      [8, 7],
      [8, 8],
      [7, 8],
      [5, 8],
      [4, 8],
      [3, 8],
      [2, 8],
      [1, 8],
      [0, 8],
    ],
    [
      // Seven down the column beside the bottom-left finder, then eight along
      // the row beside the top-right one.
      [size - 1, 8],
      [size - 2, 8],
      [size - 3, 8],
      [size - 4, 8],
      [size - 5, 8],
      [size - 6, 8],
      [size - 7, 8],
      [8, size - 8],
      [8, size - 7],
      [8, size - 6],
      [8, size - 5],
      [8, size - 4],
      [8, size - 3],
      [8, size - 2],
      [8, size - 1],
    ],
  ];
  for (const copy of copies)
    copy.forEach(([row, column], index) => {
      modules[row][column] = ((bits >>> (14 - index)) & 1) === 1;
    });
  modules[size - 8][8] = true;
}

function penalty(modules, size) {
  let score = 0;
  const runs = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      let previous = get(a, 0);
      const history = [];
      for (let b = 1; b < size; b++) {
        const current = get(a, b);
        if (current === previous) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          history.push(run);
          run = 1;
          previous = current;
        }
      }
      if (run >= 5) score += run - 2;
      history.push(run);
      // 1:1:3:1:1, the finder's own proportions, anywhere in the data is the
      // pattern most likely to be mistaken for an alignment mark.
      for (let i = 0; i + 4 < history.length; i++)
        if (
          history[i + 1] === history[i] &&
          history[i + 2] === history[i] * 3 &&
          history[i + 3] === history[i] &&
          history[i + 4] === history[i]
        )
          score += 40;
    }
  };
  runs((row, column) => modules[row][column]);
  runs((column, row) => modules[row][column]);

  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const corner = modules[y][x];
      if (
        corner === modules[y][x + 1] &&
        corner === modules[y + 1][x] &&
        corner === modules[y + 1][x + 1]
      )
        score += 3;
    }

  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * The same grid as an SVG string, sized in modules with a quiet zone.
 *
 * One path for every dark module rather than a rect each: a version 10 code is
 * over 1,500 dark squares, and 1,500 elements is a measurable amount of DOM for
 * a picture that never changes.
 */
export function qrSvg(
  text,
  { margin = 4, dark = "#161616", light = "#ffffff" } = {},
) {
  const { size, modules } = qrMatrix(text);
  const span = size + margin * 2;
  let path = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules[y][x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img"><rect width="${span}" height="${span}" fill="${light}"/><path fill="${dark}" d="${path}"/></svg>`;
}
