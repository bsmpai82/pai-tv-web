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
# ATENÇÃO: este arquivo só tem os blocos do PAI TV (paitv.com.br + homolog.paitv.com.br).
# Outros sites da VPS (ex.: sgi.paitv.com.br, quiz.paitv.com.br) têm blocos adicionados
# manualmente direto em /etc/caddy/Caddyfile e NÃO existem aqui no repo — um `cp` sem
# checagem os apaga (incidente real em 2026-08-07: rodar este script derrubou sgi e quiz).
echo "[2/4] Configurando Caddyfile..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST=/etc/caddy/Caddyfile

if [ ! -f "$DEST" ]; then
    echo "Nenhum Caddyfile existente — copiando pela primeira vez."
    cp "$SCRIPT_DIR/Caddyfile" "$DEST"
elif diff -q "$SCRIPT_DIR/Caddyfile" "$DEST" >/dev/null; then
    echo "Caddyfile da VPS já é igual ao do repo — nada a fazer."
elif [ "$1" = "--force" ]; then
    BACKUP="$DEST.bak-$(date +%F-%H%M%S)"
    cp "$DEST" "$BACKUP"
    echo "--force informado: sobrescrevendo mesmo assim. Backup salvo em $BACKUP."
    cp "$SCRIPT_DIR/Caddyfile" "$DEST"
else
    echo ""
    echo "!!! O Caddyfile da VPS é DIFERENTE do deste repo e provavelmente tem blocos"
    echo "!!! de outros sites (sgi, quiz, etc.) que seriam apagados. Abortando sem mexer."
    echo ""
    echo "Diferenças ($DEST vs $SCRIPT_DIR/Caddyfile):"
    diff "$DEST" "$SCRIPT_DIR/Caddyfile" || true
    echo ""
    echo "Se tiver certeza que quer sobrescrever mesmo assim (um backup automático será"
    echo "criado antes), rode: bash $0 --force"
    exit 1
fi

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
