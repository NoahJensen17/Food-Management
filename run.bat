@echo off
cd /d "%~dp0"
echo Starting Home app server at http://localhost:5173 ...
start "" http://localhost:5173/index.html
py -m http.server 5173
