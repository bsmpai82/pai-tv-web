#!/bin/bash
# PAI TV — Script de instalação do servidor no Ubuntu 24.04 LTS
# Execute como root: sudo bash setup-ubuntu.sh

set -e

echo "=== PAI TV Server — Setup Ubuntu 24.04 ==="

# 1. Atualiza pacotes
apt-get update -q

# 2. Instala Node.js 20 LTS (via NodeSource)
if ! command -v node &>/dev/null; then
    echo "[1/6] Instalando Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[1/6] Node.js já instalado: $(node -v)"
fi

# 3. Cria usuário de serviço (sem login)
if ! id paitv &>/dev/null; then
    echo "[2/6] Criando usuário 'paitv'..."
    useradd --system --no-create-home --shell /usr/sbin/nologin paitv
else
    echo "[2/6] Usuário 'paitv' já existe."
fi

# 4. Cria estrutura de diretórios
echo "[3/6] Criando diretórios..."
mkdir -p /opt/pai-tv/server
mkdir -p /srv/pai_tv/videos
chown -R paitv:paitv /opt/pai-tv /srv/pai_tv

# 5. Copia arquivos do servidor (execute do diretório do projeto)
echo "[4/6] Copiando arquivos do servidor..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_SRC="$SCRIPT_DIR/../server"

if [ ! -d "$SERVER_SRC" ]; then
    echo "ERRO: Pasta server/ não encontrada em $SERVER_SRC"
    echo "Execute este script a partir da pasta deploy/ do projeto."
    exit 1
fi

cp -r "$SERVER_SRC"/* /opt/pai-tv/server/
chown -R paitv:paitv /opt/pai-tv/server

# 6. Instala dependências npm
echo "[5/6] Instalando dependências npm..."
cd /opt/pai-tv/server
sudo -u paitv npm install --omit=dev

# 7. Instala o serviço systemd
echo "[6/6] Instalando serviço systemd..."
cp "$SCRIPT_DIR/pai-tv.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable pai-tv

echo ""
echo "=== Instalação concluída! ==="
echo ""
echo "Próximo passo: configure a senha do painel:"
echo "  cd /opt/pai-tv/server && sudo -u paitv node setup.js"
echo ""
echo "Depois inicie o servidor:"
echo "  systemctl start pai-tv"
echo ""
echo "Verifique o status:"
echo "  systemctl status pai-tv"
echo "  journalctl -u pai-tv -f"
echo ""
