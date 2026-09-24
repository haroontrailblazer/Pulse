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

; Before it replaces anything, NSIS runs the installed version's own uninstaller,
; which renames every installed file to $PLUGINSDIR\old-install\<the same
; relative path>. NSIS is not long-path aware, so that rename is capped at
; MAX_PATH, and $PLUGINSDIR lives under %LOCALAPPDATA%\Temp, which is longer than
; the install directory -- so paths that installed fine cannot be renamed back
; out. Up to and including 1.0.28 the Windows package carried @capacitor/android
; with the Android Gradle build output still inside it, whose deepest paths reach
; 267 characters. One failed rename aborts that uninstaller with exit code 2, the
; installer retries it five times, and then sits on a MessageBox that carries no
; /SD default, so it blocks even a silent install forever. Measured: 1.0.27 to
; 1.0.28 never completed, while the same artifact installed clean in twelve
; seconds.
;
; 1.0.29 stopped packaging those files, which fixes every upgrade after this one.
; This fixes the upgrade INTO it: the offending tree belongs to the version being
; replaced, so it is already on disk before this installer starts, and only this
; installer can clear it. customInit runs after initMultiUser has resolved
; $INSTDIR to the existing installation and before the install section touches
; it. RMDir /r is silent when the directory is absent, so a clean machine and
; every later upgrade pay nothing.
!macro customInit
  RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\@capacitor"
!macroend

; The safety net for that same MessageBox. electron-builder's default handler
; shows "$(uninstallFailed): $R0" with no /SD and then quits, which is the part
; that turns any failed uninstall into a hang rather than an error: a silent
; installer has nobody to click OK. Replacing the handler keeps the report and
; drops the trap -- /SD IDOK answers it when silent -- and then lets the install
; continue over the old files rather than quitting. Electron overwrites cleanly,
; so installing over a partial removal leaves a working app, which is strictly
; better than an update that stops with the old version still in place.
!macro customUnInstallCheck
  ${if} ${errors}
    DetailPrint "Previous uninstaller could not be started; installing over it."
  ${elseif} $R0 != 0
    DetailPrint "Previous uninstaller exited $R0; installing over it."
    MessageBox MB_OK|MB_ICONEXCLAMATION "Pulse could not completely remove the previous version and will install over it." /SD IDOK
  ${endif}
!macroend
