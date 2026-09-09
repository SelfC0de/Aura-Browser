@echo off
setlocal
call "C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat" || exit /b 1
cd /d "%~dp0"
rc /nologo AuraBrowser.rc || exit /b 1
cl /nologo /O2 /W3 /DUNICODE /D_UNICODE AuraBrowser.cpp AuraBrowser.res /Fe:..\AuraBrowser.exe /link /SUBSYSTEM:WINDOWS user32.lib || exit /b 1
del /q AuraBrowser.obj AuraBrowser.res 2>nul
echo built %~dp0..\AuraBrowser.exe
rc /nologo AuraLauncher.rc || exit /b 1
cl /nologo /O2 /W3 /EHsc /DUNICODE /D_UNICODE AuraLauncher.cpp AuraLauncher.res /Fe:..\AuraLauncher.exe /link /SUBSYSTEM:WINDOWS user32.lib gdi32.lib winhttp.lib shell32.lib || exit /b 1
del /q AuraLauncher.obj AuraLauncher.res 2>nul
echo built %~dp0..\AuraLauncher.exe
