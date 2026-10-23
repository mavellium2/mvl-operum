# SDD — Login OAuth no MCP do Operum (conector do app Claude)

> **Status:** implementado na 1.36.0 (branch `feat/mcp-oauth`); homologação em staging e no celular pendente. As questões da seção 8 seguiram as recomendações (ver ADR-057).
> **Data:** 2026-10-21.
> **Cards (projeto Operum, sprint 1.6):** SDD/ADR `cmviogcqv003101o2mce220xt` · servidor de autorização `cmviogcwz003301o2ans819z9` · consentimento e apps conectados `cmviohqyy003501o2v6g8pyj4` · mcp-server `cmviohw4e003701o2g2y7p4s7` · homologação `cmvioi1hz003901o2gorssbxe`.
> **Decisão:** [ADR-057](../decisions.md#adr-057--login-oauth-no-mcp-para-conectores-do-claude) (implementada na 1.36.0).
>
> Marcações: **✅** confirmado no código ou na documentação • **⚠️ DECISÃO** pendente de aprovação • **🔎** a confirmar em homologação.

## 1. Problema

O MCP do Operum (`https://api.operum.adm.br/mcp`) só aceita PAT no cabeçalho `Authorization` (✅ `mcp-server/src/tenants.ts`, `parseTokens`). Os conectores do Claude (claude.ai, Desktop, celular e Cowork) se autenticam por OAuth. Por isso, hoje só dá para usar o Operum pelo Claude Code.

Objetivo: o usuário adiciona `https://api.operum.adm.br/mcp` como conector personalizado no claude.ai, faz login no Operum, autoriza, e passa a operar o Operum pelo chat, inclusive no celular. O mesmo conector também funciona nas sessões do Claude Code na nuvem, sem segredo de rede.

Fora do escopo: listar o Operum no diretório público de conectores, SSO corporativo e `client_credentials`, que o Claude não suporta.

### 1.1 Alternativa imediata a verificar

O claude.ai tem, em beta e para algumas organizações, conectores com **cabeçalho fixo** (`static_headers`): o Owner da organização informa um cabeçalho, como `Authorization: Bearer <PAT>`, ao adicionar o conector. 🔎 Se a opção **Request headers** aparecer ao adicionar o conector na conta da Mavellium, o PAT já funciona no chat do app. Limitação: o cabeçalho vale para todos os membros da organização no claude.ai e identifica uma só pessoa no Operum. Serve para uso individual, não para a equipe. Isso não substitui o OAuth.

## 2. Requisitos externos

### 2.1 Especificação MCP (2025-11-25, Authorization) ✅
- O servidor MCP publica Protected Resource Metadata (RFC 9728) e responde 401 com `WWW-Authenticate: Bearer resource_metadata="..."`.
- O servidor de autorização implementa OAuth 2.1 com PKCE S256, publica metadados RFC 8414 com `code_challenge_methods_supported` e suporta CIMD (recomendado) e/ou DCR (RFC 7591).
- O cliente envia `resource` (RFC 8707) na autorização e no token. O servidor MCP **precisa validar a audiência**: só aceita tokens emitidos para ele.
- O servidor MCP **não pode repassar** a terceiros o token recebido do cliente (token passthrough).
- Access token de vida curta; refresh token com rotação para clientes públicos.

### 2.2 Cliente OAuth do Claude ✅ (claude.com/docs/connectors/building/authentication)
- Redirect dos apps hospedados: `https://claude.ai/api/mcp/auth_callback`. O Claude Code usa loopback com porta variável (`http://localhost:<porta>/callback`, `http://127.0.0.1:<porta>/callback`): o redirect deve casar ignorando a porta.
- Usa CIMD só se os metadados trazem `client_id_metadata_document_supported: true` **e** `none` em `token_endpoint_auth_methods_supported`. Caso contrário, usa DCR, que cria um cliente novo a cada conexão.
- Sempre envia PKCE S256. Escopos: pega o `scope` do 401 ou o `scopes_supported` dos metadados do recurso. Acrescenta `offline_access` se o servidor o listar, para receber refresh token.
- O `resource` dos metadados precisa ser **igual** à URL digitada pelo usuário. Só o primeiro item de `authorization_servers` é usado.
- `/token` aceita `application/x-www-form-urlencoded`. Refresh inválido responde `invalid_grant`. Prazo: 10 s nos endpoints e 30 s no refresh.
- O tráfego vem de `160.79.104.0/21`; não pode haver WAF bloqueando.

## 3. Situação atual relevante ✅

- **Traefik:** em `api.operum.adm.br`, só `/mcp` e `/uploads/` vão para o mcp-server; o resto vai para o api-gateway (`docker-compose.production.yml`, router `mcp-prod-api`). `mcp.operum.adm.br` ainda depende de DNS.
- **PAT:** `ApiToken` no auth-service, com hash SHA-256, escopos `read`/`write`, validade e revogação. O gateway introspecta (`POST /auth/api-tokens/introspect`, interno), guarda cache de 60 s no Redis e apaga o cache ao revogar. Escrita exige `write`. PAT só alcança `GET /auth/me`, `/auth/my-tenants` e `/auth/all-users` no auth-service.
- **Multi-tenant:** cada PAT vale para um tenant. O mcp-server combina vários com `X-Operum-Tokens`. O `switch-tenant` permite trocar para qualquer tenant em que exista usuário ativo com o mesmo e-mail (`auth.service.ts`, `switchTenant`).
- **Login:** só no app Next.js (`/login`, cookie `session`, JWT com `jti` e sessão no Redis).

## 4. Desenho proposto

### 4.1 Visão geral

```
claude.ai ──(1) POST /mcp sem token──────────────► mcp-server ──401 + resource_metadata
          ──(2) GET /.well-known/oauth-protected-resource/mcp ─► mcp-server
          ──(3) GET /.well-known/oauth-authorization-server ───► api-gateway → auth-service
          ──(4) navegador: /oauth/autorizar (app) ─ login + consentimento ─► código
          ──(5) POST /oauth/token (code + verifier + resource) ─► gateway → auth-service
          ──(6) POST /mcp  Authorization: Bearer opr_oat_… ─► mcp-server
                 mcp-server ─► api-gateway (token + X-Operum-Tenant + chave interna do MCP)
```

| Peça | Onde | O que faz |
|---|---|---|
| Servidor de autorização (AS) | auth-service, rotas públicas `/oauth/*` e `/.well-known/oauth-authorization-server` pelo gateway | metadados, registro, código, token, refresh, revogação e introspecção interna |
| Tela de consentimento | app Next.js, `/oauth/autorizar` | exige sessão; o usuário escolhe workspaces e permissão |
| Servidor de recurso | mcp-server | metadados do recurso, 401, validação do token e da audiência |
| Ponto de autorização | api-gateway | introspecta o token OAuth como faz com o PAT e injeta `x-user-id`, `x-tenant-id` e `x-user-role` |

- **Issuer:** `https://api.operum.adm.br`. O `authorization_endpoint` fica em outro host (`https://operum.adm.br/oauth/autorizar`), o que a RFC 8414 permite. ⚠️ DECISÃO: quando `mcp.operum.adm.br` existir, mudar o recurso canônico para `https://mcp.operum.adm.br/mcp`. Isso invalida as conexões antigas (o `resource` muda), então o melhor é fazer a troca antes de liberar para a equipe.
- **Recurso canônico:** `https://api.operum.adm.br/mcp` (`MCP_RESOURCE_URL`).

### 4.2 Registro de cliente

1. **CIMD (principal).** Um `client_id` em forma de URL HTTPS é buscado e validado (`client_id` igual à URL, `redirect_uris` e `client_name`). Política de confiança: só hosts da allowlist `OAUTH_CIMD_ALLOWED_HOSTS` (inicialmente `claude.ai`), e redirects que não são loopback na mesma origem do `client_id`. O consentimento identifica o app pelo host do `client_id`, porque o `client_name` é declarado pelo próprio cliente. Busca com proteção a SSRF, reaproveitando as regras de `mcp-server/src/download.ts` (só HTTPS:443, sem IP privado, checagem na conexão, até 3 redirecionamentos, 5 s, 64 KB). Cache com TTL de no máximo 24 h.
2. **DCR (alternativa).** `POST /oauth/register` em JSON. Só aceita `redirect_uris` da allowlist (`https://claude.ai/api/mcp/auth_callback` e loopback `localhost`/`127.0.0.1`/`[::1]` com qualquer porta e caminho `/callback`), `token_endpoint_auth_method: none` e `grant_types` `authorization_code`/`refresh_token`. Rate limit por IP. Clientes sem nenhum grant em 30 dias são apagados.
3. ⚠️ DECISÃO: aceitar loopback em produção (necessário para o Claude Code via OAuth) ou só em staging. Recomendação: aceitar, porque o Claude Code continua tendo o PAT, mas mostrar um aviso no consentimento quando o redirect for loopback, como pede a especificação.

### 4.3 Autorização e consentimento

`GET https://operum.adm.br/oauth/autorizar?response_type=code&client_id&redirect_uri&code_challenge&code_challenge_method=S256&state&scope&resource`

1. O servidor (Server Component) valida tudo antes de mostrar qualquer coisa: cliente conhecido, `redirect_uri` exato (loopback sem porta), `S256`, `resource` igual ao canônico e escopos conhecidos. Se o cliente ou o redirect forem inválidos, mostra o erro na página e **não redireciona** (evita open redirect). Os demais erros voltam ao redirect com `error=` e `state`.
2. Sem sessão, vai para `/login?next=<url>`. O `next` deve ser validado como caminho interno.
3. A tela mostra o nome do cliente, o **host do redirect**, as permissões (leitura, ou leitura e escrita) e a lista de workspaces do usuário (`/auth/my-tenants`), com o atual marcado. Tem os botões Permitir e Negar.
4. Permitir dispara uma Server Action (que já confere a origem), chamando `POST /oauth/authorize/approve` no auth-service com a sessão JWT (nunca com PAT nem token OAuth). O auth-service revalida tudo, revalida cada tenant escolhido por e-mail e usuário ativo (mesma regra do `switch-tenant`), cria o código e devolve a URL de redirect.
5. Cabeçalhos: `Content-Security-Policy: frame-ancestors 'none'`, `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.

**Código de autorização:** 32 bytes aleatórios, guardado só como hash, validade de 60 s, uso único (marcar como usado na mesma transação da troca) e ligado a cliente, redirect, `code_challenge`, `resource`, escopos, tenants e usuário. Reuso do código revoga o grant gerado por ele.

### 4.4 Tokens

| Token | Formato | Validade | Guardado |
|---|---|---|---|
| Access | `opr_oat_` + 43 caracteres base62 (opaco) | 1 h | hash SHA-256 |
| Refresh | `opr_ort_` + 43 caracteres base62 | 30 dias desde a última rotação; teto de 90 dias por grant ⚠️ DECISÃO | hash SHA-256 |

- O token opaco, e não JWT, mantém a revogação imediata e o mesmo modelo de introspecção do PAT.
- **Rotação:** cada refresh emite um par novo e invalida o refresh anterior. Reuso de um refresh já trocado revoga o grant inteiro (detecção de roubo). Como só o hash é guardado, não dá para devolver o mesmo par numa retentativa: dentro de 10 s o reuso só responde `invalid_grant`, sem revogar; depois disso, revoga.
- `POST /oauth/token` aceita `authorization_code` (com `code_verifier` e `resource`) e `refresh_token`. Erros seguem a RFC 6749 (`invalid_grant`, `invalid_client`, `unsupported_grant_type`). Responde com `Cache-Control: no-store`.
- `POST /oauth/revoke` (RFC 7009) revoga o grant do token e apaga o cache.

### 4.5 Escopos

`scopes_supported`: `operum:read`, `operum:write` e `offline_access`.

- `operum:read` equivale ao escopo `read` do PAT; `operum:write` equivale a `write`.
- O 401 do mcp-server envia `scope="operum:read operum:write offline_access"`. No consentimento, o usuário pode desmarcar a escrita.
- Escrita sem `operum:write` → o gateway responde 403. O mcp-server traduz para `insufficient_scope`, como já faz com o PAT só de leitura.
- O token nunca dá mais que o papel do usuário: o gateway continua aplicando `authorizationMiddleware` a cada chamada.

### 4.6 Vários workspaces numa conexão

O grant guarda a lista `[{tenantId, userId}]` escolhida no consentimento, cada um validado por e-mail e usuário ativo.

- O mcp-server monta o `TenantRegistry` a partir do grant (introspecção interna, ver 4.7): um token, vários tenants. O primeiro escolhido é o padrão. As tools continuam aceitando `tenant_id`.
- Cada chamada do mcp-server ao gateway informa `X-Operum-Tenant: <tenantId>`. O gateway só aceita tenants do grant e injeta o `userId` daquele tenant.
- Usuário desativado num tenant: esse tenant sai na hora (a introspecção confere `isActive`); os demais continuam.

### 4.7 Validação no mcp-server e no gateway (sem token passthrough)

- O mcp-server responde ao 401 e serve `GET /.well-known/oauth-protected-resource/mcp` (e também `/.well-known/oauth-protected-resource`, para `mcp.operum.adm.br`) com `resource`, `authorization_servers: ["https://api.operum.adm.br"]`, `scopes_supported` e `bearer_methods_supported: ["header"]`.
- `parseTokens` passa a reconhecer `opr_oat_`. O PAT e o `X-Operum-Tokens` continuam iguais. Misturar `opr_oat_` com `X-Operum-Tokens` dá 401.
- Para chamar o gateway, o mcp-server envia o próprio `opr_oat_` junto com `X-Operum-Tenant` e `X-Operum-Mcp-Key` (segredo `MCP_GATEWAY_KEY`, só do mcp-server e do gateway).
- O gateway introspecta o `opr_oat_` (cache de 60 s, como o PAT) e só o aceita se: (a) a `X-Operum-Mcp-Key` estiver correta (comparação em tempo constante), (b) a audiência do grant for o recurso canônico do MCP e (c) o tenant estiver no grant. Sem a chave, o token é recusado. Assim, um `opr_oat_` vazado não serve na API pública do gateway, só pelo MCP, que é a audiência dele.
- ⚠️ DECISÃO: isso cumpre o objetivo da regra contra passthrough (o token só é aceito pelo recurso para o qual foi emitido, e o gateway e o mcp-server são o mesmo sistema). A alternativa mais rígida é a troca de token (RFC 8693) por um token interno de curta duração a cada chamada. Recomendação: começar com a chave interna; a troca de token fica como evolução.
- Os mesmos limites de PAT no auth-service valem para o token OAuth (allowlist `GET /auth/me`, `/auth/my-tenants`, `/auth/all-users`), e ele nunca gerencia PATs nem grants.
- `x-auth-type: oauth`, `x-oauth-grant-id` e `x-oauth-client-id` vão para os serviços e para o `AuditLog` (`details.via = "mcp"`, com o cliente).

### 4.8 Apps conectados (perfil)

- Seção "Apps conectados" em `/perfil/tokens`: nome do cliente, host do redirect, workspaces, permissões, data da autorização, último uso e botão **Revogar**, que tem efeito imediato (apaga o cache).
- Um grant aparece em todos os tenants dele. Revogar num tenant revoga o grant inteiro.
- O admin do tenant pode listar e revogar grants que incluem o tenant dele. ⚠️ DECISÃO: pode ficar para uma segunda etapa.

### 4.9 Modelo de dados (auth-service, schema `public`)

```prisma
model OAuthClient {
  id                String   @id @default(cuid())
  clientId          String   @unique // URL (CIMD) ou id gerado (DCR)
  kind              String   // "cimd" | "dcr"
  name              String
  redirectUris      String[]
  metadataFetchedAt DateTime?
  createdAt         DateTime @default(now())
  lastUsedAt        DateTime?
  grants            OAuthGrant[]
}

model OAuthGrant {
  id          String    @id @default(cuid())
  clientId    String
  client      OAuthClient @relation(fields: [clientId], references: [id])
  email       String    // identidade comum aos tenants
  resource    String
  scopes      String[]
  createdAt   DateTime  @default(now())
  expiresAt   DateTime  // teto absoluto
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  tenants     OAuthGrantTenant[]
  tokens      OAuthToken[]
}

model OAuthGrantTenant {
  grantId  String
  tenantId String
  userId   String
  isDefault Boolean @default(false)
  grant    OAuthGrant @relation(fields: [grantId], references: [id])
  @@id([grantId, tenantId])
}

model OAuthCode {
  codeHash      String   @id
  clientId      String
  redirectUri   String
  codeChallenge String
  resource      String
  scopes        String[]
  tenants       Json     // [{tenantId,userId,isDefault}]
  email         String
  expiresAt     DateTime
  usedAt        DateTime?
  grantId       String?  // preenchido na troca, para revogar em caso de reuso
}

model OAuthToken {
  tokenHash   String    @id
  grantId     String
  grant       OAuthGrant @relation(fields: [grantId], references: [id])
  type        String    // "access" | "refresh"
  expiresAt   DateTime
  rotatedAt   DateTime? // refresh já trocado
  createdAt   DateTime  @default(now())
  @@index([grantId])
}
```

A migration fica no lugar em que o deploy já aplica as migrations desse schema (conferir na implementação, como na ADR-046). Uma limpeza periódica apaga códigos e tokens vencidos.

### 4.10 Infraestrutura e configuração

- **Traefik:** acrescentar ao router `mcp-prod-api` (e ao de staging) `PathPrefix('/.well-known/oauth-protected-resource')`. O `/.well-known/oauth-authorization-server` e o `/oauth/*` ficam no gateway, que precisa tê-los como rotas públicas, com o parser `application/x-www-form-urlencoded` em `/oauth/token` e `/oauth/revoke`, e com rate limit próprio.
- **Variáveis novas:** `OAUTH_ISSUER`, `MCP_RESOURCE_URL`, `OAUTH_AUTHORIZE_URL`, `OAUTH_CIMD_ALLOWED_HOSTS`, `MCP_GATEWAY_KEY` (32 bytes aleatórios, no mcp-server e no gateway).
- **CSP** do app: `frame-ancestors 'none'` já vale para todas as páginas. Como `form-action` é `'self'`, Permitir/Negar devolvem a URL e o navegador navega até ela. `/oauth/*` sai com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
- Nenhuma regra de firewall pode bloquear `160.79.104.0/21`.

## 5. Segurança — checklist de aceite

- [ ] PKCE obrigatório e só `S256`; `plain` recusado.
- [ ] `redirect_uri` exato (loopback: só a porta pode variar); nunca redirecionar para URI não registrada.
- [ ] Código de uso único, 60 s; reuso revoga o grant.
- [ ] Refresh com rotação; reuso revoga o grant.
- [ ] `resource` obrigatório, igual ao canônico, gravado no grant e conferido no gateway.
- [ ] Token OAuth recusado na API pública sem `X-Operum-Mcp-Key`.
- [ ] Tokens, códigos e refresh só como hash; nunca em log (telemetria com prefixo e hash truncado, como o PAT).
- [ ] Busca CIMD protegida contra SSRF, com tamanho e tempo limitados.
- [ ] Consentimento com CSRF (Server Action), `frame-ancestors 'none'` e host do redirect visível.
- [ ] Rate limit em `/oauth/register`, `/oauth/token` e na aprovação.
- [ ] Revogação imediata (cache apagado) e usuário inativo cortado na introspecção.
- [ ] Auditoria: emissão, refresh, revogação e reuso detectado.
- [ ] PAT + `X-Operum-Tokens` sem regressão.

## 6. Fases e entregas

| Fase | Card | Entrega | Versão |
|---|---|---|---|
| 0 | SDD/ADR | este documento e a ADR-057 aprovados | — |
| 1 | servidor de autorização | modelos, metadados, CIMD/DCR, aprovação, token, refresh, revogação e introspecção interna, com testes | — |
| 2 | consentimento | `/oauth/autorizar`, apps conectados no perfil | — |
| 3 | mcp-server | metadados do recurso, 401, `opr_oat_`, `X-Operum-Tenant`, gateway com `X-Operum-Mcp-Key`, Traefik | MINOR na PR que liberar o fluxo inteiro |
| 4 | homologação | staging → produção, teste no celular (iOS/Android) e no Claude Code na nuvem, tutorial | — |

As fases 1 a 3 podem ir numa PR só ou em PRs encadeadas, mas o fluxo só é ligado em produção quando as três estiverem juntas. A versão sobe uma vez (MINOR), com `CHANGELOG.md`, `docs/architecture.md` (seções auth-service, api-gateway, mcp-server e fluxo de autenticação) e a ADR-057 marcada como implementada.

## 7. Testes

- **auth-service:** fluxo completo com CIMD e com DCR; PKCE errado; `redirect_uri` diferente; código reusado; refresh reusado; `resource` errado; tenant sem usuário ativo; revogação; expiração; corpo form-urlencoded.
- **gateway:** `opr_oat_` sem chave interna → 401; tenant fora do grant → 403; escrita sem `operum:write` → 403; cache apagado na revogação.
- **mcp-server:** 401 com `resource_metadata` e `scope`; metadados do recurso; vários tenants a partir de um token; PAT inalterado.
- **Ponta a ponta (staging):** MCP Inspector e conector personalizado no claude.ai (web e celular).

## 8. Questões em aberto (resolvidas com as recomendações)

O usuário pediu para continuar com as recomendações. Ficou assim: 1 h / 30 dias / 90 dias; `api.` agora, configurável; loopback aceito com aviso; gestão pelo admin depois; chave interna. Lista original:


1. Prazos: access de 1 h, refresh de 30 dias deslizantes e teto de 90 dias.
2. Domínio definitivo do recurso (`api.` agora ou esperar `mcp.`).
3. Loopback em produção (Claude Code via OAuth).
4. Gestão de grants pelo admin do tenant: agora ou depois.
5. Chave interna (recomendado) ou troca de token RFC 8693.
