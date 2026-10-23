# mcp-server

Servidor MCP remoto do Operum (Streamable HTTP, stateless). Expõe tools de leitura, escrita e migração para o Claude operar projetos, sprints, tarefas e comentários em nome de um usuário autenticado, em todos os tenants dele, com isolamento por tenant.

Este serviço **nunca** acessa o banco de dados diretamente — é apenas mais um cliente HTTP do `api-gateway`, autenticado com um Personal Access Token (PAT) do Operum (`opr_pat_...`). Toda autorização e isolamento por tenant acontece no gateway/auth-service (ver `SDD — Integração MCP Operum ↔ Claude`, seções 3 e 6).

> Guia para quem usa o Operum (passo a passo, problemas comuns e roteiro do vídeo): [`docs/tutoriais/integracao-mcp-claude.md`](../docs/tutoriais/integracao-mcp-claude.md).

## Gerar um token

Gere um PAT em `/perfil/tokens` no Operum.

> Endpoint atual: `https://api.operum.adm.br/mcp`. O endereço definitivo `https://mcp.operum.adm.br/mcp` depende do registro DNS.

## Conectar no Claude Code

Um único servidor opera todos os seus workspaces (tenants). Cada PAT do Operum é preso a um tenant, então gere **um token em cada workspace** (`/perfil/tokens`, logado nele) e passe todos:

- `Authorization: Bearer <pat>` — tenant padrão (usado quando a tool não recebe `tenant_id`);
- `X-Operum-Tokens: <pat>,<pat>` — demais tenants (até 10 tokens no total).

```bash
claude mcp add --transport http operum https://api.operum.adm.br/mcp \
  --header "Authorization: Bearer opr_pat_MAVELLIUM" \
  --header "X-Operum-Tokens: opr_pat_OUTRO_TENANT"
```

Por projeto (`.mcp.json` versionado, tokens via variável de ambiente, nunca commitados):

```json
{
  "mcpServers": {
    "operum": {
      "type": "http",
      "url": "https://api.operum.adm.br/mcp",
      "headers": {
        "Authorization": "Bearer ${OPERUM_TOKEN}",
        "X-Operum-Tokens": "${OPERUM_EXTRA_TOKENS}"
      }
    }
  }
}
```

