cd C:\Users\Gabskie09\Downloads\obra-project

:loop
rem Copy new files from Gemini output folder to project root
xcopy /Y /S gemini-output\* .

rem Check for Git changes
git status -s > status.txt
findstr /r /c:"^[AM]" status.txt > nul
if %errorlevel%==0 (
    echo Changes detected, committing...
    git add .
    git commit -m "Auto-update from Gemini Studio %date% %time%"
    git pull origin main --rebase
    git push origin main
    echo Push completed.
) else (
    echo No changes detected.
)

timeout /t 10 > nul
goto loop