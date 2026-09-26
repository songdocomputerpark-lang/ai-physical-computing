@echo off
rem ---------------------------------------------------------------------------------------------
rem  AI Physical Computing Open Lab - offline edition launcher (PLAN 5.6, P6-07).
rem  In the zip this file gets the Korean name for "start.bat" (OFFLINE_LAYOUT.startBat in
rem  scripts/lib/offline-site.mjs); scripts/build-offline.mjs renders it with CRLF line endings and
rem  fills the two message slots below (APC_MSG_NOT_EXTRACTED, APC_MSG_FAILED).
rem  What it does: runs server\serve.ps1 (a tiny static web server on http://localhost) with PowerShell.
rem  -ExecutionPolicy Bypass applies to this one run of that one script (no computer setting is changed).
rem
rem  KEEP THIS FILE ASCII ONLY. cmd.exe reads batch files in the console code page and mis-handles UTF-8
rem  multibyte lines even after "chcp 65001" (2026-09-26, Korean Windows 11 code page 949: a Korean rem
rem  line made cmd skip bytes and run the next line as garbage). Korean messages are therefore printed by
rem  PowerShell from \uXXXX escapes that the build puts into those slots
rem  (scripts/lib/offline-site.mjs START_BAT_MESSAGES).
rem ---------------------------------------------------------------------------------------------
setlocal
title AI Physical Computing Open Lab - offline
set "APC_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%APC_PS%" set "APC_PS=powershell.exe"

if not exist "%~dp0server\serve.ps1" goto not_extracted

"%APC_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\serve.ps1" -NoPause %*
if errorlevel 1 goto failed
goto end

:not_extracted
"%APC_PS%" -NoLogo -NoProfile -Command "{{APC_MSG_NOT_EXTRACTED}}"
pause
exit /b 1

:failed
"%APC_PS%" -NoLogo -NoProfile -Command "{{APC_MSG_FAILED}}"
rem The automatic check (scripts/offline/verify-offline.mjs) sets APC_OFFLINE_TEST so no Notepad window opens.
if not defined APC_OFFLINE_TEST for %%F in ("%~dp0*.txt") do start "" notepad "%%~fF"
pause
exit /b 1

:end
endlocal
