; Windows attributes a toast to the Start Menu shortcut whose AppUserModelID
; matches the one the app sets. Electron creates such a shortcut itself the first
; time it shows a notification and finds none -- and it names that shortcut after
; the Electron binary. The portable build never installed a shortcut of its own,
; so that stray one was the only match for app.pulse.status, which is why every
; notification Pulse sent arrived from "Electron".
;
; This installer lays down a real Pulse shortcut carrying the same id, so the
; stray one has to go: leaving both would be two shortcuts claiming one id, and
; the answer to which one names the toast would be whichever Windows indexed
; first. Delete is silent when the file is absent, so a clean machine is fine.
!macro customInstall
  Delete "$SMPROGRAMS\Electron.lnk"
!macroend
