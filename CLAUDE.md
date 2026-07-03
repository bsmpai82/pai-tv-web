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

## Ambientes de desenvolvimento

| | Desktop Windows (casa) | Desktop Linux (trabalho) |
|---|---|---|
| **Usuário** | Dimozi | pai-tv |
| **Projeto** | `D:\DEV\pai-tv-web` | `/home/pai-tv/pai-tv-web` |
| **Uso principal** | Desenvolvimento, build do APK | Provisionar sticks via ADB |
| **Android SDK** | `C:\Users\Dimozi\AppData\Local\Android\Sdk` | `/home/pai-tv/Android/Sdk` |
| **ADB** | `platform-tools\adb.exe` | `adb` (no PATH) |

---

## Fluxo de trabalho (desenvolvimento)

```
1. Desenvolve e testa localmente (Windows ou Linux)
2. git add / git commit / git push → GitHub
3. No VPS: git pull → reinicia o servidor
```

Conexão com o VPS:
```bash
ssh root@72.60.249.207
```

Ou via VS Code Remote SSH (recomendado):
- Extensão: Remote - SSH (Microsoft)
- Host configurado: `root@72.60.249.207`

---

## Comandos úteis

### Locais — Windows (PowerShell)
```powershell
cd D:\DEV\pai-tv-web        # Entra no projeto
git status                   # Ver alterações
git push                     # Envia pro GitHub
```

### Locais — Linux (trabalho)
```bash
cd ~/pai-tv-web              # Entra no projeto
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
- [x] Distribuição remota do APK via `paitv.com.br/apk/<token>` — ver seção "Distribuição do APK (instalação remota)"

### Pendente
- [ ] ffmpeg instalado no VPS (`apt-get install -y ffmpeg`) — thumbnails de vídeo não funcionam sem ele
- [x] **Autostart no Intelbras validado em homolog** (2026-07-03) — receita: `set-home-activity` + `pm suspend` no launcher (`deploy/kiosk-intelbras.ps1 -Aplicar`). Nota: a hipótese do launcherx estava errada — o firmware usa o `tvlauncher` antigo, mas bloqueia `pm disable-user`/`pm uninstall` e reseta o HOME preferido no boot; `pm suspend` contorna. Ver runbook "Provisionar novo stick".
- [x] **Kiosk do Intelbras replicado em produção** (2026-07-03) — stick de teste rodando o app prod (`com.paitv`) com a mesma receita; os 3 testes (boot, HOME+watchdog, cold boot) passaram e o dispositivo aparece online no painel. Script agora aceita `-Flavor prod|homolog`.
- [x] Watchdog no app: relança MainActivity se sair do foreground (intervalo: 1 min, `SyncService.kt`)
- [x] Autostart validado no Fire TV Stick via `cmd package set-home-activity` — ver seção "Provisionar novo stick"

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

O app tem dois flavors: `prod` (paitv.com.br) e `homolog` (homolog.paitv.com.br).
Os dois podem coexistir no mesmo stick pois têm applicationId diferente.

### Windows (casa)
```powershell
cd D:\DEV\pai-tv-web\android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleProdDebug      # produção  → app\build\outputs\apk\prod\debug\
.\gradlew.bat assembleHomologDebug   # homolog   → app\build\outputs\apk\homolog\debug\
```

### Linux (trabalho)
```bash
cd ~/pai-tv-web/android
./gradlew assembleProdDebug
./gradlew assembleHomologDebug
```

## Instalar APK no stick via ADB

### Windows (casa)
```powershell
$ADB = "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$APK = "D:\DEV\pai-tv-web\android\app\build\outputs\apk\prod\debug\app-prod-debug.apk"
& $ADB connect <IP-do-stick>:5555
& $ADB uninstall com.paitv
& $ADB install $APK
```

### Linux (trabalho)
```bash
APK=~/pai-tv-web/android/app/build/outputs/apk/prod/debug/app-prod-debug.apk
adb connect <IP-do-stick>:5555
adb uninstall com.paitv
adb install $APK
```

---

## Provisionar novo stick (modo kiosk com autostart)

Runbook validado no **IZY Play Intelbras** (2026-07-03, homolog) e **Fire TV Stick Amazon** (2026-06-04).

### Estratégia por dispositivo

| Dispositivo | Método de kiosk | Launcher a tratar |
| --- | --- | --- |
| Intelbras IZY Play | `set-home-activity` + `pm suspend` no launcher | `com.google.android.tvlauncher` (protegido: disable/uninstall bloqueados pelo OEM) |
| Fire TV Stick | `cmd package set-home-activity` (define HOME) | `com.amazon.tv.launcher` (protegido, não pode desabilitar) |

Em ambos o app abre automaticamente no boot. Se o usuário sair (botão HOME), o **watchdog** (SyncService) relança o PAI TV em até 1 minuto. No Intelbras, apertar HOME mostra por alguns segundos o diálogo "app suspenso" do sistema até o watchdog agir — comportamento esperado.

**Por que o `pm suspend` no Intelbras:** o firmware (Android 14) reseta o HOME preferido de volta pro launcher Google a cada boot, mesmo com o role `android.app.role.HOME` correto. `pm disable-user` e `pm uninstall --user 0` são bloqueados ("Warning! This command is illegal!" / "core application"). `pm suspend` passa, sobrevive ao reboot e impede o reset — o PAI TV abre sozinho no boot.

**Script pronto (Windows):** `deploy/kiosk-intelbras.ps1` automatiza diagnóstico, aplicação e reversão no Intelbras: `.\deploy\kiosk-intelbras.ps1 -Ip <IP> -Flavor prod -Aplicar` (use `-Flavor homolog` para o app HML; `-Reverter` devolve o launcher original). O install do APK continua manual (blocos abaixo).

### Passo a passo (por stick)

Preparação no stick (uma vez):
- **Configurações → Preferências do dispositivo → Sobre** → clicar 7× em "Compilação" (habilita dev)
- **Configurações → Preferências do dispositivo → Opções do desenvolvedor** → **Depuração ADB: ON** e **Depuração por rede: ON**
- Anotar o IP: **Configurações → Rede e Internet → [sua Wi-Fi]**

### Windows (casa) — Intelbras IZY Play

```powershell
$ADB = "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$APK = "D:\DEV\pai-tv-web\android\app\build\outputs\apk\prod\debug\app-prod-debug.apk"
$IP  = "192.168.31.129"  # trocar pelo IP do stick

