# Navigation and the back gesture


Every destination is a real history entry with its own URL, and every overlay a
reader can dismiss -- the six sheets, the phone's More menu, the map's inspector
and the provider level inside it, each filter picker -- is a history entry too,
with no URL of its own and never restorable from a cold load. That one decision is
what lets a single back press be unambiguous on all three surfaces: an overlay's
entry always sits directly on its own page's entry, so one press can never be
asked to close a sheet and change the page at the same time, and no surface has to
inspect React state to work out which it should do.

Routes, in `shared/navigation.js`: Overview is the base, then `incidents`,
`watchlist`, `map`, `tools`, `insights`. The base path is read from the document
rather than compiled in, because the hosted site answers under `/app` while the
EXE, the APK and the dev server answer at `/`. No slug contains a dot: the two
extension-less fallbacks these deep links rely on -- `server/index.js` in the EXE
and Capacitor's `WebViewLocalServer` in the APK -- both key off one.

Policy is linear. Tapping a destination pushes one entry, exactly as a browser
treats a link, so back retraces the path actually walked: Overview, Watchlist, then
the Overview icon leaves three entries and takes three presses to unwind.
Re-tapping the destination you are already on adds nothing. Filters, search, the
developer tool selection and the map's region and zoom are controls on a page, not
places, and earn no entry.

What each surface adds:

- The website gets shareable, reload-safe URLs and a working forward button. Its
  first entry is written with `replaceState`, never `pushState`, so the entry the
  reader arrived on stays theirs and back always leaves for the page they came
  from. Nothing traps them.
- The EXE binds the two gestures an Electron window has no chrome for: Alt+Left
  and Alt+Right in the renderer, where a text field can be seen and left alone,
  and the mouse's fourth and fifth buttons through `app-command` in the main
  process. It is also the only surface that draws a back control, because it is the
  only one with neither browser chrome nor a system gesture.
- The APK registers one `OnBackPressedCallback`. It does not read
  `WebView.canGoBack()`: measured on API 36, that reported false while the page
  reported `history.length` 2, because same-document entries are not in the
  `WebBackForwardList` it consults -- so trusting it would close the app with a
  sheet still open. The web layer reports whether Pulse has anywhere to go whenever
  that changes, the callback is armed from that, and the press is handed back to
  the web layer to act on. At the root the callback is disabled so the platform can
  play its own predictive back-to-home preview, and the task is backgrounded rather
  than finished, keeping the process warm. Below API 34 there is no preview to
  protect, so the press is confirmed with a toast instead -- otherwise the oldest
  supported devices would still leave with no warning at all.

Gates: `npm run qa:nav` drives real back and forward gestures over four profiles
(dev, hosted `/app`, EXE-shaped, APK-shaped) and writes
`test-results/navigation.json`. `npm run qa:apk-nav` drives the hardware back key
on a connected device or emulator over the WebView's own devtools socket and
writes `test-results/navigation-apk.json`.

