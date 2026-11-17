@echo off
rem Refreshes the dashboard data files in public\data by hand.
cd /d "%~dp0"
node src\scripts\update-data.mjs >> update.log 2>&1