& $ADB connect "${IP}:5555"
& $ADB uninstall com.paitv
& $ADB install $APK
& $ADB shell am start -n com.paitv/.MainActivity
& $ADB shell cmd package set-home-activity com.paitv/.MainActivity
& $ADB shell pm suspend com.google.android.tvlauncher
& $ADB reboot
```

### Windows (casa) — Fire TV Stick

```powershell
$ADB = "C:\Users\Dimozi\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$APK = "D:\DEV\pai-tv-web\android\app\build\outputs\apk\prod\debug\app-prod-debug.apk"
$IP  = "192.168.31.161"  # trocar pelo IP do stick

& $ADB connect "${IP}:5555"
& $ADB uninstall com.paitv
& $ADB install $APK
& $ADB shell cmd package set-home-activity com.paitv/.MainActivity
& $ADB reboot
```

### Linux (trabalho) — Intelbras IZY Play

```bash
IP="192.168.10.194"   # trocar pelo IP do stick
APK=~/pai-tv-web/android/app/build/outputs/apk/prod/debug/app-prod-debug.apk

adb connect ${IP}:5555
adb uninstall com.paitv
adb install $APK
adb shell am start -n com.paitv/.MainActivity
adb shell cmd package set-home-activity com.paitv/.MainActivity
adb shell pm suspend com.google.android.tvlauncher
adb reboot
```

### Linux (trabalho) — Fire TV Stick

```bash
IP="192.168.31.161"   # trocar pelo IP do stick
APK=~/pai-tv-web/android/app/build/outputs/apk/prod/debug/app-prod-debug.apk

