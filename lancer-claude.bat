@echo off
REM ============================================================
REM  Lancer Claude Code en mode TOTALEMENT AUTONOME
REM  Plus jamais de prompts "Allow?" — Claude fait tout direct
REM  Double-clique sur ce fichier pour lancer ta session
REM ============================================================

cd /d "%~dp0"

echo.
echo  ========================================
echo   NajmCoiff - Claude Code Mode Autonome
echo  ========================================
echo.
echo   Repertoire : %CD%
echo   Mode       : --dangerously-skip-permissions (zero prompt)
echo.
echo   Pour lancer une session : tape "continue" puis Entree
echo   Pour quitter            : tape "/exit" ou Ctrl+D
echo.
echo  ========================================
echo.

claude --dangerously-skip-permissions

REM Si la fenetre se ferme apres exit, retire le pause
pause
