#!/bin/bash
# Setup do backup diário do banco de produção do PAI TV
# Rodar no VPS como root: bash /root/pai-tv-web/deploy/setup-backup.sh
set -e

DB_PATH="/root/pai-tv-web/server/db/pai_tv.db"
BACKUP_DIR="/srv/pai_tv/backups"
CRON_FILE="/etc/cron.d/paitv-backup"

echo "==> [1/3] Verificando o CLI do sqlite3..."
if ! command -v sqlite3 &>/dev/null; then
    echo "    sqlite3 não encontrado, instalando..."
    apt-get update -q
    apt-get install -y sqlite3
else
    echo "    sqlite3 já instalado: $(sqlite3 --version)"
fi

echo "==> [2/3] Criando diretório de backups..."
mkdir -p "$BACKUP_DIR"

echo "==> [3/3] Configurando cron diário..."
cat > "$CRON_FILE" <<EOF
# Backup diário do banco de produção do PAI TV (.backup do sqlite, seguro com WAL)
45 3 * * * root sqlite3 $DB_PATH ".backup '$BACKUP_DIR/pai_tv-\$(date +\%F).db'" && gzip -f "$BACKUP_DIR/pai_tv-\$(date +\%F).db" && find $BACKUP_DIR -name 'pai_tv-*.db.gz' -mtime +7 -delete
EOF
chmod 644 "$CRON_FILE"

echo ""
echo "Backup configurado!"
echo "  Cron:    $CRON_FILE (03h45 diariamente)"
echo "  Destino: $BACKUP_DIR/pai_tv-AAAA-MM-DD.db.gz"
echo "  Retenção: 7 dias"
echo ""
echo "Testar agora manualmente:"
echo "  sqlite3 $DB_PATH \".backup '$BACKUP_DIR/pai_tv-\$(date +%F).db'\" && gzip -f $BACKUP_DIR/pai_tv-\$(date +%F).db"
echo "Verificar integridade de um backup:"
echo "  gunzip -k $BACKUP_DIR/pai_tv-AAAA-MM-DD.db.gz && sqlite3 $BACKUP_DIR/pai_tv-AAAA-MM-DD.db 'PRAGMA integrity_check;'"
echo ""
