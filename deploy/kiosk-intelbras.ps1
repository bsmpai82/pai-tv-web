# Diagnostico e correcao de autostart (modo kiosk) em stick Intelbras IZY Play.
#
# Receita validada em homolog (2026-07-03) em firmware Android 14 com launcher antigo tvlauncher:
#   - set-home-activity sozinho NAO basta: o boot do firmware re-fixa o launcher Google
#     como HOME preferido (mAlways=true), mesmo com o role android.app.role.HOME correto.
#   - pm disable-user e pm uninstall --user 0 sao BLOQUEADOS pelo OEM
#     ("Warning! This command is illegal!" / "core application").
#   - pm suspend PASSA e sobrevive ao reboot. Com o launcher suspenso, a preferencia
#     de HOME do PAI TV nao e resetada no boot e o app abre sozinho.
#   - Botao HOME do controle: abre o dialogo "app suspenso" por alguns segundos;
#     o watchdog do app (SyncService) relanca a MainActivity em ate 1 min.
#
# Uso:
#   .\kiosk-intelbras.ps1 -Ip 192.168.31.182                          # diagnostico apenas
#   .\kiosk-intelbras.ps1 -Ip 192.168.31.182 -Aplicar                 # homolog (default) como HOME
#   .\kiosk-intelbras.ps1 -Ip 192.168.31.182 -Flavor prod -Aplicar    # producao como HOME
#   .\kiosk-intelbras.ps1 -Ip 192.168.31.182 -Reverter                # devolve o launcher original
param(
    [Parameter(Mandatory)] [string]$Ip,
    [ValidateSet("homolog", "prod")] [string]$Flavor = "homolog",
    [switch]$Aplicar,
    [switch]$Reverter
)

$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $ADB)) { Write-Error "adb nao encontrado em $ADB"; exit 1 }

# A classe da activity e sempre com.paitv.MainActivity; o que muda por flavor e o applicationId
$pacote = if ($Flavor -eq "prod") { "com.paitv" } else { "com.paitv.homolog" }
$componente = "$pacote/com.paitv.MainActivity"
$launcher   = "com.google.android.tvlauncher"

& $ADB connect "${Ip}:5555"

Write-Host "`n=== Launchers que respondem a HOME ===" -ForegroundColor Cyan
& $ADB shell "cmd package query-activities -c android.intent.category.HOME -a android.intent.action.MAIN" | Select-String "name=|packageName=|priority"

Write-Host "`n=== Pacotes de launcher presentes ===" -ForegroundColor Cyan
& $ADB shell "pm list packages" | Select-String "launcherx|tvlauncher|tungsten|paitv"

Write-Host "`n=== Launcher Google suspenso? ===" -ForegroundColor Cyan
& $ADB shell "dumpsys package $launcher" | Select-String "suspended=" | Select-Object -First 1

Write-Host "`n=== HOME preferido atual ===" -ForegroundColor Cyan
& $ADB shell "dumpsys package preferred" | Select-Object -First 6

if ($Reverter) {
    Write-Host "`n=== Revertendo: launcher Google TV volta a ser HOME ===" -ForegroundColor Yellow
    & $ADB shell "pm unsuspend $launcher"
    & $ADB shell "cmd package set-home-activity $launcher/$launcher.MainActivity"
    & $ADB reboot
    exit 0
}

if ($Aplicar) {
    Write-Host "`n=== Definindo $componente como HOME ===" -ForegroundColor Yellow
    & $ADB shell "cmd package set-home-activity $componente"
    Write-Host "`n=== Suspendendo o launcher Google (impede o reset do HOME no boot) ===" -ForegroundColor Yellow
    & $ADB shell "pm suspend $launcher"
    Write-Host "`n=== HOME preferido apos os comandos ===" -ForegroundColor Cyan
    & $ADB shell "dumpsys package preferred" | Select-Object -First 6
    Write-Host "`nReiniciando o stick para validar o boot..." -ForegroundColor Yellow
    & $ADB reboot
    Write-Host "Apos o boot o PAI TV ($Flavor) deve abrir sozinho em ~30-60s."
    Write-Host "Valide tambem: botao HOME do controle -> watchdog relanca em ate 1 min; e cold boot (tomada)."
}
