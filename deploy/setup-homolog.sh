#!/bin/bash
# Setup idempotente do ambiente de homologação PAI TV
# Rodar no VPS como root: bash /root/pai-tv-web-homolog/deploy/setup-homolog.sh
set -e

REPO="https://github.com/bsmpai82/pai-tv-web"
DIR="/root/pai-tv-web-homolog"
SERVER_DIR="$DIR/server"

echo "==> [1/6] Clonando / atualizando repositório..."
if [ ! -d "$DIR" ]; then
  git clone "$REPO" "$DIR"
fi
cd "$DIR"
git fetch origin
git checkout develop
git pull origin develop

echo "==> [2/6] Instalando dependências npm..."
cd "$SERVER_DIR"
npm install

echo "==> [3/6] Criando diretórios de dados..."
mkdir -p /srv/pai_tv_homolog/thumbs /srv/pai_tv_homolog/releases

echo "==> [4/6] Criando .env (se não existir)..."
if [ ! -f "$SERVER_DIR/.env" ]; then
  SECRET=$(openssl rand -hex 32)
  cat > "$SERVER_DIR/.env" <<EOF
PORT=3001
APP_ENV=homolog
DB_PATH=./db/pai_tv_homolog.db
VIDEOS_PATH=./uploads
THUMBS_PATH=/srv/pai_tv_homolog/thumbs
RELEASES_PATH=/srv/pai_tv_homolog/releases
SESSION_SECRET=$SECRET
# GMAIL_* ausentes — evita alertas de homolog chegarem nos destinatarios reais
EOF
  echo "    .env criado em $SERVER_DIR/.env"
  echo "    Revise o arquivo se necessário antes de continuar."
else
  echo "    .env já existe, mantendo."
fi

echo "==> [5/6] Iniciando com PM2..."
cd "$SERVER_DIR"
if pm2 describe pai-tv-homolog > /dev/null 2>&1; then
  pm2 restart pai-tv-homolog
else
  pm2 start server.js --name pai-tv-homolog
fi
pm2 save

echo "==> [6/6] Conferindo o Caddyfile..."
# ATENCAO: deploy/Caddyfile so tem os blocos do PAI TV. Os blocos de sgi.paitv.com.br e
# quiz.paitv.com.br vivem apenas em /etc/caddy/Caddyfile. Copiar por cima derruba os dois
# (incidente de 2026-08-07 com o setup-caddy.sh; mesma protecao aplicada aqui).
DEST=/etc/caddy/Caddyfile
SRC="$DIR/deploy/Caddyfile"
if [ ! -f "$DEST" ]; then
  echo "    Nenhum Caddyfile existente - copiando pela primeira vez."
  cp "$SRC" "$DEST"
  caddy reload --config "$DEST"
elif diff -q "$SRC" "$DEST" >/dev/null; then
  echo "    Caddyfile da VPS ja e igual ao do repo - nada a fazer."
elif [ "$1" = "--force" ]; then
  BACKUP="$DEST.bak-$(date +%F-%H%M%S)"
  cp "$DEST" "$BACKUP"
  echo "    --force informado: sobrescrevendo. Backup em $BACKUP."
  cp "$SRC" "$DEST"
  caddy reload --config "$DEST"
else
  echo "    !!! O Caddyfile da VPS e DIFERENTE do repo (provavelmente tem sgi/quiz). NAO foi alterado."
  echo "    Para sobrescrever mesmo assim (com backup automatico): bash $0 --force"
fi

echo ""
echo "Homolog configurado!"
echo "  URL:    https://homolog.paitv.com.br"
echo "  PM2:    pai-tv-homolog (porta 3001)"
echo "  Banco:  $SERVER_DIR/db/pai_tv_homolog.db"
echo ""
echo "Próximo passo: crie o usuário master da homolog:"
echo "  cd $SERVER_DIR && node setup.js"
