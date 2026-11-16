@echo off
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 goto python
py -3 baslat.py
if errorlevel 1 pause
exit /b
:python
where python >nul 2>&1
if errorlevel 1 goto missing
python baslat.py
if errorlevel 1 pause
exit /b
:missing
echo Bu baslatici Python 3 gerektirir. Mevcut yerel kurulumun varsa onun BASLAT.cmd dosyasini kullan.
pause
