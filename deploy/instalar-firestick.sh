#!/bin/bash
# PAI TV — Instala o APK em um ou mais Fire Sticks via ADB (rede)
# Uso: bash instalar-firestick.sh <ip1> [<ip2> ...]
# Exemplo: bash instalar-firestick.sh 192.168.1.50 192.168.1.51

APK="pai-tv.apk"
PACKAGE="com.paitv"
ACTIVITY="com.paitv/.MainActivity"

if [ $# -eq 0 ]; then
    echo "Uso: $0 <ip-firestick1> [<ip2> ...]"
    exit 1
fi

if [ ! -f "$APK" ]; then
    echo "ERRO: $APK não encontrado na pasta atual."
    echo "Compile o app no Android Studio (Build > Generate Signed APK) e copie para esta pasta."
    exit 1
fi

for IP in "$@"; do
    echo ""
    echo "=== Fire Stick: $IP ==="

    echo "  Conectando via ADB..."
    adb connect "$IP:5555"
    sleep 1

    echo "  Instalando APK..."
    adb -s "$IP:5555" install -r "$APK"

    echo "  Concedendo permissão de autostart..."
    adb -s "$IP:5555" shell pm grant "$PACKAGE" android.permission.RECEIVE_BOOT_COMPLETED 2>/dev/null || true

    echo "  Iniciando o app..."
    adb -s "$IP:5555" shell am start -n "$ACTIVITY"

    echo "  OK: $IP"
done

echo ""
echo "=== Instalação concluída em todos os dispositivos ==="
