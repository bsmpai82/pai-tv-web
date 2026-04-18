#!/bin/bash
# PAI TV — Instala e configura Caddy como proxy reverso HTTPS
# Execute como root no VPS: bash deploy/setup-caddy.sh
# Pré-requisito: DNS de paitv.com.br já apontando para este servidor

set -e

echo "=== PAI TV — Setup Caddy ==="

# 1. Instala Caddy via repositório oficial
if ! command -v caddy &>/dev/null; then
    echo "[1/4] Instalando Caddy..."
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -q
    apt-get install -y caddy
else
    echo "[1/4] Caddy já instalado: $(caddy version)"
fi

# 2. Copia o Caddyfile
echo "[2/4] Configurando Caddyfile..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile

# 3. Abre portas no firewall
echo "[3/4] Configurando firewall (ufw)..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp  # HTTP/3
echo "Regras adicionadas. Status atual:"
ufw status

# 4. Habilita e inicia o Caddy
echo "[4/4] Iniciando Caddy..."
systemctl daemon-reload
systemctl enable caddy
systemctl restart caddy

echo ""
echo "=== Caddy configurado! ==="
echo ""
echo "Verificar status:     systemctl status caddy"
echo "Ver logs:             journalctl -u caddy -f"
echo "Testar HTTPS:         curl -I https://paitv.com.br"
echo ""
echo "IMPORTANTE: o certificado SSL é obtido automaticamente via Let's Encrypt."
echo "Certifique-se de que paitv.com.br já aponta para o IP deste servidor."
echo ""
