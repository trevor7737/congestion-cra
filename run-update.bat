@echo off
set SOCRATA_APP_TOKEN=process.env.SOCRATA_APP_TOKEN || '';

cd /d C:\Users\tcf06\OneDrive\Documents\congestion-cra
node src\scripts\update-bus-speeds.js >> update.log 2>&1