Sessões do Claude Code na nuvem (aba Code do app Claude, claude.ai/code) usam o servidor `operum-nuvem` do `.mcp.json` da raiz, que não tem token: o PAT fica num segredo de rede do ambiente (host `api.operum.adm.br`), injetado pelo proxy da Anthropic. Passo a passo no [tutorial](../docs/tutoriais/integracao-mcp-claude.md#pelo-celular-claude-code-na-nuvem).

Escritas exigem tokens com escopo `write`. Um token revogado deixa de funcionar imediatamente (o gateway introspecta cada chamada).

Cópias de projetos grandes podem levar alguns minutos (o servidor respeita o limite de 20 req/s por token do gateway). Se o cliente MCP cortar a chamada, aumente o timeout de tools (no Claude Code: `MCP_TOOL_TIMEOUT`, em ms).

## Conectar no app do Claude (OAuth, desde 1.36.0)

No claude.ai (web, Desktop e celular), adicione um conector personalizado com a URL `https://api.operum.adm.br/mcp`. O Claude recebe 401 com `resource_metadata`, descobre o servidor de autorização do Operum, abre `operum.adm.br/oauth/autorizar` para login e consentimento e passa a usar um token `opr_oat_…` de 1 h, renovado sozinho.

- Uma conexão cobre os workspaces marcados no consentimento; as tools continuam aceitando `tenant_id`.
- Permissões: `operum:read` sempre; `operum:write` se o usuário deixar marcado "Permitir criar e alterar".
- Desconectar: Meu perfil → Personal Access Tokens → Apps conectados.
- Configuração (mesmo `.env` para auth-service, api-gateway e mcp-server): `OAUTH_ISSUER`, `MCP_RESOURCE_URL`, `OAUTH_AUTHORIZE_URL`, `MCP_GATEWAY_KEY` (`openssl rand -base64 32`), `OAUTH_CIMD_ALLOWED_HOSTS` e `OAUTH_DCR_ALLOWED_REDIRECTS`. Sem as três primeiras obrigatórias (`OAUTH_ISSUER`, `MCP_RESOURCE_URL`, `MCP_GATEWAY_KEY`), o MCP segue só com PAT.
- O token OAuth não é aceito direto na API pública: o gateway exige a chave interna que só o mcp-server envia (`X-Operum-Mcp-Key`).

Desenho e decisões: [`docs/specs/SDD-mcp-oauth.md`](../docs/specs/SDD-mcp-oauth.md) e ADR-057.

## Desenvolvimento local

```bash
pnpm --dir mcp-server install
pnpm --dir mcp-server start:dev
```

Requer `API_GATEWAY_INTERNAL_URL` apontando para um `api-gateway` acessível (por padrão `http://api-gateway:4000`, ajuste para `http://localhost:4000` fora do Docker Compose).

Validar com o [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
```

## Tools disponíveis

Toda tool aceita `tenant_id` (omitido = tenant do token padrão) e responde JSON. Listas usam `cursor` + `limit`.

`operum_list_tasks` delega filtros/paginação ao sprint-service: padrão 50, máximo 200, resposta `{items,total,next_cursor}`. Use `next_cursor` com os mesmos filtros e `fields`; o limite pode mudar. Ordem por criação e ID, com limite superior da primeira página. Novas tarefas posteriores ao início entram numa nova listagem; edições que alteram filtros, exclusões ou revogação de acesso podem alterar o conjunto/total entre chamadas. Não há snapshot entre páginas. Os antigos cursores de offset dessa ferramenta não são reutilizáveis: reinicie sem cursor. Anexos são buscados somente da página em `fields="full"`. Detalhes em `docs/operations/task-pagination.md`.

| Grupo | Tools |
|---|---|
| Identidade | `operum_whoami`, `operum_list_tenants`, `operum_list_users` |
| Projetos | `operum_list_projects`, `operum_get_project`, `operum_create_project`, `operum_update_project`, `operum_archive_project`, `operum_delete_project`, `operum_add_project_member`, `operum_remove_project_member` |
| Sprints e colunas | `operum_list_sprints`, `operum_get_sprint`, `operum_create_sprint`, `operum_update_sprint`, `operum_delete_sprint`, `operum_create_column`, `operum_update_column`, `operum_delete_column` |
| Tarefas | `operum_list_tasks`, `operum_get_task`, `operum_create_task`, `operum_update_task`, `operum_move_task`, `operum_delete_task`, `operum_set_task_tags`, `operum_set_task_responsibles`, `operum_bulk_update_tasks` |
| Etiquetas | `operum_list_tags`, `operum_create_tag` |
| Anexos | `operum_upload_attachment`, `operum_create_upload_link`, `operum_add_link`, `operum_delete_attachment` (a leitura vem em `operum_get_task` e `operum_list_tasks` com `fields="full"`) |
| Tempo | `operum_start_timer`, `operum_stop_timer`, `operum_log_time`, `operum_list_time_entries`, `operum_update_time_entry`, `operum_delete_time_entry` (o total e os timers rodando vêm em `operum_get_task`, no campo `time`) |
| Comentários | `operum_list_comments`, `operum_create_comment`, `operum_update_comment`, `operum_delete_comment` |
| Histórico | `operum_get_activity` |
| Migração | `operum_export_project`, `operum_import_project`, `operum_copy_project` |

Segurança das escritas:

- `delete_*` / `remove_*` exigem `confirm: true`.
- `bulk_update_tasks`, `import_project` e `copy_project` rodam em `dry_run` por padrão.
- `create_task` aceita `idempotency_key` (memória de 24h por token; vale com uma réplica do servidor).
- Toda escrita é registrada no `AuditLog` do Operum com `details.via = "mcp"`; o sprint-service acrescenta `authType`/`apiTokenId` a partir dos headers do gateway.

### Anexos

- `operum_upload_attachment` recebe o arquivo em `content_base64` (até 10 MB; aceita `data:` URL) ou em `url`, que o servidor baixa (até 50 MB). Tipos aceitos: imagens, vídeos MP4/WebM/MOV, PDF, Word, Excel, PowerPoint, OpenDocument, TXT, CSV e ZIP. A lista é a mesma do app e do file-service, e um teste de paridade garante isso.
- O download por `url` só aceita HTTPS na porta 443. Ele recusa endereço privado, loopback, link-local (metadados de nuvem) e reservado. A checagem acontece no momento da conexão (resiste a DNS rebinding) e vale também para cada redirecionamento, no máximo 3. O prazo total é de 60 s.
- `operum_add_link` anexa só a URL (YouTube, Vimeo, Loom, Drive...), sem baixar nada. No card, vídeo do YouTube ganha miniatura. O mesmo link na mesma tarefa não é duplicado.
- Toda tool confere antes, por `GET /cards/:id`, se a tarefa é do tenant do token. O file-service não conhece tenant.

### Tempo

- `operum_start_timer` inicia o timer do dono do token. Como na tela do quadro, leva o card para a coluna "Em andamento" só se ele estiver numa coluna anterior. Card do backlog, em "Em teste" ou em "Concluído" não muda de lugar.
- Só pode haver um timer rodando por usuário. Com `stop_running: true`, o timer da outra tarefa é parado antes; sem isso, o erro diz qual tarefa está com o timer. Chamar de novo na mesma tarefa não cria outro (`already_running: true`).
- `operum_stop_timer` para o timer rodando e devolve a duração. Sem timer rodando, responde `stopped: false`.
- `operum_log_time` lança um período já trabalhado. Aceita até 12 h por lançamento e recusa fim antes do início ou no futuro. O sprint-service também recusa sobreposição com outro lançamento do mesmo usuário, inclusive um timer rodando, e a mensagem diz qual lançamento conflita (ADR-046).
- `operum_list_time_entries` lista os lançamentos da tarefa, os mais recentes primeiro. O filtro `user_id` é opcional. A resposta traz o total, sem o timer rodando, e `needs_review: true` nos timers que o Operum encerrou no limite de 12 h.
- `operum_update_time_entry` corrige início, fim e descrição de um lançamento por `PATCH /time-entries/:id`, com as mesmas regras do lançamento manual. Se só o início mudar, o fim atual é mantido. Timer rodando não pode ser editado.
- `operum_delete_time_entry` apaga um lançamento e exige `confirm: true`.
- Editar e apagar exigem ser o dono do lançamento ou admin. O gateway confere isso e devolve "Sem permissão" quando falta.

### Migração entre tenants

`operum_copy_project` (export + import numa chamada) recria no destino: projeto e termo de abertura, macro-fases, membros, stakeholders, etiquetas, sprints com colunas, tarefas (coluna, posição, prioridade, datas), responsáveis e comentários.

- Pessoas são casadas por **e-mail**; `user_mapping` cobre exceções. Quem não existir no destino fica sem vínculo e aparece em `unmapped_users`.
- Comentários são criados em nome do dono do token de destino; autor e data originais vão no início do texto.
- Não são copiados: anexos (arquivos), histórico de movimentação, métricas/feedback de sprint, horas e documentos do monólito (WBS/EAP/atas).
- O relatório final traz contagens planejadas/criadas, `skipped`, `errors` e o mapa de ids. Se a importação falhar no meio, exclua o projeto criado (`target.project_id`) e rode de novo — o conflito de nome impede duplicar sem querer.

Lacunas do modelo de dados em relação ao spec original: ver [`docs/mcp/gaps.md`](../docs/mcp/gaps.md).


## Importar para projeto existente (8.1)

`operum_copy_project` e `operum_import_project` aceitam `target_project_id` no tenant de destino. Sem ele, o comportamento de criar projeto permanece. Com ele, cadastro, membros, stakeholders e macrofases do destino são preservados. Nomes de sprints/colunas passam por NFC, trim, espaços simples e minúsculas: existentes são reutilizados sem renomear ou excluir; faltantes são criados. Títulos iguais ou com similaridade Levenshtein normalizada >=0,9 são pulados e listados. Também deduplica tarefas elegíveis do próprio bundle. `dry_run=true` permanece padrão; revisar relatório antes da escrita. Não há transação distribuída nem garantia de deduplicação contra importações simultâneas.

## Upload de arquivo local (8.3)

Configure `MCP_PUBLIC_URL` como origem HTTPS pública (sem caminho) e `MCP_UPLOAD_SECRET` com 32 bytes aleatórios em base64 (`openssl rand -base64 32`). A origem precisa rotear `/uploads/` ao MCP. O fallback de produção em `https://api.operum.adm.br` agora cobre `/mcp` e `/uploads/`; ele é o padrão enquanto o DNS dedicado não estiver configurado. A ferramenta `operum_create_upload_link(task_id, file_name?)` devolve `upload_url`, `expires_at` e comando curl. Substitua `<caminho>` pelo arquivo local mantendo as aspas; use `curl --fail-with-body -F 'file=@/caminho/eap.png' '<upload_url>'`.

Cada tentativa autenticada consome o link, mesmo em erro de arquivo/gateway: gere outro para tentar novamente. Expirado/usado/reinício responde 410; token adulterado 400 genérico. O token AES-256-GCM cifra PAT, tarefa, tenant, expiração/nonce e nome opcional por dez minutos. O PAT não aparece em claro em URL/logs. O link é uma credencial temporária: não compartilhar nem publicar. Não salvar comando/link no histórico operacional de chamados.

A rota revalida `/auth/me` e `/cards/:id` com o PAT original; revogação e permissões atuais continuam sob controle do gateway. Multipart aceita apenas um campo `file`, tipos da lista canônica e 50 MB; valida tudo antes de chamar o gateway. Busboy grava em arquivo temporário privado (0600, diretório 0700), e o arquivo é encaminhado em stream e removido em sucesso/erro. Não carrega 50 MB em memória. Rate limit usa express-rate-limit e normaliza sub-redes IPv6 sem confiar em headers encaminhados. Há limite de dois uploads ativos, 120 segundos e dez tentativas/minuto por socket peer; X-Forwarded-For não confiável é ignorado, portanto clientes atrás do mesmo proxy compartilham o orçamento. Limite de armazenamento temporário ativo: aproximadamente 100 MB. Queda abrupta pode deixar arquivos no diretório temporário do container até ele ser recriado.

Nonce e limites ficam em memória (uma réplica, como idempotência). Reinício invalida links pendentes; rotação da chave os invalida. Antes de escalar para várias réplicas, implementar reserva atômica no Redis. Criação/upload não registra PAT/link em auditoria nem URLs na telemetria.

Parser: [API oficial do Busboy](https://github.com/mscdex/busboy), limites de arquivos/campos/partes e tratamento de streams.
