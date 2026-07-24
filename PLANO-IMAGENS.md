# Plano — Suporte a imagens nas playlists

> Criado em 2026-07-23. Atualizado em 2026-07-23.
>
> **Status atual:** servidor (Fases 1–2) commitado em `790f356`; Android (Fase 3) commitado em
> `cb2a4cd` (branch `develop`, push feito) — **validado no stick de homolog**: playlist mista
> vídeo→imagem→vídeo em loop, tela cheia (resize dinâmico só na imagem), boot com cache local.
> Pendências: só os testes opcionais de menor prioridade da Fase 4 (ver checklist) e produção,
> que exige aprovação explícita separada.
> Objetivo: permitir playlists mistas (vídeos MP4 + imagens JPEG/PNG/WebP),
> com painel de imagens separado do painel de vídeos e tempo de exibição configurável por imagem.
> Regra do projeto: **homolog primeiro** — produção só com aprovação explícita.

## Viabilidade (já validada na análise)

O app usa ExoPlayer (Media3). Desde o Media3 **1.2** existe `ImageRenderer` embutido:
uma imagem entra na fila como `MediaItem` normal com duração definida:

```kotlin
MediaItem.Builder()
    .setUri(Uri.fromFile(file))
    .setImageDurationMs(15_000)
    .build()
```

Vídeos e imagens se misturam na mesma fila (`REPEAT_MODE_ALL`) sem timer manual nem segunda tela.
Arquitetura atual (polling 5 min, cache local, hash de playlist) permanece intacta.

---

## Fase 1 — Servidor: mídia de imagem

- [x] **Migrações** em `server/db/database.js` (seguir padrão do array `migrations`):
  - Tabela `images`: `id, filename, original_name, size, duration_seconds INTEGER NOT NULL DEFAULT 10, owner_id REFERENCES users(id) ON DELETE SET NULL, created_at`.
  - Tabela `playlist_items`: `id, playlist_id REFERENCES playlists(id) ON DELETE CASCADE, media_type TEXT CHECK(media_type IN ('video','image')), media_id INTEGER, position INTEGER`.
  - Migração de dados: copiar linhas de `playlist_videos` para `playlist_items` com `media_type='video'` (idempotente — só se `playlist_items` estiver vazia). Manter `playlist_videos` intocada por enquanto (leitura legada), remover em limpeza futura.
- [x] **Rota** `server/routes/images.js` clonando o padrão de `server/routes/videos.js`:
  - Upload multer, `fileFilter` aceitando `image/jpeg`, `image/png`, `image/webp`; limite 20 MB.
  - Armazenar em `server/uploads/` (mesma pasta dos vídeos — filenames são UUID, sem colisão) — conferir se o serving `/media/:filename` já cobre.
  - CRUD: listar, excluir, **editar duration_seconds** (a duração vive na imagem e vale em todas as playlists).
  - Respeitar `owner_id` / permissões de usuário igual aos vídeos (coluna "Enviado por" etc.).
- [x] **View** `server/views/images.ejs` clonando `videos.ejs`, com campo de duração inline (input + salvar).
- [x] Item "Imagens" no menu (`server/views/partials/header.ejs`).
- [x] Thumbnail: usar a própria imagem (não depende de ffmpeg).

## Fase 2 — Servidor: playlist mista + API

- [x] `server/routes/playlists.js` + `server/views/playlist-detail.ejs`:
  - Listar itens de `playlist_items` (vídeos e imagens juntos), badge de tipo, reordenação única, adicionar/remover imagem.
  - Escritas passam a operar em `playlist_items` (e espelhar em `playlist_videos` para os vídeos, enquanto a leitura legada existir — decidir na implementação se vale o espelho ou migrar tudo de uma vez).
- [x] `server/routes/api.js`:
  - `GET /api/device/:uuid/playlist`: novo campo `items: [{type, id, filename, original_name, size, url, duration_seconds?}]` na ordem de `position`. **Manter** o array `videos` legado (apenas vídeos) — retrocompatibilidade com APKs antigos.
  - `GET /api/device/:uuid/check`: hash passa a ser md5 de `filename:duration` de todos os itens (mudar só a duração de uma imagem deve disparar re-sync).

## Fase 3 — Android

