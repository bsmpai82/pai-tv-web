# Rollout produção — playlists mistas (vídeo+imagem)

> Continuação do `PLANO-IMAGENS.md`. Gerado em 2026-08-05. Apagar este arquivo depois que o
> rollout terminar (passo 6) — é só um runbook de transição, não fica como documentação permanente.

## Já feito (Windows, 2026-08-05)

- [x] Servidor de produção (`main`) atualizado na VPS — `git pull` + `pm2 restart pai-tv`.
  Backup do banco antes em `/root/pai_tv-pre-imagens-2026-08-05.db`.
- [x] Migrações confirmadas: `playlist_items` = 14 (igual `playlist_videos`), `images` criada vazia.
- [x] 8 dos 11 dispositivos mandaram heartbeat normalmente logo após o restart (APK antigo +
  servidor novo, sem erro — validação repetida do teste feito em homolog).
- [x] APK de produção **versão 1.1** (`versionCode 2`) compilado a partir da `main` e publicado no
  painel. Link de download:
  ```
  https://paitv.com.br/apk/4e37cf975dfc
  ```
  (Se você rotacionar o token antes de usar este link, pegue o novo em
  `paitv.com.br/settings` → card "Distribuição do APK".)

## Dispositivos e IPs locais (consultados na produção em 2026-08-05 23:54 UTC)

IPs são reportados pelo próprio stick a cada heartbeat — podem ter mudado por DHCP. Confirme no
painel (`paitv.com.br/devices`, coluna "IP Local") se algum falhar ao conectar.

| Nome | IP local | Última conexão (UTC) | Observação |
|---|---|---|---|
| FABRICACAO | 192.168.1.110 | 2026-08-05 23:53 | — |
| SSMA | 192.168.1.107 | 2026-08-05 23:53 | — |
| Diretoria | 192.168.10.66 | 2026-08-05 23:53 | — |
| LOGISTICA | 192.168.10.147 | 2026-08-05 23:54 | — |
| RECEPCAO | 192.168.10.194 | 2026-08-05 23:54 | — |
| UP02 | 192.168.10.215 | 2026-08-05 23:53 | — |
| WH01 | 192.168.10.79 | 2026-08-05 23:53 | — |
| WH03 | 192.168.10.33 | 2026-08-05 23:54 | — |
| COPA - OFFICE | 192.168.88.226 | 2026-08-05 21:30 | Offline antes do deploy — checar separadamente |
| UP01 | 192.168.10.114 | 2026-08-05 19:01 | Offline antes do deploy — checar separadamente |
| MANUTENCAO | 192.168.10.162 | 2026-08-04 20:32 | Offline há ~27h antes do deploy — checar separadamente |

Os 3 últimos já estavam offline **antes** deste rollout (problema pré-existente, não relacionado
à atualização). Pode tentar atualizá-los também se estiverem alcançáveis na rede do trabalho, mas
não é o foco — investigar por que estão offline é tarefa separada.

## Fase 3 — Atualizar os sticks (Linux, trabalho)

1. Baixar o APK:
   ```bash
   cd ~ && wget -O pai-tv-1.1.apk "https://paitv.com.br/apk/4e37cf975dfc"
   ```

2. Atualizar cada stick alcançável na rede — **sem uninstall**, preserva cadastro, playlist e
   cache (verificado: tudo vive em `/data/data/com.paitv/`, sobrevive a `install -r`; kiosk
   `set-home-activity`/`pm suspend` também sobrevive, sem precisar reprovisionar):
   ```bash
   for IP in 192.168.1.110 192.168.1.107 192.168.10.66 192.168.10.147 192.168.10.194 \
             192.168.10.215 192.168.10.79 192.168.10.33; do
     echo "=== $IP ==="
     adb connect $IP:5555 && \
     adb install -r ~/pai-tv-1.1.apk && \
     adb shell am start -n com.paitv/.MainActivity && \
     adb disconnect $IP:5555
   done
   ```
   (Lista acima já exclui os 3 offline — adicione os IPs deles ao loop se quiser tentar mesmo
   assim.)

3. Sticks fora do alcance da rede do trabalho: usar o mesmo link
   `https://paitv.com.br/apk/4e37cf975dfc` via app Downloader na própria TV — instalação por cima
   também preserva os dados (update normal de pacote Android).

## Verificação

4. No painel `paitv.com.br/devices`: coluna "Versão" deve migrar de `1.0` para `1.1` em cada
   stick atualizado, dentro de ~5 min (próximo heartbeat). Confirmar que "Reproduzindo" continua
   preenchido e o status continua verde.

## Fase 4 — Pós-deploy (fazer só depois que a maioria estiver em 1.1)

5. Adicionar imagens às playlists de produção pelo painel (`/images` → upload → adicionar à
   playlist). Sticks ainda em 1.0 ignoram imagens sem erro, só não exibem.

6. Atualizar docs e apagar este arquivo:
   - `CLAUDE.md` — Status do MVP: marcar "produção recebeu playlists mistas em 2026-08-05" (ou
     data real da conclusão), nota sobre `adb install -r` como método preferido de update
     (preserva dados, evita re-registro no painel).
   - `PLANO-IMAGENS.md` — marcar item "Produção" da Fase 4 como concluído.
   - Commit na `develop`, merge pra `main`, push; `git pull` nas duas instâncias da VPS (só docs).
   - `git rm ROLLOUT-PRODUCAO-IMAGENS.md` (este arquivo já cumpriu o papel).

## Rollback (se necessário)

- Servidor: `cd /root/pai-tv-web && git checkout 6381c81 && pm2 restart pai-tv`; se playlists
  tiverem sido editadas após o deploy, restaurar `/root/pai_tv-pre-imagens-2026-08-05.db`.
- Sticks já em 1.1 continuam funcionando contra o servidor antigo (o `ApiClient` novo tem fallback
  pro array `videos` legado quando `items` não existe).
