# Arquitetura do Projeto — MVL Operum

## Manutenção deste documento

Revisar o impacto arquitetural em cada PR e atualizar as seções afetadas na mesma entrega. Ao concluir uma fase do SDD ou preparar uma release, conferir a consistência das áreas alteradas. Não há periodicidade fixa: mudanças relevantes disparam a atualização, conforme as regras do [AGENTS.md](../AGENTS.md).

Este documento descreve a arquitetura; o [registro de decisões](decisions.md) guarda contexto, motivos e consequências das escolhas. O registro inicial é retrospectivo e não representa uma auditoria de toda a arquitetura.

## Visão Geral

Plataforma de gerenciamento de projetos multi-tenant com board Kanban por sprint, EAP/WBS (estrutura analítica do projeto), atas de reunião, planilha de custos, rastreamento de tempo, controle de membros/stakeholders por projeto, dashboard analítico, auditoria, notificações e controle de acesso por papel.

A aplicação é um **Next.js 16 App Router** que atua como frontend + BFF, na frente de uma malha de **6 microsserviços** (1 API Gateway + 5 serviços de domínio) que compartilham um único PostgreSQL. Parte das funcionalidades mais novas (EAP, WBS, Atas, Cadastros) ainda roda direto no schema Prisma do monolito — ver [Migração incompleta](#migração-incompleta--o-que-ainda-é-monolito) e o [Roadmap](#roadmap-de-migração-strangler-fig).

---

## Stack Tecnológica

### Monolito (Next.js)

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16.4.2 (App Router) |
| UI | React 19.2.4 |
| Linguagem | TypeScript 5 |
| Banco de dados | PostgreSQL 17 |
| ORM | Prisma 7 (`prisma.config.ts`, gera em `lib/generated/prisma`), adapter `@prisma/adapter-pg` |
| Estilização | Tailwind CSS 4 + PostCSS |
| Drag & Drop | @hello-pangea/dnd 18.0.1 |
| Autenticação | JWT RS256 via `jose` + `bcryptjs` (HS256 fallback em dev) |
| Armazenamento | MinIO (S3-compatible) via `@aws-sdk/client-s3` |
| Filas | BullMQ (publisher) via Redis |
| Validação | Zod 4.3.6 |
| Gráficos | Recharts 3.8.1 |
| CSV | papaparse 5.5.3 |
| Testes | Vitest 4.1.2, Testing Library, MSW, JSDOM |

### Histórico de versões na interface

A página `/sobre` usa um Server Component para ler o `CHANGELOG.md` local, destacar a versão de `package.json` injetada por `NEXT_PUBLIC_APP_VERSION` e listar apenas versões anteriores. Não há consulta externa ou banco para esse histórico. O conteúdo é renderizado como texto/elementos React, sem HTML do Markdown. O arquivo é incluído no output standalone por `outputFileTracingIncludes` para `/sobre`, permitindo a mesma leitura em Docker. O `.dockerignore` mantém uma exceção explícita para `CHANGELOG.md`, necessário também durante a prerenderização. O check `App Image Build` de PR constrói a imagem final sem publicar e verifica o changelog/versionamento no standalone. As próximas entregas atualizam o histórico pelo changelog existente, sem uma segunda lista de versões.

### Microsserviços

Todos em NestJS 11 + Prisma 7, exceto o API Gateway (Express). Cada serviço tem seu próprio `prisma/schema.prisma`, mas **todos apontam para o mesmo banco PostgreSQL** (`schema=public`, exceto o file-service — ver [Banco de Dados](#banco-de-dados--estratégia-multi-schema)).

| Serviço | Framework | Porta | Responsabilidade |
|---------|-----------|-------|-------------------|
| `api-gateway` | Express 5 + `http-proxy-middleware` | 4000 (interna) / 4080 (pública) | Ponto de entrada único, autenticação JWT, rate limiting, proxy para os demais serviços. A porta pública (Traefik) só expõe as leituras de identidade em `/auth/*` (ADR-059) |
| `auth-service` | NestJS 11 + Prisma 7 | 4001 | Autenticação, usuários, tenants, sessões (Redis) |
| `project-service` | NestJS 11 + Prisma 7 | 4002 | Projetos, departamentos, roles/permissões RBAC, stakeholders |
| `sprint-service` | NestJS 11 + Prisma 7 | 4003 | Sprints, board Kanban (cards, colunas, tags), comentários, time tracking, dashboard de sprint, auditoria |
| `notification-service` | NestJS 11 + Prisma 7 + BullMQ (consumer) | 4004 | Notificações (criação assíncrona via fila) |
| `file-service` | NestJS 11 + Prisma 7 | 4005 | Upload/anexos via MinIO (schema Postgres próprio `files`) |

### Dependências de execução dos serviços

Os estágios finais das imagens instalam apenas dependências de produção (`pnpm install --frozen-lockfile --prod --ignore-scripts`). Todo pacote importado pelo código executado no container deve estar em `dependencies` do serviço. Isso inclui `dotenv`, carregado por `src/main.ts` nos cinco serviços NestJS. Validar esse tipo de alteração com instalação isolada de produção; o workspace de desenvolvimento pode mascarar pacotes ausentes.

### Infraestrutura

| Componente | Tecnologia |
|------------|------------|
| Containerização | Docker + Docker Compose |
| Reverse proxy / TLS | Traefik v2.11 (Let's Encrypt automático) |
| Gerenciador de pacotes | pnpm 11 via corepack, workspace real (`pnpm-workspace.yaml`: `packages: [".", "*"]`) |
| CI/CD | GitHub Actions (build/scan/push de 7 imagens + SSH deploy para VPS) |
| Servidor | VPS Hostinger (8 GB RAM, Ubuntu) |
| Cache / Fila / Sessões | Redis 7 |
| Object storage | MinIO (S3-compatible) |
| Observabilidade (prod) | Prometheus + Loki + Grafana |
| Segurança CI | TruffleHog (secrets), CodeQL (SAST), Trivy (scan de imagem), OWASP ZAP (DAST) |

---

## Arquitetura de Serviços

```
                         ┌──────────────────────┐
   Browser  ───────────► │   Next.js app (:3000) │  Traefik público (staging/prod)
                         └──────────┬────────────┘
                                    │ lib/api-client.ts (server-only)
                                    │ Authorization: Bearer <session JWT>
                                    ▼
                         ┌──────────────────────┐
                         │  api-gateway (:4000)  │  também exposto via Traefik
                         │  - authMiddleware     │  (api-{staging,}.operum.adm.br)
                         │  - rate limit 200/s   │
                         │  - CORS (ALLOWED_ORIGINS)│
                         └──────────┬────────────┘
             X-Internal-Api-Key + X-User-ID/X-Tenant-ID/X-User-Role
        ┌───────────┬───────────┬──┴────────┬──────────────┐
        ▼           ▼           ▼            ▼              ▼
  auth-service  project-service sprint-service notification- file-service
    (:4001)        (:4002)       (:4003)     service (:4004)  (:4005)
        │              │             │             │              │
        └──────────────┴─────────────┴─────────────┴──────────────┘
                                    │
                          PostgreSQL 17 (mvloperum)
                     schema public (compartilhado) + schema files
```

**Fluxo de autorização no gateway** (`api-gateway/src/middleware/auth.ts`):
1. Rotas públicas (`/auth/login`, `/auth/tenants/*`, `/auth/password/request-reset|validate-code|reset`, `/auth/verify`, `/health` e, desde 1.36.0, `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/token`, `/oauth/revoke`) passam sem token. As introspecções internas (`/auth/api-tokens/introspect`, `/oauth/introspect`) respondem 404, comparando o caminho normalizado (minúsculas, sem barras repetidas). Token `opr_oat_` (OAuth) só é aceito com `X-Operum-Mcp-Key` do mcp-server; ver [Conector OAuth do MCP](#conector-oauth-do-mcp-136).
2. Extrai token do header `Authorization: Bearer` ou do cookie `session`.
3. Verifica JWT: tenta RS256 (`JWT_PUBLIC_KEY`) e cai para HS256 (`SESSION_SECRET`) se falhar.
4. Em `NODE_ENV=production`, exige JTI e consulta o auth-service, que comprova sessão Redis e usuário/tenant persistido. Credencial inválida retorna 401; indisponibilidade retorna 503.
5. Em caso de sucesso, injeta `x-user-id`, `x-tenant-id`, `x-user-role` nos headers — os serviços downstream **confiam nesses headers sem revalidar o JWT**, protegidos apenas pelo segredo compartilhado `X-Internal-Api-Key` (`INTERNAL_API_KEY`), que só o gateway conhece e injeta em todo proxy.

### Tabela de roteamento do gateway (`proxyRoutes` em `api-gateway/src/main.ts`)

| Prefixo | Destino |
|---------|---------|
| `/auth` | auth-service |
| `/oauth`, `/.well-known/oauth-authorization-server` | auth-service (servidor de autorização OAuth, desde 1.36.0) |
| `/projects`, `/departments`, `/roles`, `/permissions`, `/stakeholders` | project-service |
| `/sprints`, `/cards`, `/tags`, `/time-entries`, `/audit` | sprint-service |
| `/notifications` | notification-service |
| `/files` | file-service |

---

## Ambientes de Deploy

### URLs de Acesso

| Ambiente | Aplicação | API Gateway | MinIO (storage) |
|----------|-----------|-------------|------------------|
| **Staging** | https://staging.operum.adm.br | https://api-staging.operum.adm.br | https://storage-staging.operum.adm.br |
| **Produção** | https://operum.adm.br | https://api.operum.adm.br | https://storage-prod.operum.adm.br |

O `api-gateway` é roteado publicamente pelo Traefik em ambos os ambientes — é o único ponto de entrada externo para a API além do próprio Next.js. Os demais 5 serviços (`auth-service`, `project-service`, `sprint-service`, `notification-service`, `file-service`) ficam **apenas na rede interna** (`internal`), sem exposição via Traefik.

Em produção, `docker-compose.production.yml` também sobe `prometheus`, `loki` e `grafana` (Grafana exposto em `grafana.${BASE_DOMAIN}`), inexistentes em staging.

### Bancos de Dados (VPS `187.77.236.241`)

| Ambiente | Host interno (Docker) | Porta externa | Nome do banco |
|----------|----------------------|---------------|---------------|
| Staging | `postgres:5432` | `5435` | `mvloperum` |
| Produção | `postgres:5432` | não exposta | `mvloperum_prod` |

> Para acessar o banco de produção localmente via Prisma Studio, use SSH tunnel:
> ```bash
> # 1. Obter IP do container (no VPS)
> docker inspect mvloperum-prod-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
> # 2. Alternativa: expor via socat
> docker run --rm -it --network mvloperum-prod_internal -p 15432:5432 alpine/socat TCP-LISTEN:5432,fork,reuseaddr TCP:postgres:5432
> # 3. Tunnel SSH (local)
> ssh -L 15433:localhost:15432 root@187.77.236.241 -N
> # DATABASE_URL para Studio:
> # postgresql://mvluser:<SENHA>@localhost:15433/mvloperum_prod
> ```

### Layout no VPS

```
/opt/mvloperum/
├── shared/          # traefik (docker-compose.traefik.yml)
├── staging/         # docker-compose.yml + docker-compose.staging.yml + .env
└── prod/            # docker-compose.yml + docker-compose.production.yml + .env
```

### Traefik Compartilhado

Traefik roda em `/opt/mvloperum/shared` conectado à rede externa `traefik-public`. Ambos os ambientes se conectam a essa rede via `networks: traefik-public: external: true`. A configuração crítica é `--providers.docker.network=traefik-public` para que o Traefik descubra os containers corretos.

---

## Estrutura de Diretórios

```
mvl-operum/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Rotas públicas (sem sidebar)
│   ├── actions/                  # Server Actions por domínio (19 arquivos)
│   ├── api/                      # Rotas REST do próprio monolito (FormData, export, health)
│   │   ├── atas/[ataId]/export/
│   │   ├── csv/, files/[attachmentId]/image/, health/, me/
│   │   ├── notificacoes/count/, search/, uploads/
│   │   └── projects/[projetoId]/
│   │       ├── charter/, charter/versions/
│   │       ├── documento/, documento/versions/, documento/versions/[versionId]/
│   │       ├── eap/                       # GET/PUT/POST — geração de documento EAP
│   │       └── macro-fases/, macro-fases/[faseId]/
│   ├── admin/
│   │   ├── page.tsx              # Hub de navegação do admin
│   │   ├── dashboard/page.tsx    # Métricas por projeto
│   │   ├── users/page.tsx        # Gerenciamento de usuários
│   │   ├── tenants/page.tsx      # Workspaces (multi-tenant: listar/trocar/provisionar)
│   │   └── cadastros/page.tsx    # Cadastro de departamentos/funções globais
│   ├── alterar-senha/page.tsx
│   ├── arquivos/page.tsx         # Galeria de anexos
│   ├── dashboard/sprint/[sprintId]/page.tsx
│   ├── equipe/page.tsx           # Redireciona para /sobre
│   ├── sobre/page.tsx            # Página institucional
│   ├── no-project/page.tsx
│   ├── notificacoes/page.tsx
│   ├── perfil/page.tsx
│   ├── projetos/
│   │   ├── page.tsx, novo/page.tsx
│   │   └── [projetoId]/
│   │       ├── page.tsx, dashboard/, departamentos/, documentacao/, funcoes/
│   │       ├── membros/                   # Membros do projeto (UsuarioProjeto)
│   │       ├── stakeholders/              # Stakeholders vinculados ao projeto
│   │       ├── atas/, atas/[ataId]/, atas/nova/     # Atas de reunião
│   │       ├── wbs/                       # Canvas interativo de EAP/WBS
│   │       ├── planilha-custos/           # Planilha de custos do projeto
│   │       └── sprints/, sprints/nova/, sprints/[sprintId]/
│   ├── sprints/[sprintId]/page.tsx  # Board Kanban (acesso global)
│   ├── layout.tsx, page.tsx, globals.css
├── components/                   # atas/, wbs/, custos/, projetos/documentacao/, board/, card/, dashboard/, …
├── lib/
│   ├── generated/prisma/         # Cliente Prisma gerado (monolito, não editar)
│   ├── validation/                # Schemas Zod (inclui ataSchemas, eapSchemas, wbsSchemas)
│   ├── api-client.ts             # Cliente HTTP server-only → API Gateway (padrão atual)
│   ├── authClient.ts  # identidade; domínio usa api-client.ts via gateway
│   ├── wbsCode.ts, wbsRollup.ts, wbsExportSvg.ts, wbsExportMspdi.ts, eapCode.ts, eapTemplate.ts
│   ├── dal.ts                    # verifySession()
│   ├── kanbanReducer.ts, reorderUtils.ts, defaultData.ts, prisma.ts, session.ts
├── services/                     # Camada de negócio legada (Prisma direto) — ainda viva, ver abaixo
├── types/
├── prisma/                       # schema.prisma + migrations/ do monolito (16 migrações)
├── __tests__/
├── proxy.ts
│
├── api-gateway/                  # Express — gateway (ver Arquitetura de Serviços)
├── auth-service/                 # NestJS — auth, users, tenants
├── project-service/              # NestJS — projects, departments, RBAC, stakeholders
├── sprint-service/                # NestJS — sprints, cards, tags, comments, time-entries, audit
├── notification-service/         # NestJS — notifications (BullMQ)
├── file-service/                 # NestJS — uploads (MinIO), schema Postgres próprio
└── [config files]
```

### Código morto conhecido

`lib/projectClient.ts` e `lib/sprintClient.ts` foram retirados na SDD 9.7 após inventário sem consumidores. O caminho de transporte de projetos/sprints é `lib/api-client.ts` → gateway. O check `scripts/check-domain-boundaries.mjs` impede reintroduzir esses clientes diretos; mapa de propriedade e exceções locais em [domain-boundaries.md](domain-boundaries.md).

---

## Multi-Tenancy

Toda entidade do sistema está vinculada a um `Tenant`. **O sistema já opera com múltiplos tenants ativos em produção** — há troca de workspace pelo usuário:

1. No login, o `auth-service` inclui o `tenantId` ativo no JWT.
2. Usuário pode listar seus tenants (`GET /auth/my-tenants`), trocar de tenant (`POST /auth/switch-tenant` → emite novo JWT), entrar em um tenant existente (`POST /auth/join-tenant`) ou, se admin, provisionar-se como admin de um novo tenant (`POST /auth/provision-tenant-admin`).
3. `verifySession()` em `lib/dal.ts` descriptografa o JWT/cookie de sessão e retorna `{ userId, tenantId, role, ... }`.
4. `lib/api-client.ts` repassa o JWT como Bearer token ao gateway; o gateway injeta `x-tenant-id` nos headers para os serviços internos.
5. Todas as Server Actions e controllers isolam dados por `tenantId`. O file-service, que não conhece cards nem tenants, confere cada card no sprint-service (`POST /cards/in-tenant`) antes de tocar em anexos (SDD 4.1).
6. `/admin/tenants` (só admin) lista todos os workspaces e permite trocar/entrar.

```
Tenant 1 ─┬─ Users ─┬─ Projetos ─ Sprints ─ Cards
           │         └─ UsuarioProjeto
           ├─ Tags
           ├─ Departamentos
           ├─ Roles
           └─ Auditorias
```

---

## Papéis e Controle de Acesso

### Role global (campo `User.role`)

| Valor | Acesso |
|-------|--------|
| `admin` | Painel `/admin/*` da **própria instituição**: usuários, cargos, departamentos e projetos. As rotas de admin do auth-service filtram pelo `tenantId` de quem chama |
| `gerente` | Gerenciamento de membros em projetos que participa |
| `member` | Apenas operações no board e perfil próprio |

### Operador da plataforma (`User.platformOperator`, ADR-060)

Gerenciar instituições (página `/admin/tenants`, criar, mudar status, renomear, entrar ou provisionar admin) exige `platformOperator = true`, conferido no banco a cada chamada (`lib/platformOperator.ts`; `exigirOperador` no auth-service). O papel é independente do `role`; a migration `20261024120000_operador_e_identidade` o concede aos admins atuais das instituições `mavellium` e `mavellium-main`. Conceder ou retirar é, por ora, alteração direta no banco.

### Contas da mesma pessoa em instituições diferentes (`User.identityId`, ADR-061)

Cada instituição tem a sua conta (`User`). A troca de instituição e os workspaces do consentimento OAuth só valem para contas **vinculadas** (mesmo `identityId`), não para qualquer conta com o mesmo e-mail. O vínculo nasce ao entrar/provisionar uma instituição a partir da conta atual ou ao confirmar a senha da conta de destino na primeira troca (`switch-tenant` com `password`, mesmo limite de tentativas do login). Contas com o mesmo e-mail ainda não vinculadas aparecem em "Minhas instituições" com `requiresPassword`.

### Role por projeto (`UserProjectRole`)

Além do papel global, cada usuário pode ter um papel específico dentro de um projeto, gerenciado pela tabela `UserProjectRole` (userId + projetoId + roleId). Os roles de projeto são criados pelo admin e têm `escopo = PROJETO`.

### Restrição na navegação

- `/admin/*` — verificado em `app/admin/layout.tsx` e nas actions via `requireAdmin()`; `/admin/tenants` e as ações de instituição exigem operador (`exigirOperadorDaPlataforma()`)
- `/projetos/:id/membros` — apenas `admin` ou `gerente`
- Demais rotas — qualquer usuário autenticado

---

## Banco de Dados — Estratégia Multi-Schema

Não existe database-per-service: **todos os 5 microsserviços apontam para o mesmo banco PostgreSQL** (`mvloperum`/`mvloperum_prod`), cada um com seu próprio `prisma/schema.prisma` cobrindo apenas as tabelas que possui/usa. O **monolito continua com o schema mais completo** e é a fonte da verdade para tudo que ainda não foi extraído (ver seção abaixo).

**Duplicação intencional (read-models locais para joins):**
- `Tenant` e `User` aparecem nos schemas de `project-service` e `sprint-service` além do `auth-service` (que é o dono canônico) — usados só para joins locais, não para escrita de identidade.
- `Project` aparece em `sprint-service` além de `project-service` (dono canônico).
- `Attachment` aparece nos schemas de `sprint-service` **e** `file-service`. O `file-service` é o dono canônico — a migração `add_attachment_schema` moveu a tabela para um schema Postgres dedicado (`files`), separado do `public` usado por todo o resto. A cópia em `sprint-service` é resquício e deveria ser tratada como read-only/candidata a remoção.

### Modelos por serviço

| Serviço | Modelos próprios (Prisma) |
|---------|---------------------------|
| `auth-service` | `Tenant`, `User` (dono canônico de identidade), `ApiToken`, `OAuthClient`, `OAuthGrant`, `OAuthGrantTenant`, `OAuthCode`, `OAuthToken` (migration `20261021120000_add_oauth`, só no schema do auth-service, como o `ApiToken`) |
| `project-service` | `Project`, `ProjectMacroFase`, `Department`, `UserDepartment`, `UserProject`, `Role`, `Permission`, `RolePermission`, `UserProjectRole`, `Stakeholder`, `ProjectStakeholder` |
| `sprint-service` | `Sprint`, `SprintColumn`, `Card`, `CardMovement`, `Tag`, `CardTag`, `CardResponsible`, `Comment`, `TimeEntry`, `DashboardMetric`, `SprintFeedback`, `AuditLog` |
| `notification-service` | `Notification` |
| `file-service` | `Attachment` (schema Postgres `files`) |

### Modelos que só existem no monolito (não extraídos)

`prisma/schema.prisma` (raiz) contém **todos** os modelos acima (como réplica/legado) **mais** os seguintes, exclusivos do monolito — nenhum microsserviço os conhece:

| Modelo | Domínio |
|--------|---------|
| `ProjectDraft` | Rascunho de projeto antes da criação |
| `ProjetoDepartamento`, `ProjetoFuncao` | Legado: associação de departamento/função a projeto. Desde a 1.20.0 não é usada (todo o catálogo vale em qualquer projeto); só `ProjetoDepartamento` segue espelhando o campo Departamentos do projeto (Editar projeto) |
| `DocumentVersion` (+ enums `DocumentVersionStatus`, `DocumentType`) | Snapshots de Termo, Partes Interessadas, EAP e Atas; status, recurso, sequência, autor e aprovação |
| `DocumentDraft` | Rascunho privado por projeto, autor, tipo e recurso; referências a tenant/projeto/usuário |
| `Ata`, `AtaPresente`, `AtaAcao`, `AtaAnexo` | Atas de reunião: presentes (com assinatura), ações, anexos |
| `WbsNode` (+ enum `WbsLayoutOrientation`) | Nós do canvas interativo de EAP/WBS |
| `EapTemplate`, `EapDocument` | Templates e documentos gerados de EAP |

### Tabelas herdadas da versão anterior (ver detalhamento completo no histórico do doc)

`Tenant`, `User`, `Projeto`/`Project`, `UsuarioProjeto`, `Departamento`/`UsuarioDepartamento`, `Role`/`Permission`/`RolePermission`/`UserProjectRole`, `Sprint`, `SprintColumn`/`Card`/`CardTag`/`CardResponsible`, `TimeEntry`, `Comentario`/`Notificacao`, `Auditoria`, `DashboardMetric`, `SprintFeedback`, `Tag`/`Attachment` — semântica inalterada em relação à versão anterior deste documento; o que mudou é **onde** cada um é escrito (serviço dono vs. monolito legado).

---

## Migração incompleta — o que ainda é monolito

As funcionalidades mais recentes (EAP, WBS, Atas, Cadastros) **não passam pelo gateway nem por nenhum microsserviço** — rodam via Prisma direto no schema do monolito, através de `services/*.ts`:

| Funcionalidade | Actions | Service | Páginas |
|-----------------|---------|---------|---------|
| WBS (canvas interativo de EAP) | `app/actions/wbs.ts` | `services/wbsService.ts` (`WbsNode`, `WbsConflictError` p/ concorrência otimista) | `app/projetos/[projetoId]/wbs/` |
| EAP (documento gerado por template) | via `app/api/projects/[projetoId]/eap/route.ts` | `services/eapService.ts` (`EapTemplate`, `EapDocument`) | integrado à página de WBS/documentação |
| Atas de reunião | `app/actions/atas.ts` | `services/ataService.ts` (`Ata`, `AtaPresente`, `AtaAcao`, `AtaAnexo`) | `app/projetos/[projetoId]/atas/` |
| Cadastros (departamentos e funções globais) | `app/actions/departments.ts`, `app/actions/roles.ts` | catálogo do tenant (sem associação por projeto desde a 1.20.0) | `app/admin/cadastros/` |

`app/actions/stakeholders.ts` é misto: CRUD de stakeholder via `project-service` (gateway), mas grava `user.signatureUrl` (usado para assinatura de atas) direto via `lib/prisma` + upload MinIO.

Isso significa que a frase "tudo passa pelo gateway" **ainda não é verdade** — ver [Roadmap](#roadmap-de-migração-strangler-fig) para o plano de extração.

---

## Fluxo de Dados

### Fluxo padrão — funcionalidade já extraída (gateway)

```
Componente React (Client)
       ↓
Server Action (app/actions/*.ts)
  - verifySession() → tenantId, userId, role
  - Validação Zod do input
       ↓
lib/api-client.ts
  - fetch(`${API_GATEWAY_INTERNAL_URL}${path}`, { Authorization: Bearer <session> })
       ↓
api-gateway (:4000)
  - authMiddleware() valida JWT e consulta validade atual no auth-service em produção
  - injeta x-user-id / x-tenant-id / x-user-role
  - proxy + X-Internal-Api-Key
       ↓
Microsserviço de domínio (Nest Controller → Service → Prisma)
       ↓
PostgreSQL
       ↓
revalidatePath() → Next.js revalida a rota
```

### Fluxo legado — funcionalidade ainda no monolito (WBS/EAP/Atas/Cadastros e parte de admin/roles/departments)

```
Componente React (Client)
       ↓
Server Action (app/actions/*.ts)
  - verifySession()
  - Validação Zod
       ↓
services/*.ts (lógica de negócio + Prisma direto via lib/prisma.ts)
       ↓
PostgreSQL (schema do monolito)
       ↓
revalidatePath()
```

### Fluxo de autenticação

```
Login:
  → Zod valida email/senha (Server Action) → lib/api-client.ts → POST /auth/login (gateway → auth-service)
  → auth-service busca usuário (por email + tenantId), bcrypt compara senha
  → JWT gerado com { userId, tenantId, role, tokenVersion, jti }
  → Sessão registrada no Redis: session:{jti}, TTL 7d
  → Cookie httpOnly "session" setado (7 dias)
  → Se forcePasswordChange=true → redirect /alterar-senha
  → Senão → redirect /projetos

Cada requisição protegida:
  → app: verifySession() lê/decripta cookie localmente (fallback) OU delega ao gateway
  → api-gateway: valida JWT (RS256 c/ fallback HS256), consulta auth-service para comprovar sessão/usuário; indisponibilidade retorna 503
  → Se forcePasswordChange=true → redirect /alterar-senha
```

### Fluxo de troca de senha forçada

```
Admin cria usuário com forcePasswordChange=true
  → No próximo login, redirectiona para /alterar-senha
  → alterarSenhaAction lê cookie diretamente (bypass de verifySession para evitar loop)
  → auth-service atualiza passwordHash + forcePasswordChange=false + incrementa tokenVersion
  → Deleta cookie de sessão → redirect /login?changed=1
```

### Gerenciamento de estado do board

1. **useReducer + kanbanReducer** — atualização otimista local para drag-and-drop (evita flickering)
2. **Server Actions + revalidatePath** — todas as mutações persistem via gateway/sprint-service e revalidam a rota

---

## API Gateway e Microsserviços — Endpoints

### auth-service (via `/auth/*`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login`, `/auth/register`, `/auth/logout` | Ciclo de sessão |
| GET | `/auth/me` / PATCH `/auth/me` | Perfil do usuário autenticado |
| GET | `/auth/verify` | Usado internamente para validar token |
| POST | `/auth/password/request-reset`, `/validate-code`, `/reset`, `/change`, `/alterar` | Fluxos de senha (recuperação e troca) |
| GET | `/auth/my-tenants` | Tenants do usuário |
| POST | `/auth/switch-tenant`, `/auth/join-tenant`, `/auth/provision-tenant-admin` | Multi-tenant |
| GET | `/auth/tenants/:subdomain` | Lookup público de tenant |
| GET | `/auth/users`, `/auth/all-users` | Listagem (admin) |
| POST | `/auth/admin/users` / PATCH `/auth/admin/users/:id`, `/:id/active`, `/:id/role` | CRUD de usuário pelo admin |
| POST | `/auth/oauth/authorize/check`, `/approve`, `/deny` | Consentimento OAuth (só sessão JWT; desde 1.36.0) |
| GET / DELETE | `/auth/oauth/grants`, `/auth/oauth/grants/:id` | Apps conectados do usuário (só sessão JWT) |
| GET | `/.well-known/oauth-authorization-server` | Metadados do servidor de autorização (RFC 8414), público |
| POST | `/oauth/register`, `/oauth/token`, `/oauth/revoke` | Registro dinâmico (RFC 7591), token e revogação (RFC 7009), públicos |
| POST | `/oauth/introspect` | Introspecção do token OAuth; só com `X-Internal-Api-Key`, bloqueada no gateway |

**E-mail da recuperação de senha (1.25.1):** o auth-service envia o código por SMTP (`nodemailer`, `src/mailer/mailer.service.ts`) com `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` e `APP_PUBLIC_URL` do `.env` da VPS. Sem SMTP, o pedido continua respondendo sucesso (anti-enumeração), mas nada é enviado. Em produção, o serviço registra erro na subida e a cada pedido, **sem o código** (só fora de produção ele aparece no log, para testes). Com SMTP, a subida testa a conexão (`verify`). Os logs mostram o e-mail mascarado. O deploy (`scripts/deploy/configure-observability.py`) avisa quando o SMTP do `auth-service` está incompleto, sem bloquear a release; a checagem só roda quando o compose tem o `auth-service`.

### project-service (via `/projects`, `/departments`, `/roles`, `/permissions`, `/stakeholders`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/projects`, `/projects/:id` | CRUD de projetos |
| GET | `/projects/user/:userId` | Projetos ativos do usuário |
| PATCH/DELETE | `/projects/:id` | Editar/remover |
| GET/POST | `/projects/:id/members` · DELETE `/projects/:id/members/:userId` · PATCH `/members/reorder` | Membros do projeto |
| PATCH | `/projects/:id/members/:userId/situacao` | Inativa (`{ ativo: false, motivo }`) ou reativa (`{ ativo: true }`) o membro no projeto; permissão `projeto:equipe` |
| GET/POST | `/projects/:id/macro-fases` | Macro-fases do projeto |
| GET/POST/PATCH/DELETE | `/roles`, `/roles/:id` | Roles RBAC |
| POST/DELETE | `/roles/:roleId/permissions/:permissionId` | Vínculo role↔permission |
| GET/POST | `/permissions` | Permissões |
| GET/POST/DELETE | `/projects/:projectId/roles`, `/:userId` | Roles por projeto |
| GET/POST/PATCH/DELETE | `/departments`, `/departments/:id` | Departamentos globais |
| POST/DELETE | `/departments/:id/users/:userId` | Membros do departamento |
| GET/POST/PATCH/DELETE | `/stakeholders`, `/stakeholders/:id` | Stakeholders |
| GET | `/stakeholders/by-project/:projectId` | Stakeholders de um projeto |
| POST/DELETE | `/stakeholders/:id/projects/:projectId` | Vínculo projeto↔stakeholder |
| PATCH | `/stakeholders/by-project/:projectId/reorder` | Reordenar |

### sprint-service (via `/sprints`, `/cards`, `/tags`, `/time-entries`, `/audit`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PATCH/DELETE | `/sprints`, `/sprints/:id` | CRUD de sprint |
| GET/POST/PATCH/DELETE | `/sprints/:id/columns`, `/:columnId` | Colunas do board |
| GET | `/sprints/:sprintId/metrics` · POST idem | Métricas de sprint |
| GET/POST | `/sprints/:sprintId/feedback` | SprintFeedback |
| GET | `/cards/backlog`, `/cards/search`, `/cards/:id` | Consultas de card |
| GET | `/cards/page` | Página com filtros de projeto/sprint/backlog/coluna/responsável/prioridade/prazo/texto; cursor e limite na origem |
| GET | `/sprints/:sprintId/cards` | Cards de um sprint |
| POST/PATCH/DELETE | `/cards`, `/cards/:id` | CRUD de card |
| GET | `/cards/:id/movements` | Histórico de movimentação (CardMovement) |
| POST/DELETE | `/cards/:id/tags/:tagId`, `/cards/:id/responsibles/:userId` | Tags e responsáveis |
| GET/POST/PATCH/DELETE | `/tags`, `/tags/:id` | CRUD de tag |
| GET/POST/PATCH/DELETE | `/cards/:cardId/comments`, `/:id` | Comentários |
| GET | `/cards/:cardId/time-entries`, `/total`, `/active` · `/users/:userId/time-entries` | Consultas de tempo |
| POST | `/cards/:cardId/time-entries/start`, `/manual` · `/time-entries/:id/stop` | Timer/entrada manual |
| DELETE | `/time-entries/:id` | Remover entrada |
| GET | `/time-entries/running` | Timer rodando do usuário (`x-user-id`) no tenant, em `{ entry }` (usado pelo MCP) |
| POST | `/cards/in-tenant` | Dos `ids` informados, os de cards do tenant. É como o file-service confere o dono de um card |
| GET/POST | `/audit` | Log de auditoria |

### notification-service (via `/notifications`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/notifications` | Criar (via BullMQ) |
| GET | `/notifications?userId=&limit=&status=&type=` | Listar |
| GET | `/notifications/count?userId=` | Contagem não lidas |
| GET | `/notifications/:id` | Buscar por ID |
| PATCH | `/notifications/:id/read`, `/:id/archive`, `/mark-all-read` | Mutações de status |
| DELETE | `/notifications/:id` | Soft delete |

### file-service (via `/files`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/files/upload?cardId=` | Upload de anexo (MinIO), até 50 MB |
| POST | `/files/link?cardId=` | Anexo do tipo link: grava só a URL (`text/uri-list`), sem objeto no MinIO |
| GET | `/files/by-cards?cardIds=` | Anexos dos cards (até 500 por consulta); só devolve os de cards do tenant |
| GET | `/files/:attachmentId/url[?cardId=]` | URL assinada (1 h), gerada com o host público do storage |
| PATCH | `/files/:attachmentId[?cardId=]`, `/:attachmentId/cover` | Renomear / definir capa |
| DELETE | `/files/:attachmentId[?cardId=]` | Remover |

**Tenant no file-service (SDD 4.1):**
- Toda rota exige `x-tenant-id`. O serviço não conhece cards nem tenants, então confere o card no sprint-service (`POST /cards/in-tenant`, com a chave interna) antes de gravar, listar, assinar, renomear ou excluir.
- Nas rotas por anexo, a conferência é pelo card do próprio anexo. Com `cardId`, o anexo precisa ser desse card.
- Falha fechada: responde 503 se o sprint-service não responder. Guarda em cache por 30 s só as respostas positivas.
- Variável `SPRINT_SERVICE_URL`, com padrão `http://sprint-service:4003`.
- `/files/avatar` e `/files/logo` foram removidas em 30/09: estavam expostas pelo gateway, sem uso e sem conferência de dono. Avatar e logo são gravados pelo app direto no MinIO (`uploadAvatarAction`).

**SVG (1.24.0, ADR-042):** aceito como anexo (`image/svg+xml`) em três barreiras. (1) O file-service recusa no upload SVG com conteúdo ativo (`src/upload/svg-safety.ts`: DOCTYPE/ENTITY, `script`, `foreignObject`, `iframe`/`embed`/`object`/`a`/`image`/`use`/`animate`/`set`, atributos `on*`, `href`, `javascript:`, `@import` e `url()` externo, também escondidos por entidades numéricas). (2) O objeto é gravado no MinIO com `Content-Disposition: attachment`: aberto pela URL do storage, baixa em vez de renderizar. (3) A pré-visualização do app (`/api/files/:id/image`, mesma origem) serve SVG com `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` e `nosniff`. Miniatura, capa e lightbox usam `<img>`, onde SVG não executa script. HTML continua recusado.

**URL assinada (SDD 4.2):** um segundo `S3Client`, que só assina e não faz chamada de rede, usa `MINIO_PUBLIC_URL`. A assinatura SigV4 inclui o host, então a URL assinada com o endpoint interno (`minio:9000`) não abria no navegador.

### mcp-server (`/mcp`)

Servidor MCP remoto e sem estado. Cada chamada usa o token do usuário (PAT ou, desde 1.36.0, token OAuth do conector do Claude) contra o api-gateway, e o mcp-server nunca fala direto com os serviços. A lista de tools e as regras estão em [`mcp-server/README.md`](../mcp-server/README.md).
- **OAuth (1.36.0, ADR-057):** publica `/.well-known/oauth-protected-resource/mcp` (e na raiz), responde 401 com `resource_metadata` e escopos e valida o token OAuth na entrada (vencido vira HTTP 401 para o cliente renovar). Uma conexão cobre os workspaces autorizados: cada chamada ao gateway leva `X-Operum-Tenant` e a chave interna `X-Operum-Mcp-Key`. Desligado sem `OAUTH_ISSUER`, `MCP_RESOURCE_URL` e `MCP_GATEWAY_KEY`. Fluxo completo em [Conector OAuth do MCP](#conector-oauth-do-mcp-136).
- **Tenant:** as tools de anexo (`operum_upload_attachment`, `operum_add_link`, `operum_delete_attachment`) também conferem a tarefa no tenant antes de chamar o file-service.
- **SSRF:** o download por `url` é protegido (`mcp-server/src/download.ts`).
- **Tempo:** as tools de timer (`operum_start_timer`, `operum_stop_timer`, `operum_log_time`) e de correção de lançamentos (`operum_list_time_entries`, `operum_update_time_entry`, `operum_delete_time_entry`, desde 1.30.0) usam as rotas de time entries do sprint-service: `GET /cards/:id/time-entries`, `PATCH` e `DELETE /time-entries/:id`. As regras de duração, futuro e sobreposição ficam no sprint-service (ADR-046). O gateway só deixa editar e apagar o dono do lançamento ou um admin, e o MCP não repete essa regra.
- **Leitura:** o `operum_get_task` devolve os anexos com `download_url` (arquivo) ou `url` (link) e o tempo da tarefa.
- **Paginação de tarefas (SDD 9.6):** `operum_list_tasks` delega filtros e cursor ao `GET /cards/page` do sprint-service, sem listar sprints/backlog/cards separadamente. Resposta `{items,total,next_cursor}`; limite 50, máximo 200. Ordenação por `createdAt,id`, limite superior da primeira página e cursor vinculado ao tenant/filtros. Cada página usa RepeatableRead; não é um snapshot entre requisições. Novos cards com chave posterior ao limite inicial são excluídos da travessia; mudanças de filtros, exclusões e permissões podem alterar o conjunto e o total. Cards sem projectId direto são incluídos pelo projeto da sprint ativa; vínculos de projeto incoerentes e responsáveis/tags de outro tenant são excluídos. Somente relações dos `limit+1` candidatos são carregadas; anexos são buscados dos IDs da página retornada.
- **Tempos no quadro:** `GET /sprints/:id/columns?timeEntries=summary` devolve `totalDurationSeconds` dos tempos encerrados e `timeEntries` apenas ativos, com agregação SQL por card. UI e ferramentas MCP de sprint usam esse modo; o serializer MCP preserva o total e timers ativos. Sem parâmetro (ou `full`), o contrato anterior de histórico completo permanece. Histórico detalhado continua nas rotas de card/time entries. Não há paginação dos cards do quadro nesta entrega.
- **Índices:** migration raiz `20261004030000_task_page_indexes` adiciona índices parciais `(projectId,createdAt,id)` para backlog ativo e `(sprintId,createdAt,id)` para cards ativos. Geridos via SQL, pois a condição parcial não é representada pelos schemas Prisma. `count` exato continua examinando o conjunto elegível no banco; a melhoria limita materialização/payload, sem prometer leitura física constante.
- **Medições e concorrência:** procedimento reproduzível e limites em [`docs/operations/task-pagination.md`](operations/task-pagination.md). Novo check Task Pagination executa fixture grande; Dashboard Contracts exercita a rota através de autenticação e autorização reais do gateway.

Todos os 5 serviços expõem `GET /health` (usado pelos healthchecks do Docker Compose).

---

## Rotas REST do próprio Monolito (`app/api/`)

Além das rotas acima (via gateway), o Next.js expõe rotas próprias para `FormData`, exportação de arquivos e funcionalidades ainda não extraídas:

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Healthcheck do container `app` |
| GET | `/api/me` | Dados do usuário autenticado |
| GET | `/api/search?q=query` | Busca global em cards e sprints |
| GET | `/api/notificacoes/count` | Contagem de notificações não lidas |
| POST | `/api/csv` | Importação de cards via CSV (multipart) |
| POST/DELETE | `/api/uploads` | Upload/remoção de arquivo (MinIO) |
| GET | `/api/files/:attachmentId/image` | Servir imagem de anexo (proxy da URL assinada, só do host do storage) |
| GET | `/api/files/:attachmentId/download?cardId=` | Abrir anexo de arquivo: confere a sessão e responde 302 para a URL assinada. É o link usado no card e em `/arquivos` |
| GET | `/api/atas/:ataId/export` | Exportar ata (PDF/documento) |
| GET/PATCH | `/api/projects/:projetoId/charter` · GET/POST `/charter/versions` | Termo de abertura do projeto e versões |
| GET | `/api/projects/:projetoId/documento` · GET/POST `/documento/versions` · PATCH `/versions/:versionId` | Documento do projeto e versionamento |
| GET/PUT/POST | `/api/projects/:projetoId/eap` | Geração/edição do documento EAP |
| GET/POST | `/api/projects/:projetoId/macro-fases` · PATCH/DELETE `/:faseId` | Macro-fases |
| GET | `/api/projetos/:projetoId/planilha-custos/export` | Exportar planilha de custos |

---

## Páginas e Funcionalidades

### `/admin`
Hub central do admin com links para: usuários, workspaces (tenants), cadastros, dashboard.

### `/admin/dashboard`
Métricas por projeto: % conclusão de cards, horas acumuladas, custo estimado, sprints ativas.

### `/admin/users`
CRUD completo de usuários (criar, editar, ativar/desativar), incluindo dados por projeto.

### `/admin/tenants`
Gerenciamento de workspaces (multi-tenant): listar tenants, entrar em um, trocar tenant ativo, provisionar-se como admin de um novo.

### `/admin/cadastros`
Cadastro de departamentos e funções globais reutilizáveis pelos projetos (`ProjetoDepartamento`/`ProjetoFuncao` — legado, direto no Prisma do monolito).
O menu lateral do projeto oferece atalhos para Departamentos e Funções a
administradores (papel obtido da sessão no layout servidor). Esses atalhos abrem
o catálogo global existente; o layout administrativo mantém sua autorização.

### `/no-project`
Tela exibida quando o usuário autenticado não está vinculado a nenhum projeto ativo.

### `/projetos`, `/projetos/novo`, `/projetos/:id`
Lista, criação e detalhe de projeto (dados básicos, status, ações).

### `/projetos/:id/membros`
Gerenciamento de membros com dados **por projeto** (`UsuarioProjeto`): listagem, edição inline (cargo/departamento/valorHora), adicionar/remover.

### `/projetos/:id/stakeholders`
Cadastro e vínculo de stakeholders (internos/externos) ao projeto, com reordenação. Membros da equipe e externos têm o botão "Inativar"/"Reativar" na linha e no formulário de edição; inativos aparecem em vermelho com o motivo (ver "Inativação de membro da equipe").

### `/projetos/:id/departamentos`, `/projetos/:id/funcoes`
Departamentos e papéis/funções do projeto (RBAC por projeto).

### `/projetos/:id/documentacao`
Documentação colaborativa de Termo, Partes Interessadas, EAP e Atas com snapshots em `DocumentVersion`, propostas pendentes e aba Registro por documento. A lista geral de Atas inclui propostas novas no histórico mesmo antes de existir uma ata publicada.

### `/projetos/:id/wbs`
Canvas interativo de EAP/WBS: árvore de nós com layout dinâmico, pan/scroll, cálculo de código hierárquico, rollup de custos/prazos, export SVG/MSPDI.

### `/projetos/:id/atas`, `/atas/nova`, `/atas/:ataId`
Atas de reunião: lista, criação e detalhe com presentes (assinatura), ações e anexos. Exportável via `/api/atas/:ataId/export`.

### `/projetos/:id/planilha-custos`
Planilha de custos do projeto, exportável via `/api/projetos/:id/planilha-custos/export`.

### `/projetos/:id/sprints`, `/sprints/nova`, `/sprints/:sprintId`
Lista de sprints do projeto e board Kanban.

### `/sprints/:id`
Board Kanban — acesso global, sem contexto de projeto na URL.

### `/dashboard/sprint/:id`
Dashboard de sprint: PieChart/BarChart (Recharts), ranking por usuário, cards atrasados, SprintFeedback.

### `/notificacoes`, `/arquivos`, `/alterar-senha`
Notificações, galeria de anexos, troca de senha forçada.

### `/configuracoes`
Tela de Configurações do usuário (1.37.0), aberta pelo item **Configurações** da sidebar global (usuários e admins) e pelo avatar do rodapé. O layout (`app/configuracoes/layout.tsx`) tem navegação própria por seções (`components/configuracoes/ConfiguracoesNav.tsx`): coluna no desktop, abas roláveis no celular. `/configuracoes` redireciona para Perfil.

| Seção | Rota | Conteúdo |
|---|---|---|
| Conta → Perfil | `/configuracoes/perfil` | Resumo, dados pessoais, avatar e assinatura digital |
| Conta → Segurança | `/configuracoes/seguranca` | Alterar senha |
| Conta → Instituições | `/configuracoes/instituicoes` | Instituições do usuário e troca de tenant |
| Conexões → Integrações | `/configuracoes/integracoes` | Apps conectados por OAuth (revogação imediata) e PATs usados pelo MCP e pela API |

Os endereços antigos `/perfil` e `/perfil/tokens` redirecionam (308) para Perfil e Integrações. O Perfil não edita cargo, departamento nem valor/hora (ficam com a gestão de membros e usuários); `updateProfileAction` valida com `MeuPerfilSchema` e não envia esses campos.

**Telefone e e-mail (1.37.0):** `lib/contato.ts` concentra máscara e validação (fixo, celular brasileiro ou internacional com `+`; e-mail sem espaços e com formato válido, sem mudar maiúsculas, porque o login compara o e-mail exato). Os formulários usam `TelefoneInput`/`EmailInput` (`components/ui/ContatoInputs.tsx`) e as actions de perfil, admin, membros, stakeholders e atas validam de novo com `normalizarContato`/schemas zod. Na edição, valores iguais aos já salvos não são revalidados. O `PATCH /auth/me` do auth-service ainda aceita qualquer campo sem validação.

**Valores em reais (1.37.0):** `lib/dinheiro.ts` concentra máscara (centavos entram pela direita), leitura (`parseMoeda` aceita `1.234,56`, `1234.56` e número) e validação (`erroMoeda`: não negativo, até R$ 99.999.999.999,99). `components/ui/MoedaInput.tsx` é usado em valor/hora, remuneração, custo das macrofases e materiais. Os formatos salvos não mudaram: o cadastro do projeto guarda o custo da macrofase como `1.000,00`, o Termo como `1000.00`, e os demais como número. As actions de membros, vínculo por projeto, usuários e projetos e os schemas do Termo e da WBS validam no servidor.

### `/oauth/autorizar`
Tela de consentimento OAuth (1.36.0), fora da sidebar. Exige sessão; o proxy guarda a query no `from` do login e o login volta para ela mesmo sem projeto. Valida o pedido no auth-service, mostra app, quem pede (host do `client_id` no CIMD; no DCR, o nome é marcado como declarado pelo app), host de retorno, permissões e workspaces. Permitir e Negar navegam pelo navegador até a URL de retorno (a CSP limita `form-action` a `'self'`). Sem cache e com `Referrer-Policy: no-referrer`.

### PWA: `/manifest.webmanifest`, `/sw.js`, `/offline`
App instalável (1.38.0, ADR-058, cards MOB-18 e MOB-19 da sprint 1.2 Mobile). Usa o suporte nativo do Next, sem biblioteca:

- `app/manifest.ts` gera o manifest (`display: standalone`, `start_url` e `scope` em `/`, ícones em `public/icons/`). Os PNG foram gerados a partir de `public/icons/operum.svg` (comum, cantos arredondados) e `operum-maskable.svg` (fundo sangrado, glifo na zona segura). `app/layout.tsx` declara `theme-color`, `appleWebApp` e o `apple-touch-icon`.
- `app/sw.js/route.ts` serve o worker montado por `lib/pwa/serviceWorker.ts` (`swMain` serializada no script, com a versão do `package.json` no nome dos caches), com `Cache-Control: no-cache, no-store, must-revalidate`. Escopo `/`.
- O worker guarda só `/_next/static/*` e `/icons/*` (cache primeiro, teto de 300 entradas) e a página `/offline` com os estáticos que ela usa (buscada sem cookies na instalação). Navegações vão sempre à rede; só a falha de rede devolve `/offline` no endereço pedido. APIs, RSC, Server Actions, anexos, outras origens e pedidos com `Range` não passam pelo worker. Como nada guardado depende de sessão, logout e troca de instituição não precisam limpar cache.
- `components/pwa/ServiceWorkerRegistrar.tsx` (no layout raiz, também no login) registra o worker só em produção, procura versão nova ao voltar para a aba e mostra o aviso de atualização; o worker novo só assume com `SKIP_WAITING` pedido pelo usuário. Em desenvolvimento remove registros antigos.
- `/offline` é pública (fora do `proxy.ts` e do AppShell) e cobre a tela com uma camada fixa, porque é servida no endereço que falhou.
- Pendências: `viewport-fit=cover` e as áreas seguras ficam para a navegação mobile (MOB-01); orientação de instalação (MOB-20) e push (MOB-21) ainda não existem; homologação em Android e iPhone reais pendente.

### `/sobre`, `/equipe`
Página institucional (`/equipe` redireciona para `/sobre`).

---

## Serviços (`services/`)

Continua sendo a camada de negócio para tudo que **não** foi extraído para microsserviço — ainda é código vivo, não legado morto. Backing das Server Actions "mistas" (admin, roles, departments) e **única** camada para WBS/EAP/Atas/Cadastros.

| Serviço | Responsabilidade |
|---------|-----------------|
| `authService` | Login, registro, hash de senha (uso remanescente/local) |
| `adminService` | CRUD de usuários pelo admin |
| `tenantService` | Lookup e listagem de tenants |
| `projectService` / `projetoService` | CRUD de projetos (versões en/legado, ainda no monolito onde a action não passa pelo gateway) |
| `projectRoleService` | Papéis por projeto; garante papel de gerente ao criar projeto |
| `sprintService` / `sprintColumnService` | CRUD de sprints/colunas (uso remanescente) |
| `dashboardService` / `dashboardMetricService` | Métricas gerais e cache por sprint/usuário |
| `sprintFeedbackService` | Feedbacks por sprint |
| `comentarioService` | Comentários em cards (uso remanescente) |
| `cardResponsibleService` | Responsáveis por card |
| `auditoriaService` | Registro de log de auditoria (monolito) |
| `notificacaoService` | CRUD de notificações (fallback direto no banco) |
| `tagService` | CRUD de tags |
| `timeService` | Timer e entradas manuais de tempo |
| `fileUploadService` | Upload/delete no MinIO (uso remanescente no monolito) |
| `csvImportService` | Parse e importação de CSV |
| `roleService` / `permissionService` | CRUD de roles/permissões RBAC |
| Departamentos | CRUD canônico no project-service; duplicatas locais retiradas na SDD 9.7 |
| `projetoCadastroService` | Erros de cadastro compartilhados (a associação por projeto foi removida na 1.20.0) |
| `wbsService` | Canvas de EAP/WBS: CRUD de nós, `WbsConflictError` (concorrência otimista) |
| `eapService` | Templates e documentos EAP gerados |
| `ataService` | Atas de reunião: presentes, ações, anexos |
| `userService` | Listagem de usuários por tenant |
| `migrationService` | Scripts de migração de dados |

---

## Validação (Zod)

Schemas em `lib/validation/`:

| Arquivo | Schemas |
|---------|---------|
| `authSchemas.ts` | Login, registro, troca de senha |
| `avatarUrl.ts` | Validação de URL de avatar |
| `ataSchemas.ts` | Atas, presentes, ações, anexos |
| `cardSchemas.ts` | Criação e edição de card |
| `comentarioSchemas.ts` | Criação de comentário em card |
| `csvSchemas.ts` | Estrutura de linha CSV |
| `departamentoSchemas.ts` / `departmentSchemas.ts` | Departamento (pt legado / en) |
| `eapSchemas.ts` | Templates e documentos EAP |
| `fileSchemas.ts` | Tipo e tamanho de arquivo |
| `notificacaoSchemas.ts` | Notificações |
| `projectSchemas.ts` / `projetoSchemas.ts` | Projeto (en / pt legado) |
| `roleSchemas.ts` | Roles RBAC |
| `sprintSchemas.ts` | Sprint |
| `tagSchemas.ts` | Tag |
| `tenantSchemas.ts` | Tenant |
| `userSchemas.ts` | Perfil e admin |
| `wbsSchemas.ts` | Nós do canvas WBS |

---

## Segurança

| Mecanismo | Implementação |
|-----------|---------------|
| Senha | bcrypt rounds 10–12 |
| Sessão | JWT RS256 httpOnly cookie, `SameSite=strict`, 7 dias, `jti` registrado no Redis (`session:{jti}`) |
| Algoritmo JWT | RS256 em staging/produção; HS256 fallback em dev local (sem chaves configuradas) |
| Invalidação de sessão | `tokenVersion` — incrementar invalida todas as sessões; sessão Redis e estado persistido verificados pelo auth-service (produção). Trocar ou redefinir a senha (inclusive pelo admin) também revoga os PATs e as conexões OAuth da conta (`auth-service/src/auth/revogacao.ts`). A introspecção de PAT e o `/api/internal/authorize` exigem conta não excluída e instituição ativa |
| Bloqueio de conta | `isActive=false` verificado em cada request |
| Troca de senha forçada | `forcePasswordChange` verificado no login e em `verifySession` |
| Isolamento de dados | Toda query usa `tenantId` da sessão |
| Validação de input | Zod em todas as actions e API routes |
| Auditoria | `AuditLog`/`Auditoria` registra ações críticas com userId, entidade e detalhes |
| PWA / service worker | `/sw.js` só guarda estáticos versionados, ícones e a página pública `/offline`; nunca HTML autenticado, APIs nem anexos (ADR-058). CSP com `manifest-src` e `worker-src` em `'self'`. Manifest, worker, ícones e `/offline` ficam fora do `proxy.ts`. |
| Middleware de auth (monolito) | `proxy.ts` valida sessão via `http://localhost:PORT/api/me` antes de cada rota protegida |
| Confiança gateway↔serviços | Serviços internos **não** revalidam o JWT — confiam nos headers `x-user-id`/`x-tenant-id`/`x-user-role` injetados pelo gateway, protegidos pelo segredo compartilhado `X-Internal-Api-Key` (`INTERNAL_API_KEY`, comparado em tempo constante). Rede `internal` do Docker Compose impede acesso direto de fora. Como o gateway anexa a chave também ao tráfego público, a porta pública restringe `/auth/*` (ADR-059) e as rotas de conta validam campos (`.strict()`) e escopo de tenant. O notification-service usa o `x-user-id` do gateway como dono (nunca o `userId` de query/body) e recusa criar notificação pelo gateway. |
| Rate limiting | `api-gateway`: 200 req/s por IP do cliente (`express-rate-limit`), com `trust proxy` só para loopback/redes privadas (`GATEWAY_TRUST_PROXY`), para que o IP venha do `X-Forwarded-For` do Traefik sem aceitar valor forjado; `/oauth/register` e `/oauth/token` com limites próprios; 20 req/s por PAT/conexão OAuth. Login: tentativa errada conta em todas as contas candidatas do mesmo e-mail (bloqueio após 10) |
| CORS | `api-gateway`: allow-list via `ALLOWED_ORIGINS` (⚠️ não documentado em `.env.example` — gap de configuração conhecido) |
| Dependência de sessão indisponível | Produção bloqueia com 503; credencial inválida/revogada retorna 401. Gateway consulta auth-service sem cache de validade JWT. |
| CI/CD | TruffleHog (secrets), CodeQL (SAST), Trivy (scan de todas as 7 imagens), OWASP ZAP (DAST) em `deploy-staging.yml`/`deploy-production.yml`. `dependency-audit.yml` verifica instalações congeladas, patch efetivo e audit high da raiz/gateway nas PRs para main/develop. O pnpm dos workflows vem de `packageManager` da raiz. O job `deploy-production.yml:security-scan` também roda nas PRs para main, garantindo a mesma configuração CodeQL da base; testes de deploy, build/push e deploy ficam bloqueados nesse evento. Actions de terceiros fixadas por SHA de commit (com a tag em comentário); `deploy-production.yml` com `permissions: contents: read` por padrão e entradas do `workflow_dispatch` passadas por `env`. |

---

## Migrações Aplicadas

O monolito tem **30 migrações** em `prisma/migrations/`. Algumas que refletem funcionalidades novas:

| Migração | O que faz |
|----------|-----------|
| `add_card_movements` | Tabela `CardMovement` (histórico de arrasto de card) |
| `add_wbs_node` | Tabela `WbsNode` + enum `WbsLayoutOrientation` |
| `add_userproject_remuneracao_horas_diarias` | Campos de remuneração/carga horária em `UsuarioProjeto` |
| `add_ata_cadastros_globais_custos` | `Ata`, `AtaPresente`, `AtaAcao`, `AtaAnexo`, `ProjetoDepartamento`, custos |
| `add_projeto_funcao` | Tabela `ProjetoFuncao` |
| `add_ata_member_refs` | Vínculo de presentes/ações de ata com `User` |
| `add_eap_template_document` | Tabelas `EapTemplate`, `EapDocument` |
| `operador_e_identidade` (1.39.0) | `User.platformOperator` e `User.identityId` (+ índice); concede operador aos admins de `mavellium`/`mavellium-main` e vincula contas com mesmo e-mail e hash (ADR-060, ADR-061). O campo também está no schema do auth-service, que não tem migration própria para ele |

Migrações anteriores (base multi-tenant, RBAC, auditoria, `DocumentVersion`, `ProjectDraft` etc.) seguem a mesma linha da versão anterior deste documento — ver histórico completo em `prisma/migrations/`.

**Migração dos microsserviços — lacuna conhecida:** apenas `sprint-service` e `file-service` têm mecanismo automatizado de `prisma migrate deploy` no deploy (via profile `migrate-sprint-service`/`migrate-file-service`, e o `file-service` roda a migração também no próprio entrypoint do container, porque o deploy de produção normalmente não usa o profile `migration`). **`auth-service`, `project-service` e `notification-service` não têm nenhum mecanismo automatizado de migração** — mudanças de schema nesses três serviços precisam ser aplicadas manualmente. Isso deveria ser corrigido antes de qualquer mudança de schema nesses serviços.

---

## Configuração e Ambiente

### Monolito (`app`)

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Connection string do PostgreSQL |
| `SESSION_SECRET` | Chave HS256 (fallback dev) |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Par de chaves RS256 (newlines como `\n` literal) |
| `API_GATEWAY_INTERNAL_URL` | URL interna do gateway (server-side, ex: `http://api-gateway:4000`) |
| `NEXT_PUBLIC_API_URL` | URL pública, fallback client-side |
| `NOTIFICATION_SERVICE_URL`, `AUTH_SERVICE_URL`, `FILE_SERVICE_URL` | URLs diretas ainda injetadas no `app` (uso legado/parcial fora do gateway) |
| `INTERNAL_API_KEY` | Segredo compartilhado gateway↔serviços |
| `DEFAULT_TENANT_ID` | Tenant padrão para auto-registro |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis de sessões/limites; REDIS_QUEUE_HOST para fila e REDIS_CACHE_HOST para cache |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` / `MINIO_PUBLIC_URL` | Object storage |
| `NODE_ENV`, `PORT` | Ambiente/porta do servidor Next.js |

### api-gateway

| Variável | Uso |
|----------|-----|
| `JWT_PUBLIC_KEY`, `SESSION_SECRET` | Validação de JWT (RS256 + fallback HS256) |
| `INTERNAL_API_KEY` | Segredo injetado em todo proxy para os serviços (comparado em tempo constante nos serviços) |
| `REDIS_HOST` / `PORT` / `PASSWORD` | Liveness de sessão |
| `AUTH_SERVICE_URL`, `PROJECT_SERVICE_URL`, `SPRINT_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `FILE_SERVICE_URL` | Destinos do proxy |
| `ALLOWED_ORIGINS` | CORS allow-list (⚠️ ausente do `.env.example` raiz) |
| `MCP_GATEWAY_KEY`, `MCP_RESOURCE_URL` | Token OAuth só é aceito com a chave interna do mcp-server e com a audiência do MCP (1.36.0) |
| `PORT` | 4000 — porta interna (app e mcp-server) |
| `PUBLIC_PORT` | 4080 — porta pública, usada pelo Traefik; `/auth/*` só com `GET /auth/me`, `/auth/my-tenants` e `/auth/all-users` (ADR-059) |
| `GATEWAY_TRUST_PROXY` | Opcional. Proxies confiáveis para obter o IP do cliente (padrão `loopback, uniquelocal`) |

### Demais serviços (auth/project/sprint/notification/file-service)

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Connection string do PostgreSQL (compartilhada) |
| `INTERNAL_API_KEY` | Valida requisições vindas do gateway |
| `REDIS_HOST` / `PORT` / `PASSWORD` | App/auth-service usam sessões/limites; fila usa REDIS_QUEUE_HOST; gateway/cache usa REDIS_CACHE_HOST |
| `MINIO_*` | Apenas `file-service` |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Apenas `auth-service` (emissão) |
| `PORT` | 4001–4005 conforme o serviço |

### Observabilidade (produção)

`BASE_DOMAIN`, `GRAFANA_PASSWORD` — usados só por `docker-compose.production.yml` (Prometheus + Loki + Grafana).

**Comandos úteis:**

```bash
pnpm dev                          # servidor de desenvolvimento (monolito)
pnpm build                        # build de produção
npx prisma migrate dev            # aplicar migrações do monolito (dev)
npx prisma generate               # regenerar cliente Prisma
npx prisma studio                 # GUI do banco

# Rodar um microsserviço isoladamente (workspace pnpm real)
pnpm --dir auth-service start:dev
pnpm --dir project-service start:dev

# Deploy manual (staging)
IMAGE_TAG=staging docker compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env up -d

# Migrations manual (staging) — cobre monolito + sprint-service + file-service apenas
IMAGE_TAG=staging docker compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env --profile migration run --rm migrate
IMAGE_TAG=staging docker compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env --profile migration run --rm migrate-sprint-service
IMAGE_TAG=staging docker compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env --profile migration run --rm migrate-file-service
```

---

## Roadmap de Migração (Strangler Fig)

### Fase 0 — Infraestrutura VPS (concluída)

Objetivo: sair do Vercel/Neon e hospedar tudo em VPS Hostinger com Docker.

**O que foi feito:**

1. **Dockerização do monolito** — `Dockerfile` multi-stage (base → deps → builder → runner) usando Node 22 Alpine + pnpm via corepack. Output `standalone` do Next.js.
2. **Docker Compose** — `docker-compose.yml` (base) + overrides `docker-compose.staging.yml` e `docker-compose.production.yml`.
3. **Traefik como reverse proxy** — TLS automático via Let's Encrypt (ACME), HTTP→HTTPS redirect, roteamento por `Host()`.
4. **Dois ambientes isolados** — staging e produção com `COMPOSE_PROJECT_NAME` distintos, bancos separados, buckets MinIO separados, chaves JWT separadas.
5. **Migração de storage** — `@aws-sdk/client-s3` apontando para MinIO no lugar de `@vercel/blob`.
6. **JWT HS256 → RS256** — com fallback HS256 para sessões antigas.
7. **CI/CD via GitHub Actions** — `develop` → staging automático, `main` → produção automático.
8. **Fix middleware** — `proxy.ts` usa `http://localhost:${PORT}/api/me` para evitar erro de TLS via Traefik.
9. **Prisma 7** — schema sem `url` no datasource (movido para `prisma.config.ts`).

### Fase 1 — Notification Service (concluída)

Primeiro microsserviço extraído (Strangler Fig): zero dependências inbound, CRUD puro, bounded context perfeito. NestJS 11 + Prisma 7 + BullMQ worker, feature flag `NOTIFICATION_SERVICE_URL`.

### Fase 2 — Auth Service + File Service + API Gateway (concluída)

Centralização de autenticação, uploads e criação do ponto de entrada único da API:

1. **`auth-service`** (NestJS :4001) — autenticação centralizada, Redis session store.
2. **`api-gateway`** (Express :4000) — proxy + autenticação JWT, rate limiting, CORS.
3. **`file-service`** (NestJS :4005) — uploads via MinIO.

### Fase 3 — Project Service + Sprint Service (concluída, não estava documentada)

Extração do restante do domínio de negócio principal:

1. **`project-service`** (NestJS :4002) — projetos, departamentos, RBAC (roles/permissions), stakeholders. Owner canônico de `Project`, `Department`, `Role`/`Permission`, `Stakeholder`.
2. **`sprint-service`** (NestJS :4003) — sprints, board Kanban completo (cards, colunas, tags, comentários), time tracking, dashboard de métricas de sprint, log de auditoria (`AuditLog`).
3. **Gateway atualizado** — rotas `/projects`, `/departments`, `/roles`, `/permissions`, `/stakeholders` → project-service; `/sprints`, `/cards`, `/tags`, `/time-entries`, `/audit` → sprint-service.
4. **`lib/api-client.ts`** — cliente HTTP unificado no monolito, substituindo o padrão anterior de múltiplos feature-flags por serviço (`AUTH_SERVICE_URL` direto etc.) para a maior parte das actions.
5. **CI/CD** — pipelines agora buildam, escaneiam (Trivy) e publicam 7 imagens: `app`, `api-gateway`, `auth-service`, `project-service`, `sprint-service`, `notification-service`, `file-service`.

**Lacunas conhecidas desta fase:** `auth-service`, `project-service` e `notification-service` não têm profile de migração automatizado no Compose (só `sprint-service` e `file-service` têm); clientes diretos legados de projetos/sprints foram retirados na SDD 9.7 após inventário; a tabela `Attachment` ainda existe duplicada no schema do `sprint-service`.

### Fase 4 — Funcionalidades novas construídas direto no monolito (em andamento / não extraídas)

Em paralelo à extração de microsserviços, funcionalidades novas de maior superfície (EAP/WBS, Atas, Cadastros por projeto, Stakeholders) foram construídas **direto no monolito**, sem passar pelo gateway — ver [Migração incompleta](#migração-incompleta--o-que-ainda-é-monolito). Não há ainda um plano formal de extração para essas features; `project-service` seria o candidato natural para absorver Cadastros/Stakeholders/macro-fases, e um futuro `document-service` ou extensão do `project-service` para EAP/WBS/Atas.

---

## Decisões de Arquitetura Notáveis

O detalhamento e a evolução das decisões ficam em [docs/decisions.md](decisions.md). A lista abaixo preserva o resumo existente; seus itens ainda sem registro detalhado devem ser documentados quando forem revisados, sem presumir justificativas históricas.

1. **API Gateway como ponto único de entrada externo** — `api-gateway` é o único serviço de backend exposto via Traefik além do próprio Next.js; os 5 microsserviços de domínio ficam só na rede interna do Docker.
2. **Confiança via headers + segredo compartilhado, não revalidação de JWT** — os serviços internos confiam em `x-user-id`/`x-tenant-id`/`x-user-role` injetados pelo gateway, protegidos por `INTERNAL_API_KEY` e isolamento de rede — não por revalidação criptográfica do token em cada serviço. Trade-off de simplicidade/performance sobre defesa em profundidade.
3. **Banco compartilhado, não database-per-service** — todos os microsserviços apontam para o mesmo Postgres com schemas Prisma parciais e sobrepostos (read-models locais de `Tenant`/`User`/`Project`/`Attachment`) em vez de bancos isolados — reduz a complexidade operacional às custas de acoplamento de schema entre serviços.
4. **Server Actions sobre API REST no cliente** — elimina camada extra. O componente chama funções TypeScript que rodam no servidor e, por baixo, fazem fetch ao gateway (ou, no caminho legado, Prisma direto).
5. **Services finas nas actions (padrão extraído) / services grossas (padrão legado)** — actions que já foram extraídas fazem `verifySession` + Zod + `lib/api-client` + `revalidatePath`; actions ainda não extraídas (WBS/EAP/Atas/Cadastros) mantêm lógica de negócio em `services/*.ts` com Prisma direto.
6. **UsuarioProjeto como entidade central** — dados que variam por projeto (cargo, departamento, valorHora, active) ficam em `UsuarioProjeto`, não em `User`.
7. **Multi-tenant ativo, não só suportado** — usuários trocam de workspace em tempo real (`/admin/tenants`, `switch-tenant`), diferente da versão anterior deste doc onde o multi-tenant era apenas estrutural.
8. **forcePasswordChange sem loop** — a action de `/alterar-senha` lê o cookie diretamente (sem chamar `verifySession`) para evitar redirect loop.
9. **Drag-and-drop otimista** — `useReducer` com `kanbanReducer` atualiza o estado local imediatamente; a Server Action persiste em background.
10. **Prisma com adapter `pg`** — Next.js 16 exige o adapter explícito `@prisma/adapter-pg` para compatibilidade com o runtime.
11. **`tokenVersion` para invalidação** — incrementar esse campo invalida todas as sessões ativas do usuário sem lista negra de tokens; complementado por verificação de sessão e usuário persistido no auth-service a cada requisição JWT em produção.
12. **Falha fechada de autenticação** — gateway e BFF exigem prova atual do auth-service em produção; Redis indisponível retorna 503, sem aceitar apenas a assinatura.


## Permissões configuráveis — fase 5 em andamento (30/09/2026)

O núcleo implementado lê `Permission`/`RolePermission` e resolve o acesso em `services/authz.ts`, usando o catálogo puro de `lib/permissoes.ts`. A migration do app adiciona `Role.permissoesDefinidasEm` e `UserPermission` (usuário, permissão, efeito GRANT/DENY e projeto opcional), com unicidade dos ajustes globais por índice parcial.

A ordem é: admin recebe tudo; não membro ativo recebe nada; membro recebe a união da função-base e dos cargos de `UserProject.role` normalizados por `funcaoKey`, além do papel de `UserProjectRole`; ajustes globais são aplicados antes dos ajustes do projeto. A matriz explicitamente vazia se distingue de configuração ausente. Tech Lead e PO não têm privilégios adicionais por padrão.

`app/actions/permissoes.ts` autentica e restringe a configuração ao admin, valida os dados e registra auditoria. `services/permissoesService.ts` confere o tenant dos alvos; tanto leitura quanto escrita de ajustes conferem o projeto. `components/permissoes/PermissoesFuncoes.tsx` atende Cadastros → Funções; `PermissoesUsuario.tsx` atende Usuários (global) e Stakeholders (projeto). A UI só confirma ajuste após resposta de sucesso e preserva escolhas da matriz em falhas.

**Consumidores implementados (03/10/2026, SDD 5.1):** `services/projectAccess.ts` protege as leituras das páginas/metadata e as actions diretas no Prisma; autorização de equipe/cadastros/documentos usa o catálogo. `ProjectPermissionsProvider` recebe permissões resolvidas no servidor e controla navegação e edição/movimento/exclusão no quadro. Atribuir cargos e papel de gerente (fontes de privilégios) e editar o catálogo global permanecem operações administrativas; `cadastros:gerenciar` autorizava as associações de funções/departamentos ao projeto, removidas na 1.20.0 (ADR-040): todo o catálogo vale em qualquer projeto, as páginas `/projetos/:id/funcoes` e `/departamentos` redirecionam para Stakeholders e excluir item do catálogo limpa associações antigas.

O gateway, após autenticação e limites de requisição, executa `authorizationMiddleware`: envia identidade, método, caminho e JSON para `POST /api/internal/authorize`, protegido por `INTERNAL_API_KEY` (comparação constante). O app confere usuário ativo no tenant, lê seu papel no banco e executa `services/apiAuthorization.ts`. Não há cache de concessões no gateway: cada operação reavalia acesso. Negação retorna 403; falha de infraestrutura/timeout (10 s) retorna 503 e não encaminha a operação. O parse de JSON é limitado a 2 MB e `fixRequestBody` repõe o corpo no proxy; uploads multipart continuam usando o stream original. PATs/MCP passam pelo mesmo controle, além dos escopos do token.

Listagens de projetos/sprints e busca de cards recebem `x-authorized-projects`, definido apenas pelo gateway; `-` representa escopo vazio. Services aplicam esse filtro tanto na consulta quanto no total paginado. Leitura de um projeto pode receber `x-redact-project-documents` para omitir os textos de charter sem `documentos:ver`; listagens de projetos sempre omitem esses textos. Ambos os headers recebidos do cliente são removidos antes da autorização. Rotas individuais resolvem o projeto persistido da sprint/card/anexo, validam origem e destino de movimentos e exigem `projeto:ver` mais a permissão específica. Encerrar o próprio timer ainda exige leitura do projeto, mas não exige edição de cards.

`AUTHORIZATION_SERVICE_URL` é configuração do gateway: Compose usa `http://app:3000`, desenvolvimento local usa `http://localhost:3000`. Isso adiciona dependência síncrona do gateway no app para operações de domínio. Serviços privados continuam protegidos pela chave interna e rede Docker; chamadas entre serviços não passam por concessões de um usuário externo.

### Revisões documentais (SDD 5.2, 04/10/2026)

`services/documentRevisionService.ts` centraliza rascunhos, submissão, publicação, revisão e exclusão. As rotas existentes de versões do Termo/Partes Interessadas são adaptadores desse fluxo; `/api/projects/:projetoId/revisions` atende tipos `CHARTER`, `STAKEHOLDER`, `EAP` e `ATA`, histórico/Registro, rascunho privado, submissão, revisão e exclusão de versões não aprovadas. Todas exigem leitura do projeto e a permissão documental da operação. O corpo não decide autoria, status ou aprovador: esses valores vêm da sessão/resolvedor. Os padrões de membro concedem leitura/edição; o papel de gerente concede aprovação, respeitando os ajustes de 5.1.

Com `documentos:editar`, salvar cria um snapshot `PENDING`. Quem também tem `documentos:aprovar` publica sua própria submissão imediatamente. Aprovar uma pendente publica o snapshot; rejeitar preserva o vigente. Submissão/publicação/revisão/exclusão são serializadas com `FOR UPDATE` na linha do projeto ativo do tenant. A gravação de conteúdo/status e `registrarAcao` usam a mesma transação; falha da auditoria desfaz a operação. Vigência é a aprovação mais recente, com `sequence` como desempate estável. Conteúdo de versões não é editado após submissão; versões aprovadas são preservadas. A exclusão de uma ata cancela suas propostas pendentes sob o mesmo bloqueio.

Termo aprovado também atualiza seus campos em `Project`, evitando leitura divergente pela API/MCP. Macrofases e principais envolvidos do Termo são conteúdo do snapshot documental e não alteram a WBS/planilha. Partes Interessadas congela cabeçalho/lista documental e não altera o cadastro global da equipe. EAP aprovada atualiza `EapDocument` com nós validados e códigos derivados pelo servidor. Atas novas só são materializadas/recebem número ao aprovar; alterações também preservam a ata publicada até aprovação. Participantes com IDs devem continuar ativos no projeto/tenant.

`DocumentDraft` tem chave `(projectId, userId, documentType, resourceId)` e FKs com cascata. A UI do Termo recupera exclusivamente o rascunho do próprio autor; leitores recebem apenas o conteúdo vigente. Dados legados continuam como fallback até a primeira versão aprovada com payload; registros antigos sem snapshot permanecem no histórico, mas não são aprováveis. O cadastro de projeto orienta edições documentais para o Termo. A API genérica mantém a autorização anterior para projetos legados; após existir um snapshot aprovado, recusa sobrescritas de campos do Termo para preservar o fluxo versionado.

Migration: `20261004000000_document_revisions` adiciona tipos EAP/ATA, `payload`, `resourceId`, sequência/indexação e rascunhos. O check `Document Revisions` aplica migrations num PostgreSQL 17 isolado e testa o serviço/resolvedor reais, inclusive rollback e concorrência; não executa migrations em produção. Ver ADR-014 e [SDD](specs/SDD-backlog-operum-2026-09.md).

### Edição da planilha por campo e responsável (01/10/2026)

O item 5.3 foi integrado na PR #37 e seus testes de campo/responsável foram reconferidos com 5.2. Página e exportação conferem `projeto:ver` e `planilha:ver`. A interface recebe separadamente `planilha:orcado`, `planilha:realizado-proprio` e `planilha:realizado-todos`; o realizado próprio depende de `WbsNode.properties.elaboradoPorUserId`, sem comparação por nome.

A Server Action resolve as permissões e passa o contexto obrigatório a `services/wbsService.updateNodeProperties`. Na transação, o serviço bloqueia o nó pelo ID/projeto/tenant com `FOR UPDATE`, lê as propriedades persistidas e chama `validarCamposCustos`. Campos de realizado exigem permissão de todos ou de próprio com ID correspondente; campos de orçamento/responsável exigem `planilha:orcado`; outros metadados exigem `projeto:editar`. A edição e a auditoria `PLANILHA_EDITAR` são atômicas. Importação, substituição da árvore e exclusão exigem permissões de edição de projeto, orçado e realizado de todos. Não há nova tabela ou serviço para este item. Ver [ADR-009](decisions.md#adr-009--validar-custos-pelo-responsável-persistido-na-transação).

### Patch temporário de segurança em globs

`braces@3.0.3`, dependência transitiva do lint e do gateway, recebe patch de profundidade em `parse`, `compile`, `expand` e `stringify`. Strings e ASTs com aninhamento excessivo são rejeitadas com `SyntaxError`, antes de esgotar a pilha. A raiz e a instalação isolada do gateway registram o mesmo patch e seu hash no lockfile; os Dockerfiles copiam `patches/` antes da instalação congelada. O audit ignora apenas GHSA-vfj7-8cjw-p6xm porque o registro npm continua identificando a versão original, sem reconhecer o patch local. Testes verificam o código efetivamente carregado pelo lint e pelo proxy, casos maliciosos e globs comuns. Esta mitigação precisa ser substituída por versão oficial corrigida assim que publicada; ver ADR-011. Para Trivy, somente o gateway usa `.trivyignore-gateway.yaml`: CVE-2026-93687 é filtrado exclusivamente no caminho que contém o hash do patch, até 03/11/2026. Antes do scan, o código carregado na imagem final deve passar no teste de parsing/AST/globs de `api-gateway/scripts/verify-braces-patch.cjs`. O workflow `gateway-image-security.yml` constrói a imagem local e repete teste/scan nas PRs para main/develop, sem push/deploy. Um teste com Trivy real verifica que cópias sem patch e com hash diferente continuam bloqueadas pelo mesmo filtro. Staging e produção executam o mesmo teste na imagem referenciada por SHA antes do scan. Outras cópias do pacote e outros CVEs não recebem essa exceção; ver ADR-013.

### URLs de avatar/logo no navegador

`safeAvatarUrl` aceita somente URL http(s) absoluta ou caminho iniciado por uma única barra, rejeitando HTML, caracteres de controle, esquemas executáveis e barras invertidas. A URL de saída codifica metacaracteres sem alterar parâmetros ou escapes existentes das URLs assinadas. `UserAvatar` aplica a validação antes de renderizar `src`; valor inválido usa iniciais. `AvatarUpload` usa a mesma validação para a opção Visualizar e abre a imagem com `noopener,noreferrer`. Isso complementa a validação antes da persistência e protege dados históricos e estado do formulário; ver ADR-012.


### Integridade da exclusão de sprint (SDD 9.1)

O sprint-service mantém a responsabilidade pela transferência ao backlog. `SprintService.remove` lê sprint/cards do tenant, verifica a coerência com o projeto, atribui posições ao final do backlog e só então marca a sprint excluída, dentro da mesma transação PostgreSQL Serializable. A ordem transferida segue coluna, posição na coluna, posição geral, criação e ID como desempate. Um card ativo sem projeto direto herda o projeto da sprint; vínculo divergente aborta com 409. Nenhuma referência de comentário ou tempo é removida. Cards já excluídos não são transferidos. Conflitos de serialização P2034 são repetidos no máximo duas vezes; esgotamento devolve 409 para retry pelo cliente. Repetição de uma exclusão concluída devolve 404 sem reordenar o backlog.

O check `Sprint Integrity` usa PostgreSQL 17 dedicado e testa o serviço real com rollback injetado e concorrência, além de compilar o pacote. Esta garantia cobre a operação de exclusão; criação/movimentação de cards e outras mutações ainda têm as pendências de atomicidade do SDD 9.3. Não há migration nem reparo histórico automático. Diagnósticos históricos devem ser somente leitura: cards sem `projectId` e sem `sprintId` não oferecem evidência suficiente para inferir o projeto; links divergentes precisam ser revisados pelo operador antes de qualquer correção autorizada.


### Histórico e exclusão de sprints

`services/sprintHistoricoService.ts` grava criação, alteração e exclusão de sprint na auditoria (`AuditLog`, entity `Sprint`, `details` com `projectId`, `nome`, `origem` quadro/eap, `alteracoes` de → para, `motivo` e `resumo` de cards/horas). As actions de sprint (`app/actions/sprints.ts`, `updateSprintMetaAction`) e a sincronização EAP ↔ sprint chamam esse serviço; a página Sprints do projeto mostra o histórico (`HistoricoSprints`). Sprint com dados (cards abertos ou horas registradas) só é excluída com motivo (mín. 5 caracteres): `deleteSprintAction` recusa sem motivo, e na EAP o diálogo de exclusão pede o motivo e o envia no autosave (`saveTree`/`deleteNode` recusam sem ele). O autosave também envia os vínculos de itens recortados ainda não colados, que não são excluídos. Ver ADR-039.

### Leitura do timer no quadro

O cliente executa Server Actions uma de cada vez. `useCardTimer` agrupa num microtask as leituras dos cards montados juntos e chama `getCardsTimerAction` (`app/actions/time.ts`) uma vez por lote (até 200 cards); a action lê total e timer ativo de cada card no sprint-service em paralelo (8 por vez) e isola o erro de cada card.

### Integridade do timer (SDD 9.2)

O fluxo de timer do app e MCP usa o sprint-service via gateway. O banco compartilhado impõe `TimeEntry_one_running_per_user`, índice único parcial de `userId` onde `isRunning=true` e `deletedAt IS NULL`. A migration fica no app, responsável pelas migrations desse schema no deploy existente; os schemas Prisma registram a restrição em comentário, pois o índice parcial é definido diretamente em SQL. Registros manuais/parados/excluídos não entram na unicidade. O módulo local legado `services/timeService.ts` permanece para consolidação futura do SDD 9.7; não é o caminho utilizado pelas actions de timer ou pelas ferramentas MCP.

Start valida card e usuário do tenant. Timer já ativo e colisão concorrente do índice retornam 409; falhas de outros índices/escritas não são mascaradas. Stop usa atualização condicional por proprietário, tenant, card, estado ativo e exclusão. Só uma chamada grava a parada; as demais retornam a linha persistida sem recalcular/somar tempo ou mudar updatedAt. Entradas manuais já encerradas também são preservadas. Ausência, exclusão ou outro proprietário/tenant retornam 404. Não depende de mutex em memória nem de transação mantida através de HTTP.

Antes de criar o índice, a migration bloqueia escritas e verifica duplicados ativos; aborta com rollback sem corrigir históricos automaticamente. O procedimento de diagnóstico/revisão, janela de criação do índice e recuperação de migration falha está em `docs/operations/timer-integrity.md`. O check Sprint Integrity valida start/stop concorrentes e o aborto seguro em PostgreSQL real. Sem operação no banco de produção nesta entrega.


### Movimentação atômica de cards (SDD 9.3)

`CardService.update` no sprint-service executa leitura do card, validação de projeto/sprint/coluna/autor, atualização, renumeração dos dois grupos e criação de CardMovement em uma única transação Serializable. As consultas e updates utilizam o cliente da transação, sem transações aninhadas. Conflitos P2034 ou estruturados do adapter PostgreSQL (serialização/deadlock) repetem a operação inteira no máximo duas vezes, relendo a origem; esgotamento retorna 409 com orientação de retry. O retorno é lido após normalização e reflete a posição persistida.

Grupos são coluna (sprintPosition), cards sem coluna de uma sprint (position) ou backlog de projeto (position). Ordenação desempata por createdAt e ID; posição pedida é limitada a 0..n, posição omitida em troca de grupo insere ao final. Origem é compactada quando o grupo muda. Retorno ao backlog limpa sprint/coluna/sprintPosition e preserva projeto, comentários e tempos; troca de sprint herda o projeto de destino quando não informado e recusa incoerência explícita. Histórico é criado ao trocar de grupo, com origem/destino e autor validados; reordenação dentro do mesmo grupo e retry sem mudança não criam histórico duplicado. Fonte/destino sem coluna recebem nomes da sprint ou Backlog no texto do histórico.

As movimentações concorrentes são equivalentes a uma ordem serial de execução, sem preferência garantida entre pedidos simultâneos; dentro de cada estado persistido, posições são contínuas e desempates estáveis. A exclusão de sprint 9.1 já usa Serializable. Criação de cards, exclusão de card/coluna e alterações de configuração da sprint continuam caminhos próprios; esta entrega não afirma coordenação integral dessas outras operações com movimentações. Não há migration ou reparo histórico automático. Sprint Integrity valida rollback após cada etapa e concorrência em PostgreSQL real.


### Substituição de macrofases e reconciliação EAP (SDD 9.4)

O project-service é responsável por validar e persistir o lote desejado em `ProjectMacroFase`, ordenado por `position`. Criação/atualização de projeto aceita `macroFases` opcional no mesmo POST/PATCH; o POST `/projects/:id/macro-fases` continua disponível. Todos substituem o lote e incrementam `Project.macroFasesRevision` na mesma transação Serializable, com duas novas tentativas para conflitos estruturados Prisma/PostgreSQL e 409 ao esgotar. Lote inválido retorna 400 antes de mutar; ausência do campo não limpa fases. Replay de um lote equivalente mantém IDs e revisão. O gateway exige projeto:editar e as permissões de custo também no PATCH composto.

A EAP operacional continua canônica em `WbsNode`, gerida pelo app. `ProjectMacroFase` guarda a intenção do último lote enviado pelo formulário e o fallback legado, não um espelho permanentemente atualizado de toda edição da EAP. A revisão desejada maior que `macroFasesSyncedRevision` é uma pendência durável, inclusive se o processo parar depois da resposta HTTP e antes da sincronização. O app lê o último lote confirmado, sincroniza nós/códigos/versão/auditoria e atualiza a revisão aplicada em uma única transação Serializable. Não mantém transação aberta através de HTTP. Falha deixa a revisão pendente; diagnóstico genérico fica em `macroFasesSyncError`, quando possível. A diferença de revisões é suficiente para detectar interrupção sem diagnóstico.

Enquanto há pendência, o formulário exibe o lote salvo e um aviso com retry autorizado no servidor; assim não oculta a intenção com a árvore antiga. Retry lê novamente a revisão atual e não recebe o lote do cliente. Depois da reconciliação, as leituras do formulário voltam à EAP. Não existe worker automático nesta entrega: recuperação é explícita pelo botão no formulário. Retry de revisão já aplicada não modifica versão, auditoria ou EAP.

A sincronização preserva nós/atividades existentes, estilo e propriedades não relacionadas, associando macrofases pelo título normalizado. Fases ausentes do lote não são apagadas da EAP: substituição integral refere-se a `ProjectMacroFase`; remover/renomear subárvores continua sendo uma operação própria da EAP. Nomes duplicados no lote ou na EAP impedem sincronização ambígua. Novos nós recebem ordem livre, códigos recalculados e auditoria no mesmo commit. Não há reset destrutivo para criar a raiz.

Migration `20261004020000_macro_fases_reconciliation` adiciona revisões, diagnóstico e posição; ordenação legada recebe posições por criação/ID, sem apagar lotes ou reprocessá-los automaticamente (revisões iniciais zero). A migration deve preceder as novas imagens de app/project-service no deploy autorizado. O check Macro Phases Integrity usa banco PostgreSQL 17 isolado para rollback, retries, concorrência e permissões. Nenhuma operação de produção nesta PR.


### Dashboards do usuário e da sprint (SDD 9.5)

O fluxo implementado é Server Action (`app/actions/dashboard.ts`) → cliente HTTP (`lib/api-client.ts`) → gateway → `DashboardController`/`DashboardService` no sprint-service. GET `/dashboard/global` e GET `/sprints/:id/dashboard` são endpoints agregados; `/sprints/:id/metrics` e `/feedback` mantêm seus contratos existentes de registros. A action de resumo de sprints usa `sprintMetrics` do agregado global, sem tratar uma lista de DashboardMetric como objeto agregado. Dashboard administrativo continua fluxo próprio; esta entrega corrige as duas telas de usuário/sprint.

O gateway aplica autenticação e autorização ao novo prefixo `/dashboard` e encaminha ao sprint-service. Global recebe a interseção de projetos com projeto:ver, quadro:ver e planilha:ver; conjunto vazio significa nenhum resultado, nunca todos os projetos. Dashboard de sprint exige as mesmas leituras para o projeto de destino. Cabeçalho x-authorized-projects enviado pelo cliente é removido e reconstruído pela autorização; tenant vem da identidade verificada. Sprint-service repete o filtro de tenant/projeto não excluído; sprint estrangeira ou excluída não é agregada. A factory `createGatewayApp` é usada tanto pelo bootstrap normal quanto pelo teste HTTP, evitando reproduzir rotas artificiais no teste.

Agregação lê sprints, cards, tempos, membros e feedbacks em snapshot RepeatableRead. Desconsidera soft deletes, sprints/projetos excluídos, usuários de outro tenant e cards com vínculos diretos de projeto inconsistentes com a sprint ou coluna vinculada a outra sprint. Global inclui backlog autorizado; sprint inclui só seus cards. Horas usam duration persistido em segundos, sem inferir tempo em curso; custo segue a fórmula existente, horas × User.hourlyRate atual (não taxa histórica nem override UserProject). Conclusão mantém a convenção existente de título de coluna contendo “conclu”; atraso considera prazo anterior à leitura e card não concluído. Colunas ativas são ordenadas por posição/ID, atrasados por prazo/ID e limitados a 50 após filtrar concluídos. Ranking desempata por nome/ID; feedbacks válidos produzem médias, ausentes retornam null. Membros ativos podem aparecer com métricas zero.

Schemas Zod canônicos e tipos inferidos estão em `sprint-service/src/dashboard/dashboard-contract.ts`, módulo puro compartilhado com o cliente Next. Resposta usa datas ISO/null e arrays obrigatórios; serviço valida antes de retornar e cliente valida após HTTP. Payload inválido gera erro explícito, sem cast ou preenchimento artificial com zeros. Caso vazio válido renderiza KPIs zero e listas vazias. O schema mínimo do sprint-service passa a espelhar campos já existentes de usuário/projeto e UserProject; não altera o schema físico nem requer migration.

O workflow Dashboard Contracts valida action/cliente, gateway/auth JWT, endpoint interno de autorização/resolvedor, guard/controller reais e banco PostgreSQL 17 isolado. Mocks limitam-se ao transporte de cookie/DAL do Next e à construção de cliente Prisma independente por processo; autenticação/autorização e consultas de domínio são reais. Também cobre schemas e renderização vazia nas duas telas. Não há operação em produção.

### Confirmação e recuperação na interface (SDD 10)

O Kanban aplica alterações locais após confirmar as actions do gateway. Falhas
ficam associadas ao recurso e oferecem retry; operações independentes não
restauram snapshots inteiros do quadro. O modal usa resultado assíncrono explícito,
bloqueia envio duplo e mantém campos/anexos na falha. Criação confirmada é lembrada
na sessão do formulário: retries continuam no mesmo card e reenviam somente os
responsáveis/arquivos ainda não confirmados. Fechar encerra essa sessão de retry;
o card já persistido permanece no quadro.

`useCardTimer` compartilha um store em memória por card entre minicard e modal.
Leitura/start/stop são serializados por card, com timeout de 15 segundos por etapa.
Parada só descarta a entrada após confirmação. Falhas reconciliam pelas rotas
existentes; sem confirmação, a UI mostra estado desconhecido e atualização manual.
Não é sincronização por push entre abas ou usuários. O sprint-service e o índice
único continuam sendo a autoridade dos timers.

`useAutosave` serializa gravações, drena o valor mais recente e devolve confirmação
em `flush`. Reset invalida conclusões de requests do registro anterior. O Termo
aguarda flush antes de enviar uma versão e não envia POST se o PATCH falhar.
Pendências geram feedback, retry, proteção de navegação por links e beforeunload.
Rascunhos persistidos continuam privados no servidor. Uma cópia adicional de
alterações não confirmadas usa `sessionStorage`, na mesma aba, com chave do usuário
confirmado por `/api/me` e do projeto (IDs globais). Só é lida após permissão de
edição e recuperação do rascunho servidor; restauração é explícita. Expira após
24 horas e é removida no salvamento confirmado/descarte. Não substitui autorização
ou armazenamento servidor; se o storage estiver indisponível, o feedback e o aviso
de saída permanecem. Não se promete recuperação ao encerrar definitivamente a aba.

`useOverlay` mantém a pilha de Modal, Drawer, formulário/lightbox de card e menu
móvel. Só o superior recebe Escape/Tab; regiões externas ficam inert. O lock de
scroll é compartilhado e o foco retorna ao acionador quando ele ainda existir.
Títulos usam IDs por instância. Sidebar recolhida é inert/aria-hidden, e a expansão
retorna foco ao controle previsível. Abaixo de 768 px a navegação abre sobreposta;
em desktop mantém o layout lateral. Navegação documental empilha abaixo de 1024 px,
formulário do Termo ajusta largura e a prévia A4 tem região de rolagem própria.

Revisão de consistência da fase: sem alteração dos contratos HTTP, schema,
permissões ou propriedade de domínios da fase 9. O workflow UI Reliability adiciona
lint/tipos/suíte raiz em PRs; checks de banco e segurança permanecem. Evidências e
limites da reprodução visual: [validação SDD 10](validation/sdd-10/README.md).

### Validade de sessão (SDD 11.1)

Em produção, a assinatura JWT no gateway é seguida de `/auth/verify` no
serviço de autenticação, com timeout de 3 segundos e sem cache de validade.
Esse serviço exige JTI/sessão, usuário ativo, tenant ativo e tokenVersion atual.
O papel usado vem do usuário persistido. Ausência/revogação retorna 401;
indisponibilidade retorna 503. Login e logout exigem confirmação da escrita ou
remoção da sessão Redis, com operações limitadas a 2 segundos. Após logout
malsucedido, o cliente deve tentar novamente quando o Redis retornar.

### Redis por responsabilidade (SDD 11.2)

`redis-session` guarda sessões/limites, com AOF e noeviction (256 MiB).
`redis` preserva o host/volume original do BullMQ, AOF everysec/noeviction (512 MiB).
`redis-cache` guarda introspecções PAT de até 60 segundos, sem persistência,
allkeys-lru (128 MiB). Auth invalida esse cache na revogação. Eviction do cache
não alcança sessões ou jobs; lotação das instâncias duráveis rejeita escritas,
que devem ser tratadas como falhas, não sucesso. AOF everysec admite perda de
até um segundo sob falha abrupta. O destino da fila é preservado, evitando perda de jobs pendentes na transição.
A nova instância de sessões começa vazia: usuários devem fazer login novamente;
chaves de sessão antigas no Redis original expiram pelo TTL e não autenticam. Configuração não foi aplicada
à VPS nesta entrega.

### Releases e recuperação (SDD 11.3–11.6)

O build publica imagens por SHA, valida audit/tests/smoke/Trivy de todos os
pacotes e só então gera `release.env` com oito digests. O deploy usa esse
manifesto em Compose; `migrate` recebe o mesmo APP_IMAGE do app. Não promove
`:prod`: runtime depende dos digests aprovados. Manifestos/configuração anteriores
ficam em `.releases/<SHA>.<tentativa>`; cada execução recebe um diretório
exclusivo, inclusive retries do mesmo SHA. Registros legados `.releases/<SHA>`
são preservados. `.current-release` mantém o SHA e `.current-release-record`
identifica a tentativa concluída, publicada somente após readiness. Rollback
consulta esse registro e recupera o ponteiro anterior; na ausência dele, usa o
formato legado. Tentativas falhas ficam disponíveis para diagnóstico e não
bloqueiam retries. flock impede execuções concorrentes. A substituição de assets de observabilidade
prepara uma cópia pertencente ao usuário de deploy; arquiva a pasta anterior
como `.observability-archived.<tentativa>` no mesmo diretório pai, sem apagar
arquivos antigos ou alterar suas permissões. O registro da tentativa guarda o
caminho da pasta arquivada. A nova cópia mantém modos de grupo/outros e ganha escrita
somente para o proprietário; `private` continua 0700. Prometheus, Grafana,
Alloy, proxy de logs e Alertmanager são recriados para usar os novos inodes
dos bind mounts, tanto no deploy quanto no rollback. Falha de pull,
configuração ou migration restaura configuração e aborta. Falha de readiness
permite retornar aos digests anteriores somente quando ROLLBACK_COMPATIBLE=true
foi declarado para a release. O padrão é false; expand/contract preserva schema
e dados, sem migration down automática. O ambiente real não foi alterado.

Checks por pacote executam instalação frozen, testes existentes, build, audit,
imagem final, smoke com dependências isoladas e Trivy. Notification-service
não possui testes existentes; build/smoke continuam obrigatórios. Operações têm
check próprio de pressão Redis, simulação de release e restore sintético.
O workspace raiz e as sete instalações isoladas mantêm overrides e lockfiles
próprios; correções de dependências precisam alcançar ambos os contextos, pois
as imagens dos serviços são construídas a partir de seus diretórios. A versão
1.33.1 fixa `follow-redirects` 1.16.1 e Vite 8.3.3 nos dois contextos para
eliminar as versões vulneráveis, dentro das majors usadas pelos consumidores.
As auditorias e exceções existentes permanecem ativas e sem novas supressões.
A 1.36.2 adiciona o override `zod: ">=4.6.6 <5.0.0"` (GHSA-mrhx-c7xc-m3w5) na
raiz e nos seis serviços que usam zod; o api-gateway não depende dele.
A 1.38.1 sobe `multer` para `>=2.5.0` (GHSA-q7qp-rjg7-q26m) e `undici` para
`>=7.30.1 <8.0.0` (GHSA-xjj6-f33q-929c) e fixa `body-parser` em `>=1.20.9 <2.0.0`
ou `>=2.4.0 <3.0.0` conforme a major (GHSA-27r3-jxmh-p828), na raiz e nos sete
serviços.
Backups propostos são descritos em `docs/operations/backups.md`; o operador não
soube confirmar a rotina atual e a VPS não foi inspecionada nesta entrega.

### Prontidão e observabilidade (SDD 11.7–11.8)

Liveness (`/health`, app `/api/health`) depende só do processo. Readiness acrescenta
`/ready`, com SELECT 1 e/ou ping Redis/MinIO/serviços essenciais e prazos de
1,5–3 segundos. Respostas são genéricas 200/503; Compose aguarda readiness, mas
Docker não reinicia um processo apenas por health unhealthy. Queda externa não
provoca restart em cascata. Readiness não comprova a existência de todas as
migrations; isso continua responsabilidade do deploy/entrypoints.

Métricas privadas (`/health/metrics`, app `/api/metrics`) usam Bearer do segredo
interno. Prometheus recebe arquivo privado gerado no deploy, sem credencial no
Git, com scrape de oito processos e três Redis exporters. Contadores HTTP por
método/classe de status e duração têm cardinalidade limitada; app mede chamadas
BFF, não toda a navegação/renderização. Request ID validado é encaminhado pelo
BFF/gateway e registrado nos serviços, sem URL, corpo, cookies ou identidade.

Grafana recebe datasources/dashboard versionados. Alloy envia logs Docker para
Loki através de proxy GET limitado a listagem/logs do projeto Compose; não
recebe o socket do Docker; inspect é reduzido a metadados de TTY/driver, sem env/exec. Esse proxy permanece
um componente confiável com acesso ao socket, numa rede exclusiva do collector.
Alertmanager recebe webhook opcional configurado pelo operador (`ALERT_WEBHOOK_URL`),
sem destino real predefinido. Vazio mantém regras e alertas locais disponíveis no
Prometheus/Alertmanager, sem integração de envio; o deploy emite aviso explícito.
Uma URL preenchida inválida bloqueia o deploy. `INTERNAL_API_KEY` permanece
obrigatória para métricas privadas, com diagnóstico separado. O preflight usa os
Compose incoming e o `.env` da VPS via `--project-directory`, antes de substituir
configurações/registrar tentativa. A geração mantém `private` 0700 e arquivos
individuais 0644 para bind mounts; não registra valores de chave ou webhook.
Alertas cobrem target ausente, erros HTTP e memória Redis acima de 80%. O CI
valida configurações com/sem webhook usando o amtool da imagem de produção e
ensaia entrega a receptor sintético, sem notificações externas a pessoas reais.
Ver ADR-032.


### Visualizações da EAP (fase 6)
`/projetos/:id/wbs` mantém uma árvore e o autosave ao alternar `view=chart|details|costs|gantt`. Chart Details exibe responsável, duração agregada, datas e custo; Hours and Cost agrega folhas inclusive recolhidas, usando as funções da planilha e o valor por minuto de cada elaborador. A página consulta salários/jornadas e envia apenas as taxas derivadas quando o usuário tem `planilha:ver`; os demais usuários não recebem esses valores. Sem taxa válida, o custo e seus ancestrais são indicados como incompletos.

O layout calcula a caixa de cada subárvore e a posição relativa da raiz antes de posicionar os nós; cartões detalhados têm altura uniforme maior. O menu **Organizar** é um select de ícones (`components/wbs/ToolbarSelect.tsx`; ícones do usuário em `components/wbs/OrganizarIcons.tsx`). Desde a 1.31.0 (ADR-047), ele define o formato da EAP inteira, guardado no `layout` da raiz. São quatro formatos (`WbsLayoutOrientation`):
- `LADO_A_LADO` (Padrão): filhos lado a lado. Um item cujos filhos visíveis são todos folhas empilha as folhas, com a linha a `PADRAO_INSET` da borda esquerda dele.
- `ESQUERDA` e `DIREITA`: fases lado a lado. Abaixo delas, os filhos ficam empilhados à esquerda ou à direita da linha que desce do centro do pai, a 5/12 da largura dele.
- `HORIZONTAL`: a raiz fica em pé à esquerda (`vertical` na geometria, texto girado), só na visão gráfica, e cada nível ocupa uma coluna à direita do anterior, com o pai no meio dos filhos.

Sem fase selecionada, com nada, com a raiz ou com itens mais fundos selecionados, o Organizar muda a EAP inteira: a ação `SET_EAP_FORMAT` grava o formato na raiz e põe `LADO_A_LADO` em todos os outros nós. Com uma ou mais fases selecionadas, ele vira **Organizar fase** e dá a elas o formato próprio `ESQUERDA` ou `DIREITA`, que vale para tudo abaixo delas. O painel de propriedades faz o mesmo. "Igual à EAP" grava `LADO_A_LADO`, e no Horizontal toda fase segue a EAP. O layout dos níveis abaixo das fases não é usado.

`planejar` decide o arranjo dos filhos de cada nó, e cada subárvore guarda `rootX` e `rootY`, a posição do card dentro da caixa dela.

Valores antigos têm conversão própria:
- `ABAIXO` e `ABAIXO_L` viraram `DIREITA` (migration `20261015010000_wbs_layouts_organizar`);
- `HORIZONTAL_TOPO` e `HORIZONTAL_BASE` viraram `HORIZONTAL` (migration `20261016010000_wbs_remover_horizontal_topo_base`);
- o `DIREITA` herdado do padrão antigo em todos os nós abaixo da raiz voltou a `LADO_A_LADO` (migration `20261016020000_wbs_fases_seguem_eap`, 1.31.1).

Os dois recriam o enum. Arquivos `.wbs` antigos são normalizados na validação (`normalizarLayout`), e um valor desconhecido na raiz é desenhado como Padrão. A Visualização usa o mesmo select, com os modos em português: EAP (gráfico), EAP com detalhes, Horas e custos e Gantt.

Gantt é uma projeção somente leitura. `dataPrevista` define o último dia e `durationDays` estima os dias corridos anteriores. Não cria datas nem persiste o estado de expansão/zoom. Nós sem prazo permanecem visíveis sem barra. O estado da árvore continua no provider ao alternar de volta; as exportações existentes permanecem no formato clássico da EAP.


### Elaborado por = responsáveis do card (1.27.0, ADR-044)

Na planilha de custos, o "Elaborado por" de uma tarefa ligada a card é a lista de responsáveis do card. O nó da EAP guarda a lista em `properties.elaboradoPorUserIds`; `elaboradoPorUserId` (o primeiro) e `elaboradoPor` (nomes separados por vírgula) continuam preenchidos para o formato antigo, como versões salvas e exportações. As regras puras ficam em `lib/elaboradores.ts`.

- **Planilha → card:** `updateNodeProperties` grava a lista escolhida (só membros ativos do projeto; nomes vêm do cadastro) e, na mesma transação, acerta `CardResponsible` do card ligado. Quem entrou recebe a notificação "Nova tarefa atribuída" (`services/responsavelNotificacao.ts`).
- **Card → planilha:** `addResponsibleAction`/`removeResponsibleAction` chamam `refletirResponsaveisNoNo`, que espelha os responsáveis no nó e avança a versão da EAP. Mudanças feitas direto no sprint-service (MCP/API) entram na próxima sincronização.
- **Sincronização (`sincronizarEapComSprint`, passo 5b):** na primeira vez de cada nó, junta os dois lados (responsáveis do card primeiro) e marca `elaboradoSincronizado`; daí em diante o card é a fonte e o nó só espelha. Nós e cards sem ninguém não são gravados.
- **Custos:** o valor por minuto da tarefa é a soma dos elaboradores com salário e jornada (todos trabalham o tempo inteiro). A conversão de minutos em dias usa a menor jornada entre eles. O mesmo vale para "Horas e custos" da EAP (`computeFinancialRollups`). O quadro de elaboradores conta a tarefa para cada um, então a soma dos percentuais pode passar de 100%. "Realizado próprio" vale para qualquer um dos elaboradores.

### Lançamentos de tempo: edição, validação e limite do timer (1.29.0, ADR-046)

Regras em `sprint-service/src/time-entry/regras-tempo.ts`:

- **Edição:** `PATCH /time-entries/:id` (duração, `startedAt`, `endedAt`, `description`) edita um lançamento já encerrado. Com nova duração, o fim é recalculado a partir do início. Timer rodando não é editado. Quem pode (dono ou admin, com `quadro:cards`) é conferido no gateway (`services/apiAuthorization.ts`). Antes desta versão a tela chamava essa rota e recebia 404.
- **Validação** (manual e edição): fim depois do início, fim não no futuro (folga de 1 min), no máximo 12 h por lançamento e nenhuma sobreposição com outro lançamento do mesmo usuário (timer rodando vale até agora). A recusa (400/409) diz qual lançamento conflita.
- **Limite do timer:** 12 h. Ao parar, ou ao ler um timer vencido (início de outro timer, timer ativo do card ou do usuário, lista e total do card), ele é encerrado no limite, recebe `[Revisar] Timer encerrado no limite de 12 h.` na descrição e o dono é avisado. O aviso vai por `POST /notifications` no notification-service, com `x-internal-api-key` (`NOTIFICATION_SERVICE_URL`, best-effort). A tela do card avisa a partir de 8 h de sessão (`lib/avisoTimer.ts`, com teste de paridade do limite).

### Responsável obrigatório a partir de "Em andamento" (1.28.0, ADR-045)

Até "A Fazer" (e no backlog), um card pode ficar sem responsável. A partir de "Em andamento" (`colunaExigeResponsavel`: a coluna "Em andamento" da sprint e as de posição maior; sem ela, toda coluna depois da primeira), o card precisa de pelo menos um.

- **sprint-service** (vale para tela, MCP e API): `update` recusa (400) **mover** um card sem responsável para essas colunas, e `removeResponsible` recusa remover o último responsável de card que já está nelas. Cards antigos que já estão lá sem responsável continuam editáveis. A regra fica em `src/card/responsavel-obrigatorio.ts`, espelhada em `lib/responsavelObrigatorio.ts` (há um teste de paridade).
- **Planilha:** esvaziar o "Elaborado por" (= responsáveis, ADR-044) de um card nessas colunas é recusado em `updateNodeProperties`.
- **Timer:** iniciar o timer leva o card para "Em andamento". Sem responsável, quem iniciou vira o responsável: na tela por `startTimerAction`, no MCP por `operum_start_timer` (`responsible_added`).
- **Gerente:** o quadro mostra, para quem tem `quadro:cards`, um aviso com os cards em "Em andamento" ou depois sem responsável ativo (nenhum, ou só inativos) e um diálogo para atribuir alguém (`CardsSemResponsavel`).
- **Limite:** criar o card direto numa dessas colunas não é bloqueado, porque a tela cria o card e só depois adiciona os responsáveis. Ele aparece no aviso do gerente.

### Sincronização EAP ↔ sprint (SDD 12.8)

Na exclusão pelo painel, `deleteSprintAction` primeiro chama o sprint-service (cards voltam ao backlog em transação serializável), depois reconcilia o projeto real da sprint no monólito e invalida o layout do projeto. As duas etapas usam o mesmo advisory lock `eap-sprint:<projectId>`, em transações separadas; não há transação de banco mantida através de HTTP. Falha da segunda etapa é informada e pode ser recuperada pela reconciliação das próximas leituras autorizadas.

O reconciliador remove fases de sprints com `deletedAt` confirmado no mesmo projeto, após mover atividades que já pertencem a outra sprint ativa. Remove da EAP/planilha os nós dos cards devolvidos ao backlog, preservando Card/TimeEntry/anexos. Recompacta a ordem, recalcula códigos de toda a árvore e renomeia sprints vivas na mesma transação. IDs ausentes ou de outro projeto não comprovam exclusão e não autorizam remoção. Uma atividade viva ainda presa à fase bloqueia a remoção para evitar perda de suas propriedades. Não há mudança de schema.

`sincronizarEapComSprint` (`services/wbsService.ts`) reconcilia `WbsNode`, `Sprint` e `Card` do projeto sob advisory lock, dentro de uma transação. Estrutura: raiz = projeto; nível 2 = sprints (vínculo `WbsNode.properties.sprintId`); nível 3+ = cards (vínculo `WbsNode.properties.cardId`). Sprint não excluída sem nó ganha nó no nível 2 (ou é ligada ao nó de mesmo nome); folhas do nível 3+ sem card criam card em "A Fazer" da sprint do seu nível 2 (nível 2 sem sprint ganha uma sprint com as colunas padrão; o nome da sprint é "código título" e é regravado a cada sincronização); cards de sprint sem nó criam nó dentro do nó da sprint; nó cujo card mudou de sprint, ou que ficou no nível 2, é movido para a sprint do card; nó e card/sprint sem vínculo e com o mesmo título são ligados; títulos divergentes convergem para o lado alterado por último; card excluído não é recriado; card do backlog não entra na EAP nem na planilha: o nó dele solto no nível 2 ou dentro de uma sprint é removido (se a fase acabou de virar sprint, o card vai para "A Fazer" dela). `services/eapSprintSyncService.ts` executa ao abrir EAP, planilha de custos, quadro da sprint e o documento da EAP, apenas com `projeto:editar` e `quadro:cards`, e nunca derruba a página; cada execução grava o estado em `ProjetoSincronizacao` (situação, pendências, erro), exibido na EAP e na Planilha com "Sincronizar agora" (ADR-055); em seguida `propagarPlanilhaDeCustos` (`services/planilhaService.ts`) leva o resultado da planilha para fases, sprints e projeto: data fim da fase = maior data prevista das atividades (`LinhaMacrofase.dataFim`) → `properties.dataLimite` do nó (Data Limite do cronograma financeiro) e `Sprint.endDate`; data fim do projeto = maior data fim das fases → `Project.endDate`; custo da fase = valor orçado → `properties.custo` (`aplicarResumoDaPlanilha`, `services/wbsService.ts`). A mesma propagação roda após editar a planilha (`updateNodePropertiesAction`). O quadro (`getSprintBoardAction`) anexa a cada card o `eapCode` (código do nó vinculado) e o card exibe "código - título" sem alterar `Card.title`. Excluir na EAP reflete na sprint: o autosave (`saveTreeAction` → `saveTree(..., { refletirExclusoes: true })`) e `deleteNode` excluem (soft delete) o card dos nós removidos e a sprint das fases removidas, com os cards restantes indo para o fim do backlog; card/sprint ainda referenciados por outro nó salvo (recortar e colar) não são excluídos, e importação não reflete exclusões. O editor (`WbsProvider`) busca a árvore atual (`getWbsTreeAction`) ao abrir e ao voltar para a aba, adota uma árvore mais nova vinda do servidor quando não há alteração pendente e, em conflito no autosave, guarda a edição local no navegador antes de recarregar a árvore e oferece reaplicá-la por mesclagem em três vias (ADR-056). Ver ADR-033, ADR-034, ADR-036, ADR-037 e ADR-038.

### Inativação de stakeholder e numeração de página (1.16.0)

`Stakeholder` ganha `inactiveReason` e `inactivatedAt` (migration `20261014000000_stakeholder_inactive_reason`); o PATCH do project-service inativa com motivo (mín. 3 caracteres) e reativar limpa ambos. A impressão em PDF usa `lib/printPageStyle.ts` (A4 com "Página X de Y" na margem inferior via `@page`); o documento da EAP (`EapDocumentSheet`) segue o modelo do professor, todo em A4 paisagem: página gráfica com layout em colunas (`computeEapColumnLayout`, `lib/eapLayout.ts`) e texto que flui pelas páginas seguintes; `GET /api/projects/:id/eap` devolve também `logoUrl`, `assinaturaUrl` (gerente, só com versão aprovada) e `origemWbs`. A árvore do documento vem da aba EAP/WBS (`eapNodesFromWbs`, `lib/eapFromWbs.ts`) e o PUT grava a estrutura da WBS, não a do cliente; sem WBS, vale a do modelo. "Gerente do projeto" de todos os documentos vem de `gerenteDoProjeto` (`services/gerenteProjeto.ts`, papel `gerente` em `UserProjectRole`). Os campos do quadro (gerente e Aprovado por só leitura, Elaborado por com `MembroEquipeSelect` e "+", Versão, Data de aprovação) ficam em `components/projetos/documentacao/CamposQuadroDocumento.tsx`, usado por Termo, Partes Interessadas e EAP; a Ata usa `MembroEquipeSelect` nos campos de pessoa. Ver ADR-035.

### Inativação de membro da equipe (1.23.0)

`UserProject` ganha `inactiveReason` e `inactivatedAt` (migration `20261015000000_user_project_inactive_reason`, nos schemas do monolito, do project-service e do sprint-service). Inativar usa `active = false` com motivo: o membro perde o acesso ao projeto (é o mesmo `active` que `services/authz.ts` consulta), mas o motivo o mantém em Stakeholders e no formulário de Partes Interessadas, em vermelho. Desvincular (`DELETE /members/:userId`) e re-adicionar limpam o motivo; desvinculado sem motivo some das duas telas. Escrita em `PATCH /projects/:id/members/:userId/situacao` (project-service); a action `setMembroAtivoAction` exige `projeto:equipe` e recusa motivo com menos de 3 caracteres, inativar a si mesmo e inativar um gerente do projeto (tirar o papel de gerente antes).

Os cards continuam com o responsável inativo. `services/membroInativo.ts` lista os cards abertos do projeto (backlog ou sprint, fora da coluna de conclusão) em que todos os responsáveis estão inativos (`precisaDeOutroResponsavel`, `lib/responsavelInativo.ts`) e, ao inativar, publica uma notificação `UPDATE` para cada gerente do projeto com essa pendência (link para o card, se for um só, ou para a sprint). O quadro recebe `inactiveUserIds`, mostra o aviso no minicard e `moveCardInSprintAction`/`moveCardToSprintAction` recusam levar esse card para a coluna de conclusão (`bloqueioDeConclusao`); o quadro já desfaz o movimento quando o servidor recusa. Movimentos feitos direto no sprint-service (MCP/API) não passam por essa regra. Ver ADR-041.

### Documentos do projeto — fase 7

O Termo alterna entre formulário privado e prévia explícita; alternar não salva nem publica uma versão. PDF usa impressão do componente, e Word é gerado no navegador com `docx`. Partes Interessadas usa A4 paisagem; Termo/Ata usam retrato. A lista de atas fica em Documentação (`/projetos/:id/documentacao?doc=atas`); a rota antiga `/projetos/:id/atas` só redireciona para lá. Ata mantém a exportação autenticada `/api/atas/:id/export` com autorização `documentos:ver`, e ganha prévia/PDF do rascunho. Word e PDF da Ata seguem o modelo "01_Form Ata de Reunião" com as mesmas regras (`lib/exports/ataDocx.ts`, `components/atas/AtaDocument.tsx`); o Word é gerado no navegador ("Baixar Word") e pela rota do servidor com o mesmo layout, a logo do projeto e as assinaturas cadastradas dos presentes; no servidor, as imagens só são baixadas do host de `MINIO_PUBLIC_URL` (`lib/exports/imagemServidor.ts`, ADR-052). A linha institucional da Ata e da EAP vem de `linhaInstitucional` (`lib/linhaInstitucional.ts`): localização, departamentos (nome atual do cadastro pela associação `ProjetoDepartamento`, `services/departamentosDoProjeto.ts`), termo/turno (`Project.termo`/`Project.turno`, quando o período é semestral; sem valor, "A definir") e período/ano do projeto. A prévia dos documentos de folha corrida (`PaginasDaPrevia`) usa a mesma altura útil da impressão (`alturaUtilDaPaginaMm`) para marcar onde cada página termina e numerá-las; na impressão, o padding inferior da folha é removido e linhas de tabela não quebram entre páginas. O documento EAP desenha a EAP gráfica com o layout da aba (`EapGraficaDaAba`, ADR-053).

`DocumentVersion.payload` do Termo guarda campos, macrofases e `documentContext` (nome, logo, gerente, assinatura e equipe). `changes` JSON registra diferenças por campo contra a versão anterior na sequência de submissão; `previousVersionId` é uma referência histórica textual, não uma FK que impedisse a exclusão autorizada de versões. Criação de snapshot, sequência, diff e auditoria ocorrem na mesma transação com bloqueio do projeto. Aprovar não recalcula o histórico. Metadados de apresentação não são escritos no cadastro `Project`; a migration acrescenta os campos de histórico e `Ata.instituicao` como opcionais.

Versões legadas sem contexto/diff mostram a ausência; não recebem cabeçalho atual silenciosamente. A prévia privada não exibe assinatura do gerente como aprovação. Imagens Word são buscadas exclusivamente no navegador, com URL segura, timeout e limite de 5 MB, preservando proporção; falha de imagem interrompe exportação com mensagem. O servidor da exportação de Ata não busca URLs de anexos.

O “hoje” do Gantt usa snapshot estável do servidor para hidratação e calendário local do navegador em seguida, atualizado por assinatura a cada minuto (`useCalendarToday`). As datas planejadas permanecem date-only; a linha de hoje não desloca datas do projeto nem assume que o calendário do usuário é UTC.

### Conector OAuth do MCP (1.36)

Implementado na 1.36.0 (SDD [`SDD-mcp-oauth.md`](specs/SDD-mcp-oauth.md), ADR-057). Permite adicionar `https://api.operum.adm.br/mcp` como conector personalizado no claude.ai (web, Desktop e celular) e nas sessões do Claude Code na nuvem. A homologação em staging e no celular ainda está pendente.

```
Claude ─POST /mcp sem token─────────────► mcp-server ── 401 + resource_metadata
       ─GET /.well-known/oauth-protected-resource/mcp ─► mcp-server (Traefik roteia no host api.)
       ─GET /.well-known/oauth-authorization-server ───► gateway → auth-service
       ─navegador: operum.adm.br/oauth/autorizar (login + consentimento) → código
       ─POST /oauth/token (código + PKCE + resource) ──► gateway → auth-service
       ─POST /mcp  Bearer opr_oat_… ──► mcp-server ─► gateway (+ X-Operum-Mcp-Key, X-Operum-Tenant)
```

- **Clientes:** CIMD (`client_id` em URL, só hosts de `OAUTH_CIMD_ALLOWED_HOSTS`, leitura com proteção a SSRF, sem redirecionamento, 5 s, 64 KB, cache de 24 h; redirect que não é loopback precisa estar na origem do `client_id`) e DCR (`opr_dcr_…`, redirects só da allowlist ou loopback com qualquer porta). Só clientes públicos.
- **Código:** `opr_oac_…`, 60 s, uso único (marcado antes de conferir o resto), ligado a cliente, redirect, `code_challenge` S256, `resource`, escopos e workspaces. Reuso revoga o grant gerado.
- **Tokens:** access `opr_oat_…` de 1 h e refresh `opr_ort_…` de 30 dias com rotação. Teto de 90 dias por conexão. Reuso de refresh depois de 10 s revoga a conexão. Tudo guardado só como hash SHA-256.
- **Gateway:** introspecção `oat:{hash}` com cache de 60 s, apagado na revogação. Só aceita o token com `X-Operum-Mcp-Key` correta e `resource` igual a `MCP_RESOURCE_URL`, e só no workspace pedido em `X-Operum-Tenant`, que precisa estar no grant (sem ele, vale o padrão). Mesma allowlist do PAT no auth-service; escrita exige `operum:write`. Injeta `x-auth-type: oauth`, `x-api-token-id: oauth:<grant>` (rate limit de 20 req/s e auditoria) e `x-oauth-tenants`, com o qual `/auth/my-tenants` devolve só os workspaces autorizados. Os cabeçalhos `x-operum-*` nunca seguem aos serviços.
- **Workspaces:** o grant guarda `(tenantId, userId)` por workspace escolhido, validado por e-mail e usuário ativo, a mesma regra do `switch-tenant`. A introspecção tira o workspace cujo usuário foi desativado ou está com troca de senha pendente.
- **Rotas de conta:** `NoPatGuard` e as rotas de PAT recusam qualquer `x-auth-type` (PAT ou OAuth).
- **Rate limit:** 30 registros/min e 300 tokens/min no gateway; como o IP visto é o do Traefik, o limite é global.
- **Configuração:** `OAUTH_ISSUER`, `MCP_RESOURCE_URL`, `OAUTH_AUTHORIZE_URL`, `MCP_GATEWAY_KEY`, `OAUTH_CIMD_ALLOWED_HOSTS` e `OAUTH_DCR_ALLOWED_REDIRECTS` no `.env` (ver `.env.example`). O router `mcp-prod-api` do Traefik inclui `/.well-known/oauth-protected-resource`. Sem `OAUTH_ISSUER`, `MCP_RESOURCE_URL` e `MCP_GATEWAY_KEY`, o auth-service responde 404 nos metadados, no registro, no token e no consentimento (`OAuthEnabledGuard`, 1.36.1), a mesma condição que desliga o OAuth no mcp-server; revogação, introspecção e a lista de apps conectados seguem disponíveis. Os três serviços leem o mesmo `.env` da VPS e só pegam valores novos quando recriados.

### MCP — importação incremental e uploads locais (fase 8)

`target_project_id` opcional em copy/import reaproveita estrutura por nome normalizado no tenant destino e pula títulos similares >=0,9. Preflight consulta backlog e cards de todas as sprints; simulação permanece padrão. O cadastro e equipe do projeto existente não são sobrescritos. Escritas usam o gateway/PAT e não são transação distribuída; importações concorrentes podem competir na deduplicação.

`operum_create_upload_link` verifica a tarefa e cifra grant AES-256-GCM com PAT/tarefa/tenant/nonce/expiração (10 min). `/uploads/:token` reserva o nonce uma única vez, revalida identidade/acesso pelo gateway, recebe um arquivo multipart privado temporário e encaminha-o por stream ao gateway/file-service. O parser é Busboy e o rate limit usa express-rate-limit (produção); 50 MB, tipos canônicos, dois uploads ativos, timeout 120 s e rate limit por socket peer. Resposta/telemetria não expõem PAT ou erro interno. O grant é consumido mesmo quando a tentativa falha, e o arquivo temporário é removido no finally. Reinício invalida links pendentes; nonce em memória exige uma réplica. `MCP_UPLOAD_SECRET`/`MCP_PUBLIC_URL` são configuração operacional; sem elas a tool informa o erro e os demais recursos continuam operando. O fallback público de produção em `api.operum.adm.br` cobre `/mcp` e `/uploads/`; a origem dedicada pode ser configurada quando seu DNS estiver disponível.


### Ajustes de EAP, documentos e planilha (1.32.0)

O modo Padrão de `lib/wbsLayout.ts` dispõe filhos lado a lado em todos os níveis; a quantidade de folhas visíveis e o estado de colapso não escolhem outro arranjo. Os formatos próprios Esquerda/Direita das fases continuam herdados pela subárvore. O cliente enfileira autosave, salvamento manual e flush; a fila usa a versão retornada pela operação anterior, mesmo antes do próximo render. A busca em segundo plano descarta respostas se houve edição durante a requisição.

Após `propagarPlanilhaDeCustos`, `services/planilhaCardSync.ts` leva `dataPrevista` a `Card.endDate` e conclusão explícita (`dataRealizacao` válida ou `percentualConclusao >= 100`) à coluna de conclusão da própria sprint (reconhecida pelo nome mesmo renomeada, ou a última coluna); retirar a conclusão reabre o card só se foi a planilha que o concluiu, e um card reaberto à mão não volta com a mesma conclusão (ADR-054). Cada transição cria `CardMovement`; repetir a leitura não duplica a transição. Responsável ativo continua obrigatório; sem ele o prazo sincroniza, mas o card não é concluído. Nunca transforma minutos da planilha em `TimeEntry`. `getCardPlanilhaAction` resolve a linha pelo vínculo `cardId`, com tenant e permissões `quadro:ver` e `planilha:ver`, para mostrar minutos, valores e datas no modal do card. A lista de sprints apresenta o orçado e o realizado da planilha em bloco próprio, com permissão financeira; horas/custos do timer ficam identificados como registrados. O quadro (`getSprintBoardAction`) anexa a cada card a linha da planilha (`resumoDaPlanilhaPorCard`): minutos orçados/realizados e datas prevista/realizada para todos; valores em R$ só com `planilha:ver`. O minicard mostra o valor orçado em aberto e o realizado nos concluídos.

Outras regras do projeto (1.34.0): `SprintColumn.color` (hex ou nulo) colore o cabeçalho da coluna; a lista de sprints colore o cartão pelo progresso (`lib/sprintProgresso.ts`); `Project.startDate` segue a primeira tarefa com data (`services/inicioDoProjeto.ts`, ADR-050); a exclusão de projeto é bloqueada enquanto houver dependências (`services/projetoDependencias.ts`, ADR-051); a ata aceita upload de anexo (`enviarAnexoAtaAction`, chave `atas/{tenant}/{projeto}/` no storage) e oferece os e-mails dos stakeholders do projeto em "Enviar cópias para" (`emailsParaCopia`); as etapas da EAP em Detalhes e Horas e Custos usam o Sub-total da planilha (`computeFinancialRollups`).

`/projetos/:id/configuracoes` mantém a edição dentro do layout do projeto; o menu documental é um submenu da navegação do projeto. Dados Complementares passam pelo serviço de versões do Termo de Abertura (permissões de editar e aprovar), sem escrita genérica desses campos no project-service. A identificação do elaborador é editável e congelada em `DocumentVersion.elaboradoPor`; o servidor preenche sua ausência com a sessão e resolve Aprovado por pelo gerente do cadastro. A aprovação efetiva continua em `approvedById`, independente do nome apresentado no documento.
