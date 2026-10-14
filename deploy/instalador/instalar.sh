#!/usr/bin/env bash
# Prepara a maquina Linux instaladora para usar o app grafico "PAI TV Instalador".
#
# Uso (uma vez por maquina, depois do git clone):
#   bash ~/pai-tv-web/deploy/instalador/instalar.sh
#
# O que faz:
#   1. instala python3-tk e adb via apt
#   2. pergunta o link de download do APK (paitv.com.br/settings -> "Distribuicao do APK")
#      e grava em ~/.config/paitv-instalador/config.json
#   3. cria o atalho "PAI TV Instalador" no menu de aplicativos e na area de trabalho
#
# Pode rodar de novo sem problema (ex: para trocar o link apos rotacionar o token).

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
APP="$DIR/paitv-instalador.py"
ICONE="$REPO/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/paitv-instalador"
CONFIG="$CONFIG_DIR/config.json"

echo "=== 1/3 Instalando pacotes (pede a senha do sudo) ==="
sudo apt update
sudo apt install -y python3 python3-tk adb

echo
echo "=== 2/3 Link do APK ==="
ATUAL=""
if [ -f "$CONFIG" ]; then
    ATUAL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("apk_url",""))' "$CONFIG" 2>/dev/null || true)"
fi
[ -n "$ATUAL" ] && echo "Link atual: $ATUAL"
echo "Cole o link de download do APK (paitv.com.br/settings -> card 'Distribuicao do APK')."
read -rp "Link (Enter para manter o atual / configurar depois no app): " URL
if [ -n "$URL" ]; then
    mkdir -p "$CONFIG_DIR"
    python3 - "$CONFIG" "$URL" <<'EOF'
import json, sys
caminho, url = sys.argv[1], sys.argv[2].strip()
if not url.startswith(("http://", "https://")):
    url = "https://" + url
try:
    config = json.load(open(caminho))
except (OSError, ValueError):
    config = {}
config["apk_url"] = url
json.dump(config, open(caminho, "w"), indent=2)
print("Link salvo.")
EOF
fi

echo
echo "=== 3/3 Criando atalhos ==="
ATALHO="$HOME/.local/share/applications/paitv-instalador.desktop"
mkdir -p "$(dirname "$ATALHO")"
cat > "$ATALHO" <<EOF
[Desktop Entry]
Type=Application
Name=PAI TV Instalador
Comment=Reiniciar, atualizar e instalar o PAI TV nos sticks
Exec=python3 "$APP"
Icon=$ICONE
Terminal=false
Categories=Utility;
EOF
chmod +x "$ATALHO" "$APP"
echo "Menu de aplicativos: $ATALHO"

DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP" ]; then
    cp "$ATALHO" "$DESKTOP/"
    chmod +x "$DESKTOP/paitv-instalador.desktop"
    # GNOME: marca como confiavel para abrir com duplo clique sem perguntar
    gio set "$DESKTOP/paitv-instalador.desktop" metadata::trusted true 2>/dev/null || true
    echo "Area de trabalho: $DESKTOP/paitv-instalador.desktop"
fi

echo
echo "Pronto. Abra 'PAI TV Instalador' pelo menu ou pela area de trabalho."
echo "Se o icone da area de trabalho pedir, clique com o botao direito -> 'Permitir execucao'."
