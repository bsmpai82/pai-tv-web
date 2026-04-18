# PAI TV Web

Sistema de distribuição de vídeo para TVs institucionais (Sistema Android - Fire TV Stick, IZY Play Stick Intelbras e android TV) via **internet pública**.
Esta é a versão web do projeto original `pai-tv`, que operava apenas em rede local (LAN).

Repositório: https://github.com/bsmpai82/pai-tv-web
Versão original (LAN-only, não modificar): https://github.com/bsmpai82/pai-tv

---

## Diferença fundamental em relação ao pai-tv original

| | pai-tv (original) | pai-tv-web (este projeto) |
|---|---|---|
| Rede | LAN local | Internet pública |
| URL do servidor | IP local (ex: 192.168.1.10) | paitv.com.br (HTTPS) |
| Autenticação | Nenhuma | Token único por dispositivo |
| Hospedagem | PC local | VPS Hostinger Brasil |

---

## Infraestrutura

- **VPS:** Hostinger KVM 1 — São Paulo, Brasil
- **IP público:** 72.60.249.207
- **Domínio:** paitv.com.br
- **SO:** Ubuntu 24.04 LTS
- **Node.js:** v20.20.2
- **Banco:** SQLite (arquivo local no VPS)
- **HTTPS:** a configurar via Caddy ou Let's Encrypt + Nginx

---

## Stack

- **Servidor:** Node.js + Express + SQLite (pasta `server/`)
- **Cliente Android:** Kotlin + ExoPlayer (pasta `android/`)
- **Deploy:** scripts em `deploy/`

---

## Estrutura do projeto

```
pai-tv-web/
├── server/
│   ├── server.js        # Entry point do servidor
│   ├── routes/          # Rotas da API
│   ├── middleware/       # Middlewares (autenticação, etc.)
│   ├── db/              # Banco de dados SQLite
│   ├── views/           # Templates HTML (painel admin)
│   ├── public/          # Arquivos estáticos
│   ├── setup.js         # Script de setup inicial
│   └── package.json     # Dependências
├── android/             # App Kotlin para Fire TV Stick
├── deploy/              # Scripts de instalação e configuração
├── DEPLOY.md            # Guia de deploy
└── CLAUDE.md            # Este arquivo
```

---

## Arquitetura do sistema

```
[Admin - navegador] 
        ↓ HTTPS
[Servidor paitv.com.br - VPS Hostinger SP]
        ↓ HTTPS (polling a cada 5 min)
[Fire TV Sticks - qualquer rede/internet]
```

---

## Dispositivos

- **Quantidade inicial:** 11 Fire TV Sticks
- **Vídeos:** arquivos MP4, menos de 500MB cada
- **Comportamento do cliente:**
  - Faz polling no servidor a cada 5 minutos perguntando se há vídeo novo
  - Baixa e armazena em cache local
  - Reproduz do cache local (funciona offline após download)
  - Envia heartbeat periódico pro servidor (monitoramento de status)

---

## Autenticação

Cada Fire TV Stick possui um **token único** (UUID) gerado no cadastro:

- O stick envia o token em todo request HTTP (header `Authorization: Bearer <token>`)
- O servidor valida o token antes de responder
- Token inválido = 401 Unauthorized
- Tokens são gerados pelo painel admin e configurados manualmente no stick na primeira instalação

---

## Banco de dados (SQLite)

Tabelas previstas:

- `devices` — id, nome, local, token, ultimo_heartbeat, grupo, ativo
- `videos` — id, nome, caminho, tamanho, grupo, criado_em
- `assignments` — id, video_id, device_id, baixado, criado_em

---

## Fluxo de trabalho (desenvolvimento)

```
1. Desenvolve e testa localmente (D:\DEV\pai-tv-web)
2. git add / git commit / git push → GitHub
3. No VPS: git pull → reinicia o servidor
```

Conexão com o VPS:
```powershell
ssh root@72.60.249.207
```

Ou via VS Code Remote SSH (recomendado):
- Extensão: Remote - SSH (Microsoft)
- Host configurado: root@72.60.249.207

---

## Comandos úteis

### Locais (PowerShell no PC)
```powershell
cd D:\DEV\pai-tv-web        # Entra no projeto
git status                   # Ver alterações
git push                     # Envia pro GitHub
```