adb connect ${IP}:5555
adb uninstall com.paitv
adb install $APK
adb shell cmd package set-home-activity com.paitv/.MainActivity
adb reboot
```

### Conferir qual launcher o dispositivo está usando

Se o stick vier com launcher diferente, descubra o pacote antes:

```bash
# Linux
adb shell 'cmd package query-activities -c android.intent.category.HOME -a android.intent.action.MAIN' | grep packageName
```

```powershell
# Windows
& $ADB shell 'cmd package query-activities -c android.intent.category.HOME -a android.intent.action.MAIN' | Select-String "packageName="
```

Pacotes comuns:
- Google/Android TV (Intelbras IZY Play, Mi Box, TCL): `com.google.android.tvlauncher`
- Fire TV Stick: `com.amazon.tv.launcher` (protegido — usar `set-home-activity`, não `pm disable-user`)
- Some TVs: `com.android.tv.launcher`

### Reverter (se precisar devolver o stick ao uso normal)

**Intelbras:**

```powershell
& $ADB shell pm unsuspend com.google.android.tvlauncher
& $ADB shell cmd package set-home-activity com.google.android.tvlauncher/com.google.android.tvlauncher.MainActivity
& $ADB reboot
```

**Fire TV Stick:**

```powershell
& $ADB shell cmd package set-home-activity com.amazon.tv.launcher
& $ADB reboot
```

### Troubleshooting — caminhos que NÃO funcionam

Já testados e descartados. **Não tente novamente**:

1. **`android:priority="1000"` no `<intent-filter>` de activity HOME** — o Android normaliza para 0 em apps não-system (proteção anti-hijack). O Google TV Launcher tem `priority=2` (privapp) e sempre vence. O atributo só funciona em `<receiver>` (por isso o BootReceiver o usa).

2. **`pm disable-user` no Fire TV Stick** — retorna `SecurityException: Cannot disable a protected package: com.amazon.tv.launcher`. Usar `set-home-activity` em vez disso.

3. **Fallback via `BootReceiver` escutando `BOOT_COMPLETED`** — após `adb install`, o app fica em "stopped state" e o Android 10+ **não entrega broadcasts implícitos** (inclusive `BOOT_COMPLETED`) até ele ser iniciado manualmente uma vez. Mesmo depois de iniciar, o Intelbras entrega o broadcast para outros receivers mas não pro nosso — comportamento inconsistente por OEM.

4. **`pm disable-user` / `pm uninstall --user 0` no launcher do Intelbras** — o firmware bloqueia ambos ("Warning! This command is illegal!" e "core application... can not be uninstalled"), tanto no pacote quanto no componente. Usar `pm suspend` em vez disso.

5. **`set-home-activity` sozinho no Intelbras** — o comando grava a preferência corretamente (verificável em `dumpsys package preferred`), mas **o boot do firmware a reseta** de volta pro launcher Google, mesmo com o role `android.app.role.HOME` apontando pro PAI TV. Só funciona combinado com `pm suspend` no launcher.

O código do BootReceiver continua no projeto como "cinto de segurança". O **watchdog** no SyncService complementa: verifica a cada 1 minuto se a MainActivity está em foreground e a relança se necessário.

### Dica para provisionar os sticks em lote

Coloque o bloco do passo a passo num `.ps1` parametrizado por IP e modelo. Depois execute para cada stick — em ~2 minutos por unidade.

---

## Distribuição do APK (instalação remota)

Dois caminhos convivem, usando o **mesmo APK de build**:

| Caminho | Usar quando | Como |
|---|---|---|
| **A — ADB na LAN** | Sticks que você tem fisicamente (Fire TV, IZY Play) | Runbook de "Provisionar novo stick" acima |
| **B — Download via URL** | Android TV remota, fora da sua LAN | Upload do APK no painel → TV baixa via Downloader |

### Como funciona o caminho B

- APK hospedado em `/srv/pai_tv/releases/pai-tv.apk` no VPS (fora do git, fora de `/uploads`).
- Rota pública `GET /apk/<token>` serve o arquivo; token é gerado automaticamente no primeiro boot e guardado na tabela `settings`.
- Upload e rotação do token no painel admin, página `/settings`, card **"Distribuição do APK"**.
- Cada download é logado na tabela `logs` (tipo `apk`).

### Fluxo de release

```
1. gradlew.bat assembleDebug (local)
2. Upload do app-debug.apk no painel /settings
3. Compartilhar o link paitv.com.br/apk/<token> com o operador da TV remota
4. Na TV: Downloader → digitar URL → instalar
```

### Na TV remota (passo a passo do operador)

1. Habilitar "Fontes desconhecidas" nas configurações da TV (Android TV costuma perguntar no ato da instalação).
2. Instalar o app **Downloader** (by AFTVnews) — disponível na Play Store e na Amazon App Store.
3. Abrir o Downloader, digitar a URL fornecida (`paitv.com.br/apk/<token>`), clicar em Go.
4. Aceitar o prompt de instalação quando o download terminar.
5. Abrir o PAI TV uma vez — o cadastro do dispositivo acontece automaticamente.

### Rotacionar o token

Se o link vazar ou após demitir/trocar operador: painel admin → `/settings` → "Rotacionar token". Todos os links antigos param de funcionar imediatamente.

### Limitações conhecidas

- **Autostart/kiosk em TV remota** ainda depende de ADB (`pm disable-user` no launcher concorrente). Sem LAN e sem VPN, a TV remota **não inicia o PAI TV sozinha** — o operador precisa abrir manualmente. Solução opcional: Tailscale (VPN mesh) instalado no stick pela Play Store, dá IP fixo e permite ADB por WAN.
- APK é **debug-signed**. Se um dia migrar para release-signed, o update em cima do debug falha com `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — precisa desinstalar antes.
- Tamanho máximo do upload: 100 MB (definido em `server/routes/apk.js`).

### Arquivos envolvidos

- [server/routes/apk.js](server/routes/apk.js) — rotas `/apk/:token`, `/apk/upload`, `/apk/rotate-token`
- [server/services/settingsStore.js](server/services/settingsStore.js) — get/set na tabela `settings`
- [server/views/settings.ejs](server/views/settings.ejs) — card de distribuição na página `/settings`
- Tabela `settings` (migração em [server/db/database.js](server/db/database.js))

### Variáveis de ambiente

Opcional em `.env` do VPS (valor padrão entre parênteses):
```
RELEASES_PATH=/srv/pai_tv/releases    # (./releases)
```

O token de download **não** é variável de ambiente — fica na tabela `settings` pra poder ser rotacionado pelo painel.

### Deploy no VPS após primeiro deploy desta feature

```bash
cd /root/pai-tv-web
git pull
mkdir -p /srv/pai_tv/releases
pm2 restart all
# Abrir https://paitv.com.br/settings e fazer upload do APK inicial
```

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
