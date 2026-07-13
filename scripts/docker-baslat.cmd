@echo off
rem Docker Desktop'i bu makinedeki soket sorununa karsi guvenli baslatir.
rem Sorun: eski soket dosyalari (AppData altinda) yeniden baslatma sonrasi
rem erisilmez kaliyor ve Docker acilista bunlari silemeyince cokuyor.
rem Kullanim: dosyaya cift tikla ya da komut satirinda scripts\docker-baslat.cmd

taskkill /f /im "Docker Desktop.exe" >nul 2>&1
taskkill /f /im com.docker.backend.exe >nul 2>&1
rem 2 sn bekle (timeout yerine ping: etkilesimsiz kabukta da calisir)
ping -n 3 127.0.0.1 >nul

call :supur "%LOCALAPPDATA%\Docker\run"
call :supur "%LOCALAPPDATA%\docker-secrets-engine"

start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Docker Desktop baslatildi; motor 1-2 dk icinde hazir olur.
exit /b 0

:supur
rem Klasoru sil; silinemiyorsa (erisilemez soket dosyalari) kenara tasi.
rem Kenara alinanlar zararsizdir, bir yeniden baslatma sonrasi silinebilirler.
if not exist %1 exit /b 0
rd /s /q %1 2>nul
if exist %1 ren %1 "eski_%RANDOM%"
exit /b 0
