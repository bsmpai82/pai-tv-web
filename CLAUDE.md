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

## Próximos passos (MVP)

- [ ] Configurar HTTPS com Caddy no VPS
- [ ] Implementar autenticação por token no servidor
- [ ] Adicionar endpoint de heartbeat (`POST /api/heartbeat`)
- [ ] Adicionar endpoint de polling de vídeo (`GET /api/check-update`)
- [ ] Criar tabela `devices` no SQLite
- [ ] Painel admin: tela de gerenciamento de dispositivos
- [ ] Adaptar app Android: trocar URL local por `https://paitv.com.br`
- [ ] Adicionar token nos requests do app Android
- [ ] Instalar PM2 no VPS para manter servidor rodando
- [ ] Documentar processo de provisionar novo stick

---

## Restrições e decisões técnicas

- **Sem GUI no VPS** — administração via SSH + VS Code Remote SSH
- **SQLite** em vez de PostgreSQL/MySQL — suficiente para 11 dispositivos, zero configuração
- **Polling** em vez de WebSocket — mais simples, tolerante a conexões instáveis
- **Cache local no stick** — reprodução não depende de estar online
- **PM2** para manter o servidor Node.js rodando após reinicializações
- Código e commits **em português**
- Priorizar **simplicidade** — orçamento apertado, MVP de 4 semanas

---

## Convenções

- Commits: `tipo: descrição curta` (ex: `feat: adiciona endpoint de heartbeat`)
- Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`
- Comentários no código: português
- Variáveis e funções: camelCase em inglês
