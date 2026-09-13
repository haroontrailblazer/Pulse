# Pulse logo

Two opposing receiver arcs surround a central rounded node. The open diagonal gives the symbol direction while keeping its three shapes distinct at small sizes. It represents watching connected systems and bringing their signals into one place. The logo itself is a fixed brand element, independent of live provider status.

## Assets

- `public/brand/pulse-symbol.svg`: transparent black vector mark.
- `public/brand/pulse-symbol-white.svg`: transparent white vector mark.
- `public/brand/pulse-icon.svg`: rounded charcoal application icon.
- Matching 1,024 px PNG files are in the same folder.
- `desktop/icon.ico`: Windows sizes 16, 24, 32, 48, 64, 128, and 256 px.
- `design/pulse-logo-preview.png`: light/dark presentation and small-size reference.

Use the white mark on dark surfaces and the black mark on light surfaces. Keep the supplied proportions and surrounding space. Use the app icon at 16 px and above; use the standalone symbol at 24 px and above. Keep the existing Manrope wordmark rather than substituting another typeface.

`shared/brand.js` defines the geometry used by both React and generated assets. Run `node scripts/generate-icons.mjs` after editing it; run `node scripts/generate-brand-preview.mjs` to refresh the presentation. Android uses a separate transparent 108 dp foreground, charcoal background, and circular legacy icon. Its monochrome notification vector is generated from the same geometry. Windows packaging edits the executable icon while leaving code signing disabled.
