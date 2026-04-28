# Lancer Claude Code en mode TOTALEMENT AUTONOME (PowerShell)
# Usage : clic droit sur le fichier -> "Executer avec PowerShell"
# Ou via terminal : .\lancer-claude.ps1

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host " ========================================" -ForegroundColor Cyan
Write-Host "  NajmCoiff - Claude Code Mode Autonome" -ForegroundColor Cyan
Write-Host " ========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Repertoire : $PSScriptRoot" -ForegroundColor Gray
Write-Host "  Mode       : --dangerously-skip-permissions (zero prompt)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Pour lancer une session : tape 'continue' puis Entree" -ForegroundColor Green
Write-Host "  Pour quitter            : tape '/exit' ou Ctrl+D" -ForegroundColor Green
Write-Host ""
Write-Host " ========================================" -ForegroundColor Cyan
Write-Host ""

claude --dangerously-skip-permissions
