; Custom NSIS script to prevent bootstrapper from appearing in Add/Remove Programs
; This makes it a true lightweight launcher that doesn't clutter the system

; Request admin privileges for the installer
RequestExecutionLevel admin

!macro customInit
  ; Kill any running AoX processes before installation
  nsExec::ExecToLog 'taskkill /F /IM "AoX.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "AoX Matchmaking Client.exe" /T'

  ; Wait a moment for processes to fully terminate
  Sleep 1000

  ; Uninstall old version of bootstrapper if it exists
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\aox-bootstrapper" "UninstallString"
  ${If} $0 != ""
    DetailPrint "Removing old AoX installation..."
    ExecWait '$0 /S _?=$INSTDIR'
    Sleep 1000
  ${EndIf}

  ; Uninstall old AoX Matchmaking Client if it exists
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{aox-matchmaking}" "UninstallString"
  ${If} $0 != ""
    DetailPrint "Removing old AoX Matchmaking Client..."
    ExecWait '$0 /S'
    Sleep 1000
  ${EndIf}
!macroend

!macro customInstall
  ; Don't create uninstall registry entries for the bootstrapper itself
  ; Only the game client will appear in Add/Remove Programs
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
!macroend