### No VPS (via SSH)
```bash
cd /root/pai-tv-web          # Pasta do projeto no servidor
git pull                     # Atualiza do GitHub
node server/server.js        # Roda o servidor manualmente
pm2 start server/server.js   # Roda com PM2 (recomendado em produção)
pm2 logs                     # Ver logs em tempo real
pm2 restart all              # Reinicia o servidor
```

---

## Status do MVP (atualizado em 2026-04-18)

### Concluído ✅
- [x] Configurar HTTPS com Caddy no VPS (`deploy/Caddyfile` + `deploy/setup-caddy.sh`)
- [x] Implementar autenticação por token no servidor (`server/middleware/requireDeviceToken.js`)
- [x] Endpoint de heartbeat (`POST /api/device/:uuid/heartbeat`)
- [x] Endpoint de polling de vídeo (`GET /api/device/:uuid/check`)
- [x] Tabela `devices` no SQLite com token único por dispositivo
- [x] Painel admin completo: vídeos, playlists, grupos, dispositivos
- [x] Adaptar app Android: URL `https://paitv.com.br`, token Bearer, HTTPS obrigatório
- [x] Token gerado no registro e exibido no painel admin com botão copiar
- [x] PM2 instalado e configurado para iniciar com o sistema
- [x] Ícone PAI TV no app Android
- [x] Testado com stick Intelbras IZY Play via internet pública
- [x] Alertas por e-mail quando dispositivo fica offline (>15 min) ou volta online (`server/services/mailer.js` + `alertChecker.js`)
- [x] Página de Configurações no painel para gerenciar destinatários de e-mail (`/settings`)
- [x] Página de Logs no painel com filtros por tipo e nível (`/logs`)
- [x] Correções de segurança: cookie `sameSite=lax` + `httpOnly`, XSS em handlers inline removido
- [x] Autostart do app (modo kiosk) validado no IZY Play Intelbras — ver seção "Provisionar novo stick"

### Pendente
- [ ] ffmpeg instalado no VPS (`apt-get install -y ffmpeg`) — thumbnails de vídeo não funcionam sem ele
- [ ] Testar com Fire TV Stick Amazon

### Gmail configurado no VPS
- **Conta:** paitv000001@gmail.com
- **Método:** senha de app (Google App Password — 2FA ativo)
- **Variáveis no `.env`:** `GMAIL_USER` e `GMAIL_APP_PASSWORD`
- Destinatários gerenciados em `https://paitv.com.br/settings`

---

## Infraestrutura atual

- **VPS:** Hostinger KVM 1 — São Paulo, Brasil
- **IP público:** 72.60.249.207
- **Domínio:** paitv.com.br (DNS configurado no Registro.br → IP do VPS)
- **HTTPS:** Caddy 2.11.2 com Let's Encrypt automático
- **Node.js:** rodando via PM2 em `/root/pai-tv-web/server`
- **Banco:** SQLite em `/root/pai-tv-web/server/db/pai_tv.db`
- **Vídeos:** `/root/pai-tv-web/server/uploads/`
- **Thumbnails:** `/srv/pai_tv/thumbs/`

## Build do APK Android

```powershell
# No terminal do Android Studio (Windows)
cd D:\DEV\pai-tv-web\android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
# APK gerado em: app\build\outputs\apk\debug\app-debug.apk
```

## Instalar APK no stick via ADB

```powershell
# Conectar (aceitar autorização na TV)
& "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe" connect <IP-do-stick>

# Instalar (desinstala versão anterior se necessário)
& "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe" uninstall com.paitv
& "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe" install "D:\DEV\pai-tv-web\android\app\build\outputs\apk\debug\app-debug.apk"
```

---

## Provisionar novo stick (modo kiosk com autostart)

Runbook validado no **IZY Play Intelbras** em 2026-04-18. O objetivo é que o stick abra o PAI TV sozinho a cada boot, sem intervenção humana.

### Estratégia

O app é declarado como launcher (`HOME` + `DEFAULT` no [AndroidManifest.xml](android/app/src/main/AndroidManifest.xml)). Para o sistema abri-lo automaticamente no boot, ele precisa ser o **único** HOME disponível — por isso desabilitamos o launcher do fabricante via ADB. É reversível.

### Passo a passo (por stick)

