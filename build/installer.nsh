!macro customUnInstall
  ; Remove Registry Run key
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SolasSystemCarePro"
  
  ; Remove Scheduled Task if it exists
  nsExec::ExecToLog 'schtasks /Delete /TN "SolasCarePro_AutoPilot" /F'

  ; Remove AppData
  RMDir /r "$APPDATA\SolasCare"
!macroend
