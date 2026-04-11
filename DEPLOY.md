# PAI TV — Guia de Deploy

## Visão geral

```
[Windows - desenvolvimento]  →  [Ubuntu 24.04 LTS - servidor]  ←→  [Fire TV Sticks]
  D:/DEV/PAI TV/                  /opt/pai-tv/server/
                                  /srv/pai_tv/videos/
```

---

## Parte 1 — Servidor (Ubuntu 24.04 LTS)

### Pré-requisitos
- Desktop com Ubuntu 24.04 LTS instalado e conectado à LAN
- IP fixo configurado (ex.: `192.168.1.100`) — configure no roteador ou no Ubuntu
- Acesso SSH ou terminal local com sudo

### 1.1 — Transferir os arquivos

No Windows, copie a pasta `server/` para o Ubuntu via SCP ou pen drive:

```bash
# No Windows (PowerShell), substituindo pelo IP do servidor:
scp -r "D:/DEV/PAI TV/" usuario@192.168.1.100:~/pai-tv
```

### 1.2 — Executar o script de instalação

```bash
# No Ubuntu, entre na pasta copiada:
cd ~/pai-tv/deploy

# Execute como root:
sudo bash setup-ubuntu.sh
```

O script:
- Instala Node.js 20 LTS
- Cria o usuário de serviço `paitv`
- Cria `/opt/pai-tv/server/` e `/srv/pai_tv/videos/`
- Instala dependências npm
- Registra o serviço systemd

### 1.3 — Configurar a senha do painel

```bash
cd /opt/pai-tv/server
sudo -u paitv node setup.js
```

Quando solicitado, digite a senha que o admin usará para acessar o painel web.
O script cria o arquivo `.env` com hash bcrypt e session secret aleatório.

### 1.4 — Iniciar o servidor

```bash
sudo systemctl start pai-tv
sudo systemctl status pai-tv   # deve mostrar "active (running)"
```

### 1.5 — Testar o painel

Abra no navegador de qualquer máquina da rede:
```
http://192.168.1.100:3000
```

### 1.6 — Liberar a porta no firewall (se ufw estiver ativo)

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

### Comandos úteis

```bash
# Ver logs em tempo real
journalctl -u pai-tv -f

# Reiniciar após atualização dos arquivos
sudo cp -r ~/pai-tv/server/* /opt/pai-tv/server/
sudo systemctl restart pai-tv

# Backup do banco e vídeos
tar -czf backup-$(date +%Y%m%d).tar.gz /srv/pai_tv/
```

---

## Parte 2 — App Fire TV Stick

### 2.1 — Pré-requisitos (máquina Windows)

- [Android Studio](https://developer.android.com/studio) instalado
- ADB disponível no PATH (vem com o Android Studio: `C:\Users\<user>\AppData\Local\Android\Sdk\platform-tools\`)

### 2.2 — Configurar o IP do servidor no app

Edite **antes de compilar**:

```
android/app/build.gradle.kts
```

Linha:
```kotlin
buildConfigField("String", "SERVER_URL", "\"http://192.168.1.100:3000\"")
```

Substitua `192.168.1.100` pelo IP real do servidor Ubuntu.

### 2.3 — Compilar o APK

No Android Studio:
1. Abra a pasta `android/` como projeto
2. Aguarde o Gradle sincronizar
3. Menu: **Build > Build Bundle(s) / APK(s) > Build APK(s)**
4. O APK gerado estará em:
   `android/app/build/outputs/apk/debug/app-debug.apk`
5. Renomeie para `pai-tv.apk` e copie para a pasta `deploy/`

### 2.4 — Habilitar ADB em cada Fire Stick

Em cada Fire Stick:

1. **Settings > My Fire TV > About**
   - Clique 7 vezes em "Build" → mensagem "You are now a developer"

2. **Settings > My Fire TV > Developer Options**
   - **ADB Debugging** → ON
   - **Apps from Unknown Sources** → ON

3. Descobrir o IP do Fire Stick:
   **Settings > My Fire TV > About > Network**
   Anote o IP (ex.: `192.168.1.50`)

### 2.5 — Instalar o APK via ADB

Copie o `pai-tv.apk` para a pasta `deploy/` e execute:

```bash
# Um Fire Stick por vez:
adb connect 192.168.1.50:5555
adb install -r pai-tv.apk
adb shell am start -n com.paitv/.MainActivity

# Ou todos de uma vez (edite os IPs no comando):
bash instalar-firestick.sh 192.168.1.50 192.168.1.51 192.168.1.52
```

### 2.6 — Verificar o registro no painel

Após iniciar o app em cada Fire Stick:
1. Acesse `http://192.168.1.100:3000/devices`
2. O dispositivo aparece como **"Pendente"**
3. Dê um nome (ex.: "TV Recepção") e atribua uma playlist
4. O app sincroniza automaticamente (ou pressione **Sync** para forçar)

---

## Parte 3 — Fluxo de uso diário

### Publicar um novo vídeo

1. Acesse `http://192.168.1.100:3000`
2. **Vídeos > Enviar novo vídeo** → selecione o MP4
3. **Playlists** → abra a playlist desejada → adicione o vídeo
4. Os Fire Sticks sincronizam automaticamente às **6h** do dia seguinte
5. Para atualização imediata: **Dispositivos > Sync** (individual) ou **Sync todos agora**

### Registrar um novo Fire Stick

1. Instale o APK via ADB (seção 2.5)
2. O dispositivo aparece em **Dispositivos** como "Pendente"
3. Dê um nome e atribua uma playlist

---

## Estrutura de arquivos no servidor

```
/opt/pai-tv/server/     → código do servidor Node.js
/srv/pai_tv/videos/     → arquivos MP4 enviados
/srv/pai_tv/pai_tv.db   → banco de dados SQLite
```

## Backup recomendado

```bash
# Salva banco + vídeos (agendar via cron)
tar -czf ~/backup-paitv-$(date +%Y%m%d).tar.gz /srv/pai_tv/
```

Para agendar backup diário às 2h:
```bash
sudo crontab -e
# Adicione:
0 2 * * * tar -czf /root/backup-paitv-$(date +\%Y\%m\%d).tar.gz /srv/pai_tv/ 2>/dev/null
```
