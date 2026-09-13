# Pulse marketing assets

The public landing page lives in `landing.html` and `src/marketing/`. It uses the same DM Sans and Manrope variable fonts as the dashboard. The primary action opens `/app`; download cards use the versioned release URLs in `shared/downloads.js`.

## Product screenshots

`public/marketing/{overview,map-light,map-dark,incidents,insights}.jpg` are captures of the actual local Pulse application with official source data. They are 1803 × 1082 pixels. Capture time and viewport details are recorded in `public/marketing/screenshots.json`. The page labels screenshots as illustrative snapshots and links to the dashboard for current readings. No incident values were fabricated for the screenshots.

## Platform artwork

- The browser and Windows illustrations are CSS geometry with dimensional lighting and pointer tilt, defined in `src/marketing/marketing.css`. They respect reduced-motion preferences.
- `public/marketing/android-mascot.png` was generated using the built-in image-generation tool and copied into the repository. It is decorative platform artwork, not a product screenshot. Its backdrop blends into the download card.

Generation prompt:

> Use case: stylized-concept. Create one premium 3D product illustration for the Android download card on a developer status-monitoring app website called Pulse. Subject: a charming recognizable green Android robot mascot, full body, two antennae, friendly small dark eyes, one arm casually waving. Smooth satin mint-green ceramic/plastic material, rounded forms, subtle realistic bevels and soft ambient occlusion, sophisticated physical studio render, slight three-quarter view, centered, generous empty space around the mascot. Backdrop: uniform warm off-white #f5f5f2, with a soft short floor contact shadow. Lighting: very soft large studio light from upper left, refined gentle highlights. No text, no letters, no watermarks, no other objects, no floor horizon. Square high resolution image. This is a standalone decorative platform mascot, not a screenshot or user interface.

## Build separation

`npm run build:web` builds the landing page and dashboard for Vercel. The regular native build includes only the dashboard and excludes marketing imagery, keeping the APK and EXE focused on the installed application.
