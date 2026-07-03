#!/usr/bin/env bash
# Diagnostico e correcao de autostart (modo kiosk) em stick Intelbras IZY Play.
# Versao Linux do deploy/kiosk-intelbras.ps1 — mesma receita validada em 2026-07-03.
#
# Receita (firmware Android 14 com launcher antigo tvlauncher):
#   - set-home-activity sozinho NAO basta: o boot do firmware re-fixa o launcher Google
#     como HOME preferido, mesmo com o role android.app.role.HOME correto.
#   - pm disable-user e pm uninstall --user 0 sao BLOQUEADOS pelo OEM
#     ("Warning! This command is illegal!" / "core application").
#   - pm suspend PASSA e sobrevive ao reboot. Com o launcher suspenso, a preferencia
#     de HOME do PAI TV nao e resetada no boot e o app abre sozinho.
#   - Botao HOME do controle: abre o dialogo "app suspenso" por alguns segundos;
#     o watchdog do app (SyncService) relanca a MainActivity em ate 1 min.
#
# Uso:
#   ./kiosk-intelbras.sh -i 192.168.10.194                    # diagnostico apenas
#   ./kiosk-intelbras.sh -i 192.168.10.194 -a                 # homolog (default) como HOME
#   ./kiosk-intelbras.sh -i 192.168.10.194 -f prod -a         # producao como HOME
#   ./kiosk-intelbras.sh -i 192.168.10.194 -r                 # devolve o launcher original
#
# Dica (troca HML -> prod): desinstalar o HML enquanto ele e o HOME ativo falha com
# DELETE_FAILED_INTERNAL_ERROR. Defina o prod como HOME (-f prod -a), espere o boot
# e so entao rode: adb uninstall com.paitv.homolog

set -euo pipefail

IP=""
FLAVOR="homolog"
ACAO="diagnostico"

uso() { grep '^# ' "$0" | sed 's/^# //'; exit 1; }

while getopts "i:f:arh" opt; do
    case $opt in
        i) IP="$OPTARG" ;;
        f) FLAVOR="$OPTARG" ;;
        a) ACAO="aplicar" ;;
        r) ACAO="reverter" ;;
        *) uso ;;
    esac
done

[ -z "$IP" ] && { echo "Erro: informe o IP do stick com -i"; uso; }
case "$FLAVOR" in
    prod)    PACOTE="com.paitv" ;;
    homolog) PACOTE="com.paitv.homolog" ;;
    *) echo "Erro: -f deve ser prod ou homolog"; exit 1 ;;
esac

command -v adb >/dev/null || { echo "Erro: adb nao encontrado no PATH"; exit 1; }

# A classe da activity e sempre com.paitv.MainActivity; o que muda por flavor e o applicationId
COMPONENTE="$PACOTE/com.paitv.MainActivity"
LAUNCHER="com.google.android.tvlauncher"

adb connect "${IP}:5555"

echo
echo "=== Launchers que respondem a HOME ==="
adb shell "cmd package query-activities -c android.intent.category.HOME -a android.intent.action.MAIN" | grep -E "name=|packageName=|priority" || true

echo
echo "=== Pacotes de launcher presentes ==="
adb shell "pm list packages" | grep -E "launcherx|tvlauncher|tungsten|paitv" || true

echo
echo "=== Launcher Google suspenso? ==="
adb shell "dumpsys package $LAUNCHER" | grep "suspended=" | head -n 1 || true

echo
echo "=== HOME preferido atual ==="
adb shell "dumpsys package preferred" | head -n 6

if [ "$ACAO" = "reverter" ]; then
    echo
    echo "=== Revertendo: launcher Google TV volta a ser HOME ==="
    adb shell "pm unsuspend $LAUNCHER"
    adb shell "cmd package set-home-activity $LAUNCHER/$LAUNCHER.MainActivity"
    adb reboot
    exit 0
fi

if [ "$ACAO" = "aplicar" ]; then
    echo
    echo "=== Definindo $COMPONENTE como HOME ==="
    adb shell "cmd package set-home-activity $COMPONENTE"
    echo
    echo "=== Suspendendo o launcher Google (impede o reset do HOME no boot) ==="
    adb shell "pm suspend $LAUNCHER"
    echo
    echo "=== HOME preferido apos os comandos ==="
    adb shell "dumpsys package preferred" | head -n 6
    echo
    echo "Reiniciando o stick para validar o boot..."
    adb reboot
    echo "Apos o boot o PAI TV ($FLAVOR) deve abrir sozinho em ~30-60s."
    echo "Valide tambem: botao HOME do controle -> watchdog relanca em ate 1 min; e cold boot (tomada)."
fi