Preparação no stick (uma vez):
- **Configurações → Preferências do dispositivo → Sobre** → clicar 7× em "Compilação" (habilita dev)
- **Configurações → Preferências do dispositivo → Opções do desenvolvedor** → **Depuração ADB: ON** e **Depuração por rede: ON**
- Anotar o IP: **Configurações → Rede e Internet → [sua Wi-Fi]**

No PC (PowerShell), com `$IP` = IP do stick:

```powershell
$ADB = "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$APK = "D:\DEV\pai-tv-web\android\app\build\outputs\apk\debug\app-debug.apk"
$IP  = "192.168.31.129"  # trocar pelo IP do stick

# 1. Conectar (aceitar autorização na TV na primeira vez)
& $ADB connect "${IP}:5555"

# 2. Instalar o APK (limpo)
& $ADB uninstall com.paitv
& $ADB install $APK

# 3. Abrir o app uma vez (tira do "stopped state") — importante antes do reboot
& $ADB shell am start -n com.paitv/.MainActivity

# 4. Desabilitar o Google TV Launcher (ou o launcher do fabricante que estiver ativo)
& $ADB shell pm disable-user --user 0 com.google.android.tvlauncher

# 5. Reiniciar — ao voltar, a PAI TV abre sozinha
& $ADB reboot
```

### Conferir qual launcher o dispositivo está usando

Se o stick vier com launcher diferente (Amazon Fire Launcher, launcher da Xiaomi etc), descubra o pacote antes de desabilitar:

```powershell
& $ADB shell 'cmd package query-activities -c android.intent.category.HOME -a android.intent.action.MAIN' | Select-String "packageName="
```

Pacotes comuns a desabilitar:
- Google/Android TV (Intelbras IZY Play, Mi Box, TCL): `com.google.android.tvlauncher`
- Fire TV Stick: `com.amazon.tv.launcher`
- Some TVs: `com.android.tv.launcher`

### Reverter (se precisar devolver o stick ao uso normal)

```powershell
& $ADB shell pm enable com.google.android.tvlauncher
& $ADB shell am start -a android.intent.action.MAIN -c android.intent.category.HOME
```

### Troubleshooting — caminhos que NÃO funcionam

Já testados e descartados. **Não tente novamente**:

1. **`android:priority="1000"` no `<intent-filter>` de activity HOME** — o Android normaliza para 0 em apps não-system (proteção anti-hijack). O Google TV Launcher tem `priority=2` (privapp) e sempre vence. O atributo só funciona em `<receiver>` (por isso o BootReceiver o usa).

2. **`cmd package set-home-activity com.paitv/.MainActivity`** — responde "Success" mas **não persiste no reboot** quando existe outro launcher com priority maior.

3. **Fallback via `BootReceiver` escutando `BOOT_COMPLETED`** — após `adb install`, o app fica em "stopped state" e o Android 10+ **não entrega broadcasts implícitos** (inclusive `BOOT_COMPLETED`) até ele ser iniciado manualmente uma vez. Mesmo depois de iniciar, o Intelbras entrega o broadcast para outros receivers mas não pro nosso — comportamento inconsistente por OEM.

O único método 100% confiável em Android TV / Google TV é desabilitar o launcher concorrente. O código do BootReceiver continua no projeto como "cinto de segurança" caso o launcher seja reabilitado acidentalmente.

### Dica para provisionar os 10 sticks restantes em lote

Coloque o bloco do passo a passo num `.ps1` parametrizado por IP e nome do dispositivo. Depois execute para cada stick — em ~2 minutos por unidade.

---

## Restrições e decisões técnicas

- **Sem GUI no VPS** — administração via SSH + VS Code Remote SSH
- **SQLite** em vez de PostgreSQL/MySQL — suficiente para 11 dispositivos, zero configuração
- **Polling** em vez de WebSocket — mais simples, tolerante a conexões instáveis
- **Cache local no stick** — reprodução não depende de estar online
- **PM2** para manter o servidor Node.js rodando após reinicializações
- **Caddy** como proxy reverso HTTPS (certificado Let's Encrypt automático)
- **Token por dispositivo** — UUID gerado no servidor no momento do registro
- Código e commits **em português**
- Priorizar **simplicidade** — orçamento apertado, MVP de 4 semanas

---

## Convenções

- Commits: `tipo: descrição curta` (ex: `feat: adiciona endpoint de heartbeat`)
- Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`
- Comentários no código: português
- Variáveis e funções: camelCase em inglês