- [x] Conferir versão do Media3 em `android/app/build.gradle` — precisa ≥ 1.2; atualizar se necessário (pode puxar ajustes de API).
- [x] `ApiClient.kt`: parsear `items` (fallback para `videos` se `items` ausente — servidor antigo).
- [x] `SyncService.kt` / `VideoManager.kt`: download genérico de mídia (imagens no mesmo cache); broadcast `ACTION_PLAYLIST_UPDATED` passa lista de itens com tipo e duração (ex.: ArrayList de strings `"filename|type|durationMs"` ou Parcelable).
- [x] `MainActivity.loadPlayer`: montar `MediaItem` com `setImageDurationMs(duration)` quando `type == "image"`; vídeos como hoje. Listener de erro existente já pula item com falha.
- [x] `DevicePrefs`: persistir a lista com tipo/duração (hoje guarda só filenames) para reprodução offline no boot.
- [x] **Tela cheia**: resolvido sem afetar vídeo — `MainActivity.kt` troca o `resizeMode` do `PlayerView` dinamicamente (`RESIZE_MODE_ZOOM` só quando o item atual é imagem, `RESIZE_MODE_FIT` para vídeo, como antes). `activity_main.xml` não precisou de `resize_mode` fixo.
- [x] Commit das alterações do Android — `cb2a4cd` (branch `develop`, push feito).
- [x] **Achado durante o teste em hardware real (fora do escopo original)**: Media3 1.3.1 tem o `ImageRenderer` (decodifica a imagem, timing correto) mas o `PlayerView` daquela versão não integra `ImageOutput` — a imagem nunca era desenhada, mesmo com tudo certo no código. Confirmado lendo o source do Media3 e validado por busca: suporte de imagem no `PlayerView` só chegou na 1.4.0. Upgrade para **Media3 1.4.1** (`media3-exoplayer` e `media3-ui` em `android/app/build.gradle.kts`) resolveu.

## Fase 4 — Testes e deploy

- [x] **Homolog**: deploy servidor homolog + build `assembleHomologDebug` no stick Intelbras de teste (`192.168.31.182`, kiosk reprovisionado pra `com.paitv.homolog` via `deploy/kiosk-intelbras.ps1 -Flavor homolog -Aplicar`).
  - [x] Playlist mista funcionando no stick (imagem exibe com duração; validado 2026-07-23).
  - [x] Loop completo vídeo→imagem→vídeo (observado repetidas vezes via logs/timestamps e visualmente).
  - [x] Tela cheia sem afetar vídeo (resize dinâmico, validado visualmente).
  - [x] Boot com cache local (reinício do app volta a tocar do cache sem esperar rede).
  - [x] Resync de duração — validado indiretamente via servidor: mudar `duration_seconds` muda o `playlist_hash` (`md5(filename:duration)`), testado com curl real contra homolog.
  - [x] Imagem corrompida (deve pular) — corrompida via `adb shell run-as` (mesmo tamanho em bytes, pra não disparar redownload automático), app reiniciado, sem crash e o ciclo completou rápido (item pulado quase instantaneamente em vez de travar pelos 5s configurados — confirmado pelo timestamp de recriação do codec de vídeo no logcat, e visualmente pelo usuário). Cache restaurado depois (arquivo removido + `force_sync=1` pra rebaixar a imagem real).
  - [ ] *Opcional, não crítico*: APK antigo de verdade contra servidor novo — já coberto pela validação do formato do array `videos` legado via curl; não repetido por falta de um APK antigo instalado à mão.
- [ ] **Produção** (após aprovação explícita): primeiro o servidor (retrocompatível), depois os APKs prod nos sticks. **Não iniciar sem sinal claro do usuário.**
- [x] Atualizar `CLAUDE.md` (tabelas do banco, seção de status).

## Riscos

| Risco | Mitigação |
|---|---|
| Media3 < 1.2 no projeto | Upgrade de dependência; testar regressão de vídeo em homolog |
| APK antigo quebrar com API nova | Array `videos` legado mantido; servidor sobe antes dos APKs |
| Duplicidade `playlist_videos`/`playlist_items` | Migração idempotente; remover tabela antiga só depois que todos os sticks atualizarem |

## Estimativa

- Fases 1–2 (servidor): ~1 dia — clonagem de padrões existentes, risco baixo.
- Fase 3 (Android): ~meio dia + testes no stick.
