@echo off
set /p LINE=<.env
set TOKEN=%LINE:GITHUB_TOKEN=%
git push -u https://%TOKEN%@://github.com main
pause
