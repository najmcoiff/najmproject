param([switch]$all, [switch]$skipCleanup)

$DEPLOYMENT_ID = "AKfycbzWvXYmEucYGijHWl_rBAqFY4h4caFQFMh99AmEqAgi9QMAH5N0xsI0Y-cCge6LCgQ"
$GAS_DIR       = "C:\Users\Informatics\Desktop\MonProjetAppsScript"
$VERCEL_DIR    = "C:\Users\Informatics\Desktop\MonProjetAppsScript\vercel-quick"

Write-Host "--- DEPLOY Najm Coiff ---" -ForegroundColor Cyan

# 0. VÃ©rification versions GAS (sauf si --skipCleanup)
if (-not $skipCleanup) {
    Write-Host "[0] VÃ©rification versions GAS..." -ForegroundColor Yellow
    Set-Location $GAS_DIR
    node scripts/cleanup-gas.js --check
    $cleanupCode = $LASTEXITCODE

    if ($cleanupCode -eq 2) {
        Write-Host "" 
        Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Red
        Write-Host "â•‘  ðŸš¨ DÃ‰PLOIEMENT BLOQUÃ‰ â€” Limite versions GAS atteinte â•‘" -ForegroundColor Red
        Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Tu dois d'abord supprimer des versions dans l'Ã©diteur GAS." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Ã‰TAPES :" -ForegroundColor Yellow
        Write-Host "  1. node scripts/cleanup-gas.js --open   â† ouvre l'Ã©diteur GAS" -ForegroundColor White
        Write-Host "  2. Cliquer sur l'icÃ´ne âŸ³ (Historique du projet)" -ForegroundColor White
        Write-Host "  3. Supprimer les versions anciennes" -ForegroundColor White
        Write-Host "  4. Relancer: .\deploy.ps1" -ForegroundColor White
        Write-Host ""
        node scripts/cleanup-gas.js --open
        exit 1
    }
    elseif ($cleanupCode -eq 1) {
        Write-Host "  âš ï¸  Versions GAS bientÃ´t pleines â€” pense Ã  nettoyer" -ForegroundColor Yellow
        Write-Host "     Lance: node scripts/cleanup-gas.js  pour voir les dÃ©tails" -ForegroundColor DarkYellow
    }
    else {
        Write-Host "  âœ… Versions GAS OK" -ForegroundColor Green
    }
}

# 1. Push GAS
Write-Host "[1] clasp push..." -ForegroundColor Yellow
Set-Location $GAS_DIR
clasp push --force
if ($LASTEXITCODE -ne 0) { Write-Host "ECHEC clasp push" -ForegroundColor Red; exit 1 }
Write-Host "OK - fichiers GAS poussÃ©s" -ForegroundColor Green

# 2. Deploy GAS
Write-Host "[2] clasp deploy..." -ForegroundColor Yellow
$ts = Get-Date -Format "yyyy-MM-dd HH:mm"
clasp deploy --deploymentId $DEPLOYMENT_ID --description "auto $ts"
if ($LASTEXITCODE -ne 0) { Write-Host "ECHEC clasp deploy" -ForegroundColor Red; exit 1 }
Write-Host "OK - GAS dÃ©ployÃ© en production" -ForegroundColor Green

# 3. Vercel (optionnel)
if ($all) {
    Write-Host "[3] Vercel deploy..." -ForegroundColor Yellow
    Set-Location $VERCEL_DIR
    npx vercel --prod --token "VOIR_CONTROLE_TOTALE_MD" --yes
    if ($LASTEXITCODE -ne 0) { Write-Host "ECHEC Vercel" -ForegroundColor Red; exit 1 }
    Write-Host "OK - Vercel dÃ©ployÃ©" -ForegroundColor Green
} else {
    Write-Host "[3] Vercel ignorÃ© - utilise '.\deploy.ps1 -all' pour dÃ©ployer aussi le frontend" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "--- DEPLOY TERMINÃ‰ ---" -ForegroundColor Cyan

# Rappel stats versions aprÃ¨s deploy
Set-Location $GAS_DIR
node scripts/cleanup-gas.js --check > $null 2>&1
$code = $LASTEXITCODE
if ($code -ge 1) {
    Write-Host ""
    Write-Host "âš ï¸  Rappel: versions GAS bientÃ´t pleines â†’ node scripts/cleanup-gas.js" -ForegroundColor Yellow
}

