# Summary

<!-- What changes, and why. One or two paragraphs is usually enough. -->

## Linked issue

<!-- e.g. Closes #123. Write "none" if this stands on its own. -->

## Surfaces affected

- [ ] Website
- [ ] Windows EXE
- [ ] Android APK
- [ ] Docs only

## Verification

- [ ] `npm test` passes locally.
- [ ] Beyond a docs-only change, `node scripts/release-harness.mjs prepare` was
      run and all three artifacts built and verified.
- [ ] No generated binaries or signing material is staged — nothing from
      `releases/`, `public/downloads/`, `dist/`, and no keystores or keys.
- [ ] Screenshots are attached below for any change to the interface.

<!-- Screenshots, before and after, for UI changes. -->

---

A docs-only change may skip the native gate. Anything touching application,
native, shared, branding or build code is a three-surface delivery and follows
the release sequence in [AGENTS.md](https://github.com/haroontrailblazer/Pulse/blob/main/AGENTS.md); preparing a public
installer release additionally requires the `--launch-native` gate on Windows
with a device attached.
