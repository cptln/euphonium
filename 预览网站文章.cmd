@echo off
cd /d "%~dp0"
python -B scripts\writing-site.py --open
if errorlevel 1 pause
