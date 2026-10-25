# Registro de decisões do Operum

Este arquivo explica por que o projeto segue determinadas escolhas e quais consequências elas trazem. A descrição do sistema está em [architecture.md](architecture.md); as regras de manutenção estão no [AGENTS.md](../AGENTS.md).

Os primeiros registros foram reconstruídos da seção “Decisões de Arquitetura Notáveis” já existente em `architecture.md`. A data abaixo é a do registro, não a da aprovação original. Não representam novas aprovações nem uma auditoria completa da implementação. Motivos e alternativas ausentes das fontes são marcados explicitamente.

## Índice

| ID | Decisão | Status |
|---|---|---|
| ADR-001 | PostgreSQL compartilhado entre serviços | Existente — registro retrospectivo |
| ADR-002 | Identidade propagada pelo gateway aos serviços internos | Existente — registro retrospectivo |
| ADR-003 | Server Actions para as operações da interface | Existente — registro retrospectivo |
| ADR-004 | Dados específicos do vínculo entre usuário e projeto | Existente — registro retrospectivo |
| ADR-005 | O file-service confere o tenant consultando o sprint-service | Aceita |
| ADR-006 | Remoção de `/files/avatar` e `/files/logo` do file-service | Aceita |
| ADR-007 | URL assinada do storage gerada com o endpoint público | Aceita |
| ADR-008 | Permissões por função e ajustes por usuário | Aceita — implementação parcial |
| ADR-009 | Custos pelo responsável persistido na transação | Implementada |
| ADR-010 | Permissões de domínio resolvidas no app para o gateway | Implementada |
| ADR-011 | Patch temporário de profundidade em braces | Implementada — revisão ao sair correção upstream |
| ADR-012 | Validar URLs de avatar também no navegador e comparar CodeQL com a mesma configuração | Implementada |
| ADR-013 | Verificar patch na imagem antes de filtrar detecção Trivy de braces | Implementada — revisão até 2026-11-03 |
| ADR-014 | Snapshots documentais com publicação e auditoria atômicas | Implementada nesta entrega |

## ADR-001 — PostgreSQL compartilhado entre serviços

- **Data do registro:** 2026-09-29.
- **Status:** existente — registro retrospectivo; aprovação original não documentada.
- **Contexto:** o Next.js e os serviços de domínio utilizam PostgreSQL, com schemas Prisma próprios e parcialmente sobrepostos. Parte das funcionalidades permanece no monolito.
- **Escolha:** compartilhar o banco entre serviços, com `public` para a maior parte dos dados e `files` para os anexos do file-service.
- **Justificativa documentada:** reduzir a complexidade operacional em relação a bancos isolados por serviço.
- **Alternativas:** a documentação contrapõe database-per-service ao banco compartilhado; não registra uma avaliação detalhada nem critérios de aprovação da alternativa.
- **Consequências:** existe acoplamento de schema entre serviços. Migrations e alterações de tabelas precisam considerar todos os consumidores. Ter schemas Prisma separados não significa isolamento de banco ou de tenant.
- **Condição de revisão sugerida:** necessidade de independência de deploy, escala ou isolamento que o banco compartilhado não atenda. Não constitui compromisso de migração.
- **Referências:** [estratégia de banco](architecture.md#banco-de-dados--estratégia-multi-schema), [funcionalidades ainda no monolito](architecture.md#migração-incompleta--o-que-ainda-é-monolito), [schema do app](../prisma/schema.prisma), [schema do file-service](../file-service/prisma/schema.prisma).

## ADR-002 — Identidade propagada pelo gateway aos serviços internos

- **Data do registro:** 2026-09-29.
- **Status:** existente — registro retrospectivo; aprovação original não documentada.
- **Contexto:** o gateway autentica as chamadas e encaminha requisições aos serviços de domínio na rede interna.
- **Escolha:** transmitir a identidade por `x-user-id`, `x-tenant-id` e `x-user-role`, com proteção por `INTERNAL_API_KEY` e isolamento de rede, em vez de revalidar o JWT em cada serviço.
- **Justificativa documentada:** simplicidade e desempenho, com menor defesa em profundidade do que a revalidação independente.
- **Alternativas:** revalidação criptográfica do JWT em cada serviço é citada como contraste; a avaliação original detalhada não foi registrada.
- **Consequências:** a confiança depende da proteção do gateway, dos headers e do segredo interno. Identidade autenticada não substitui a autorização de acesso a cada recurso e tenant.
- **Pendência conhecida (atualizada em 2026-09-30):** a falta de conferência de tenant nos anexos do file-service (SDD 4.1) foi corrigida na PR #33. Ver [ADR-005](#adr-005--o-file-service-confere-o-tenant-consultando-o-sprint-service). Os demais serviços continuam confiando nos headers do gateway, como descrito acima.
- **Condição de revisão sugerida:** mudança nas fronteiras de rede ou exposição de serviços, ou necessidade de autenticação independente entre serviços.
- **Referências:** [arquitetura de serviços](architecture.md#arquitetura-de-serviços), [middleware de autenticação](../api-gateway/src/middleware/auth.ts), [SDD, item 4.1](specs/SDD-backlog-operum-2026-09.md).

## ADR-003 — Server Actions para as operações da interface

- **Data do registro:** 2026-09-29.
- **Status:** existente — registro retrospectivo; aprovação original não documentada.
- **Contexto:** a interface usa Next.js App Router e precisa executar operações no servidor.
- **Escolha:** componentes chamam Server Actions; as operações extraídas usam o gateway por `lib/api-client.ts`, enquanto funcionalidades legadas ainda usam services com Prisma direto.
- **Justificativa documentada:** evitar uma camada REST adicional entre o componente e o código de servidor da aplicação.
- **Alternativas:** API REST consumida diretamente pelo cliente é citada no documento; os critérios históricos completos não estão registrados.
- **Consequências:** existem dois caminhos de persistência durante a migração. A documentação deve explicitar qual caminho cada funcionalidade utiliza. Autorização e validação continuam necessárias nas operações do servidor.
- **Condição de revisão sugerida:** um consumidor externo precisar do mesmo contrato ou uma funcionalidade migrar de responsabilidade entre app e serviço.
- **Referências:** [fluxos de dados](architecture.md#fluxo-de-dados), [actions](../app/actions), [cliente de API](../lib/api-client.ts), [services](../services).

## ADR-004 — Dados específicos do vínculo entre usuário e projeto

- **Data do registro:** 2026-09-29.
- **Status:** existente — registro retrospectivo; aprovação original não documentada.
- **Contexto:** cargo, departamento, remuneração e situação do vínculo podem variar entre projetos para a mesma pessoa.
- **Escolha:** manter os dados específicos do projeto no vínculo `UsuarioProjeto` / modelo `UserProject`, em vez de tratá-los como atributos globais de `User`.
- **Justificativa documentada:** representar dados que variam por projeto. Não há registro da discussão original de alternativas.
- **Alternativas:** armazenar os dados em `User` é o contraste explicitado na arquitetura; não há evidência de outras opções avaliadas.
- **Consequências:** consultas e telas que mostram dados do membro em um projeto precisam considerar o vínculo. Identidade global e configuração por projeto têm responsabilidades distintas.
- **Condição de revisão sugerida:** alteração nas regras de cargos, remuneração ou permissões por projeto, incluindo a fase 5 do SDD.
- **Referências:** [schema do app](../prisma/schema.prisma), [decisões resumidas](architecture.md#decisões-de-arquitetura-notáveis), [SDD, fases 3 e 5](specs/SDD-backlog-operum-2026-09.md).

## ADR-005 — O file-service confere o tenant consultando o sprint-service

- **Data do registro:** 2026-09-30.
- **Status:** aceita. Implementada na PR #33, com merge em 2026-09-30.
- **Contexto:** o gateway repassa `/files/*` a qualquer JWT ou PAT válido, com `x-user-id` e `x-tenant-id` ([ADR-002](#adr-002--identidade-propagada-pelo-gateway-aos-serviços-internos)). O file-service não conhece cards nem tenants: a tabela `files."Attachment"` guarda só o `cardId`. Por isso, confiava que o chamador já tinha conferido o dono. Pelo gateway, com o id de um card ou anexo de outro tenant, dava para anexar, listar, renomear, trocar a capa, baixar e excluir.
- **Escolha:**
  - toda rota do file-service exige `x-tenant-id`;
  - antes de qualquer operação, o card é conferido no sprint-service por `POST /cards/in-tenant { ids }`, com a chave interna, que devolve só os ids do tenant;
  - nas rotas por anexo, vale o card do próprio anexo; com `cardId` informado, o anexo precisa ser desse card;
  - falha fechada (503) se o sprint-service não responder;
  - cache em memória de 30 s, só para respostas positivas.
- **Justificativa:** o sprint-service já é o dono da regra "card pertence ao tenant" (`cardInTenant`). Consultá-lo mantém a regra num lugar só e respeita a fronteira entre serviços. Uma rota em lote atende o `by-cards` com uma chamada.
- **Alternativas consideradas:**
  - *Consultar `public."Card"` direto pelo banco compartilhado:* acoplaria o file-service ao schema do sprint-service ([ADR-001](#adr-001--postgresql-compartilhado-entre-serviços)).
  - *Conferir só no app e no MCP:* deixaria o gateway aberto para quem chama `/files/*` direto.
- **Consequências:**
  - o file-service passa a depender do sprint-service para operar;
  - cada operação ganha uma chamada interna, amortizada pelo cache;
  - anexo cujo card foi excluído deixa de ser acessível.
- **Condições de revisão:** se o `Attachment` passar a guardar o `tenantId`, a conferência pode ser local.
- **Referências:** [SDD 4.1](specs/SDD-backlog-operum-2026-09.md), commit `398a26fa`, PR #33, `file-service/src/upload/card-scope.ts`, `sprint-service/src/card/card.controller.ts`.

## ADR-006 — Remoção de `/files/avatar` e `/files/logo` do file-service

- **Data do registro:** 2026-09-30.
- **Status:** aceita. Implementada na PR #33, com merge em 2026-09-30.
- **Contexto:** as duas rotas estavam expostas pelo gateway e não tinham nenhum chamador no repositório. O app grava avatar e logo direto no MinIO (`uploadAvatarAction`). `/files/logo` não conferia o dono do projeto ou stakeholder, e a chave era previsível (`logos/<tipo>s/<id>.<ext>`): outro tenant podia sobrescrever o arquivo.
- **Escolha:** remover as duas rotas e os métodos correspondentes do file-service.
- **Justificativa:** rota sem uso e sem conferência de dono é só superfície de ataque. Remover é mais seguro que proteger algo que ninguém usa.
- **Alternativas consideradas:** manter as rotas e conferir o dono no project-service. Foi descartada por não haver uso que justificasse o custo.
- **Consequências:** avatar e logo continuam só pelo app. Um cliente externo que dependesse dessas rotas deixaria de funcionar; nenhum foi encontrado no repositório.
- **Condições de revisão:** mover o upload de avatar e logo para o file-service, com conferência de dono.
- **Referências:** [SDD 4.1](specs/SDD-backlog-operum-2026-09.md), commit `398a26fa`, PR #33.

## ADR-007 — URL assinada do storage gerada com o endpoint público

- **Data do registro:** 2026-09-30.
- **Status:** aceita. Implementada na PR #33, com merge em 2026-09-30.
- **Contexto:** o file-service assinava as URLs de download com o mesmo `S3Client` do upload, cujo endpoint é o interno (`http://minio:9000`), que só existe dentro do Docker. A assinatura SigV4 inclui o host, então trocar o host depois de assinar invalida a URL. Em produção, anexo de arquivo não abria, e a rota de miniatura do app recusava o host interno.
- **Escolha:**
  - um segundo `S3Client`, só para assinar (sem chamada de rede), com `MINIO_PUBLIC_URL`;
  - upload, exclusão e leitura continuam pelo cliente interno;
  - no app, o anexo é um link para `/api/files/:id/download`, que confere a sessão e responde 302 para a URL assinada.
- **Justificativa:** o navegador precisa de uma URL no host público. Assinar já com esse host resolve sem proxy de arquivo pelo app.
- **Alternativas consideradas:**
  - *Trocar o host depois de assinar:* invalida a assinatura.
  - *O app servir o arquivo como proxy:* gasta banda e memória do container do app, principalmente com vídeos de até 50 MB.
- **Consequências:** o proxy de miniatura (`/api/files/:id/image`) busca a URL pública a partir do servidor. Se o container do app não alcançar o host público, as miniaturas falham, e seria preciso uma assinatura interna só para esse uso.
- **Condições de revisão:** mudança do storage ou do domínio público; falha de alcance do host público a partir dos containers.
- **Referências:** [SDD 4.2](specs/SDD-backlog-operum-2026-09.md), commit `488eb3f3`, PR #33, `file-service/src/minio/minio.service.ts`, `app/api/files/[attachmentId]/download/route.ts`.

## Como registrar a próxima decisão

Usar o próximo ID disponível, acrescentar ao índice e preencher:

- **Título e ID:** ADR-NNN — escolha descrita de forma concreta.
- **Data do registro:** AAAA-MM-DD; data da aprovação separada, apenas se conhecida.
- **Status:** proposta, aceita, rejeitada ou substituída; registros históricos podem usar “existente — registro retrospectivo”.
- **Contexto:** problema, restrições e requisitos que motivaram a escolha.
- **Escolha:** o que foi decidido e seu alcance.
- **Justificativa:** por que essa opção atende ao contexto.
- **Alternativas consideradas:** opções realmente avaliadas e motivos de descarte; marcar ausência de evidência quando necessário.
- **Consequências:** benefícios, custos, limitações e pendências.
- **Condições de revisão:** quando reconsiderar, se conhecidas.
- **Referências:** código, SDD, PRs, commits e decisões relacionadas.

Ao substituir uma decisão, manter o texto histórico, alterar seu status e ligar os dois registros. Não confundir uma proposta com algo já implementado.


## ADR-008 — Permissões por função e ajustes por usuário

- **Data do registro:** 2026-09-30.
- **Status:** aceita conforme decisões do usuário registradas nos commits `12d427e0` e `ef7f1bbb`; implementação parcial. Registro retrospectivo dessas decisões, sem inferir participantes ou aprovação adicional.
- **Contexto:** a autorização binária por admin/gerente não atende à concessão ou restrição de acessos individuais pedida no SDD 5.1.
- **Escolha:** matriz global por função, função-base de membro e ajustes GRANT/DENY por usuário, globais ou no projeto. Somar os cargos `UserProject.role` normalizados e o papel de `UserProjectRole`; aplicar ajustes globais e depois os do projeto. Só admin configura; admin mantém acesso total, não membros ativos não ganham acesso por ajuste. Tech Lead/PO começam com a base do membro.
- **Justificativa:** representar os cargos visíveis em Stakeholders e permitir exceções individuais sem criar uma função para cada pessoa, conforme o pedido registrado. A marca `permissoesDefinidasEm` distingue ausência de configuração de uma matriz vazia deliberada.
- **Alternativas consideradas no SDD:** usar somente `UserProjectRole` como fonte das funções; oferecer padrões privilegiados para Tech Lead e PO. O histórico registra a escolha dos cargos e ausência desses privilégios; não documenta uma avaliação adicional das alternativas.
- **Consequências:** exige migration, auditoria, isolamento de tenant e aplicação consistente nos consumidores. Configurar uma permissão não basta para proteger uma operação que ainda usa o teste antigo. UI de configuração, núcleo, services e actions estão implementados. Atualização de estado em 03/10/2026: adoção nos consumidores registrada na ADR-010; planilha por responsável registrada na ADR-009; fluxo documental pendente (5.2) permanece em desenvolvimento.
- **Condição de revisão:** conclusão da fase 5 e extensão do contrato de autorização às APIs/MCP; mudança da fonte de cargos ou das regras de associação a projetos.
- **Referências:** [catálogo e resolvedor](../lib/permissoes.ts), [autorização](../services/authz.ts), [serviço](../services/permissoesService.ts), [actions](../app/actions/permissoes.ts), [SDD 5.1](specs/SDD-backlog-operum-2026-09.md#51-modelo-de-permissões-funções--ajuste-por-usuário); commits `12d427e0` e `ef7f1bbb`.

## ADR-009 — Validar custos pelo responsável persistido na transação

- **Data do registro:** 01/10/2026.
- **Status:** implementada localmente na continuação do SDD 5.3; sem validação em produção.
- **Contexto:** um membro pode editar realizado das próprias linhas. O mesmo patch de propriedades também permite orçamento e troca de responsável; confiar no responsável enviado pelo cliente permitiria contornar o controle.
- **Escolha:** exigir contexto de autorização no serviço, separar permissões por campo e ler o responsável persistido após bloquear a linha por ID/projeto/tenant com `FOR UPDATE`. Persistência e auditoria usam a mesma transação. Exportação segue as permissões de leitura da página.
- **Justificativa:** a identidade da linha deve ser conferida no servidor, e uma troca concorrente de responsável deve ser serializada com a edição do realizado. Erro na auditoria não deve produzir edição confirmada sem registro.
- **Alternativas consideradas nesta continuação:** apenas bloquear inputs (insuficiente para chamadas diretas); validar o ID enviado junto ao patch (permite autoatribuição); validar antes da transação (permite corrida com troca de responsável); registrar auditoria depois do commit (pode confirmar apenas parte da operação).
- **Consequências:** a edição aguarda outras gravações na mesma linha; falha de permissão ou auditoria aborta a transação. Permissão de orçamento não implica realizado, nem o inverso. Substituição da árvore e importação exigem edição de ambos para não contornar o controle por campo.
- **Condição de revisão:** revisar a serialização se a planilha migrar de JSON de `WbsNode` para um modelo próprio ou se houver gravações em outro serviço.
- **Referências:** `lib/permissoesCustos.ts`, `services/wbsService.ts` (`updateNodeProperties`), `app/actions/wbs.ts`, `app/api/projetos/[projetoId]/planilha-custos/export/route.ts`, `__tests__/unit/services/wbsCustosPermissions.test.ts`, SDD 5.3 e ADR-008.


## ADR-010 — Resolver permissões de domínio no app para o gateway

- **Data do registro:** 03/10/2026.
- **Status:** implementada nesta entrega do SDD 5.1; sem validação em produção.
- **Contexto:** matriz e ajustes de usuário estão persistidos no schema do app, mas API/MCP usam gateway e microsserviços. Guardas por admin/gerente não refletiam concessões/negações configuradas e duplicar o resolvedor permitiria divergências.
- **Escolha:** gateway consulta o app por endpoint com chave interna; o app obtém identidade ativa e papel no banco e aplica o resolvedor existente. Headers confiáveis transportam escopo de listagens e ocultação documental; cada operação é reavaliada, com 403 para negação e 503 para indisponibilidade. App usa o mesmo resolvedor em páginas, actions e controles de UI.
- **Justificativa:** manter uma fonte de decisão para UI, actions e API/MCP sem espalhar o modelo de permissões por todos os serviços. Cargos/papel de gerente afetam concessões e só podem ser atribuídos pelo administrador; gestão de equipe não deve permitir autoelevação.
- **Alternativas consideradas nesta implementação:** somente controles visuais (permite chamadas diretas); duplicar resolução em cada serviço (aumenta divergência de contratos); cachear concessões no gateway (atrasa revogações e requer invalidação distribuída).
- **Consequências:** operações de domínio dependem da disponibilidade do app e acrescentam uma consulta interna; timeout é de 10 segundos e falha fechado. Multipart é preservado; JSON precisa ser reposto no proxy. Escopo vazio deve continuar sendo filtro explícito. Catálogos globais são administrados pelo admin; associações de projeto usam `cadastros:gerenciar`. Edição de stakeholder compartilhado exige gestão de equipe em todos os projetos ativos afetados. A ponte documental protege conteúdo publicado com edição/aprovação, até a implementação de snapshots pendentes em 5.2.
- **Condições de revisão:** extração do resolvedor para serviço próprio, custo das consultas em instituições grandes, mudanças nas APIs ou conclusão do fluxo documental 5.2. Sessões/Redis e demais correções de infraestrutura da fase 11 continuam fora desta entrega.
- **Referências:** `services/apiAuthorization.ts`, `services/authz.ts`, `services/projectAccess.ts`, `app/api/internal/authorize/route.ts`, `api-gateway/src/middleware/authorization.ts`, `components/permissoes/ProjectPermissions.tsx`, testes `apiAuthorization.test.ts` e `authorization.test.ts`; SDD 5.1, ADR-008 e ADR-009.

## ADR-011 — Mitigar profundidade de braces enquanto não há correção publicada

- **Data do registro:** 2026-10-03.
- **Status:** substituída em parte pelo [ADR-062](#adr-062--manter-o-patch-de-braces-sem-exceção-depois-da-retirada-do-advisory) em 2026-10-24: o advisory foi retirado; o patch continua, a exceção do audit saiu.
- **Contexto:** GHSA-vfj7-8cjw-p6xm afeta `braces <=3.0.3`, transitivo do lint e do proxy. Na consulta ao registro e ao advisory em 03/10/2026, não havia versão corrigida. O audit bloqueia o CI mesmo após corrigir Next.js.
- **Escolha:** aplicar patch pnpm em parse e percursos recursivos de compile/expand/stringify, limitando a profundidade a 128, incluindo AST fornecida diretamente. Registrar somente esse GHSA na exceção do audit enquanto o patch estiver ativo. Espelhar o patch no gateway isolado e copiá-lo nos estágios Docker antes da instalação congelada. Executar instalação congelada, testes do patch e audit high nas PRs para main/develop, além da auditoria existente no deploy. Todos esses workflows usam a versão pnpm do `packageManager`, sem pin paralelo.
- **Justificativa:** rejeitar entradas excessivamente aninhadas antes de esgotar a pilha, mantendo globs usuais e uma mudança de dependência rastreável por hash. O audit consulta a versão publicada e não inspeciona correções locais. Testes carregam os consumidores reais para impedir que a exceção mascare ausência do patch. Validar nas PRs antecipa falhas que antes só apareciam no deploy; usar a mesma versão pnpm elimina divergências com a validação local.
- **Alternativas consideradas:** atualizar braces (não existe versão corrigida); atualizar o proxy (a versão atual continua usando micromatch/braces); ignorar sem mitigação ou todos os alertas sem correção (não protege o código e amplia a exceção).
- **Consequências:** globs extremamente aninhados passam a lançar `SyntaxError`; há manutenção temporária de patch em duas instalações. Quatro alertas moderados permanecem fora do limiar high do CI. A exceção não se estende a outros advisories.
- **Condição de revisão:** verificar correção upstream em atualizações de dependências; quando disponível, atualizar, remover patches/exceção e repetir testes/audit/instalação congelada. Novos advisories sobre AST/globs exigem reavaliação.
- **Referências:** [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [pnpm patch](https://pnpm.io/cli/patch), [audit](https://pnpm.io/cli/audit), `patches/braces@3.0.3.patch`, `api-gateway/patches/braces@3.0.3.patch`, `__tests__/unit/security/bracesPatch.test.ts`, Dockerfiles e lockfiles.

## ADR-012 — Validar URLs de avatar no navegador e manter comparabilidade do CodeQL

- **Data do registro:** 2026-10-03.
- **Status:** implementada nesta revisão da PR; sem validação em produção.
- **Contexto:** CodeQL identificou fluxo de texto do formulário até `src` de avatar (alerta #3, `js/xss-through-dom`); dados históricos e estado de formulário chegam ao componente sem passar necessariamente pela validação de persistência. A PR era analisada por `codeql.yml:analyze`, mas a main tinha baseline em `deploy-production.yml:security-scan`, gerando aviso de configuração ausente.
- **Escolha:** validar URL de exibição e navegação por allowlist http(s)/caminho local, rejeitar HTML/esquemas executáveis/controles e normalizar com URL e codificar metacaracteres no contexto da URL sem alterar query/escapes existentes. Compartilhar a função entre imagem e menu Visualizar; abertura usa `noopener,noreferrer`. Rodar o job de segurança de produção também nas PRs para main, com guards explícitos impedindo testes de deploy, build/push e deploy nesse evento.
- **Justificativa:** defender o ponto de uso independentemente da origem e obter comparação CodeQL com a configuração realmente presente na base, preservando o histórico de análises.
- **Alternativas consideradas:** confiar apenas na persistência (não cobre estado local/histórico); descartar o alerta (não corrige o ponto de uso); apagar a análise da main (perde baseline); disparar o workflow de produção em PR sem guards (risco de publicação/deploy indevido).
- **Consequências:** URLs fora da allowlist passam a usar iniciais e não são abertas; URLs assinadas http(s) e caminhos locais seguem aceitos. Existe análise CodeQL adicional em PR para manter compatibilidade com a baseline existente. Versão permanece 1.10.0, pois esta correção integra a mesma entrega.
- **Condição de revisão:** consolidar workflows CodeQL preservando uma baseline comparável; reavaliar allowlist se houver necessidade explícita de outro esquema de imagem.
- **Referências:** `lib/validation/avatarUrl.ts`, `components/user/UserAvatar.tsx`, `components/profile/AvatarUpload.tsx`, `__tests__/components/user/UserAvatar.test.tsx`, `.github/workflows/deploy-production.yml`, PR #39 e alerta CodeQL #3.

## ADR-013 — Verificar o patch na imagem antes da exceção Trivy de braces

- **Data do registro:** 2026-10-04.
- **Status:** substituída em parte pelo [ADR-062](#adr-062--manter-o-patch-de-braces-sem-exceção-depois-da-retirada-do-advisory) em 2026-10-24: a regra do Trivy e os controles negativos saíram; a verificação do patch na imagem continua.
- **Contexto:** o run de produção `37170296982` apontou CVE-2026-93687 no gateway, no caminho de `braces@3.0.3` que já contém o hash do patch da ADR-011. Trivy consulta metadados publicados e não interpreta o patch; a exceção do pnpm audit não se aplica ao scan de imagens. Advisory/registro consultados nesta data continuam sem versão corrigida.
- **Escolha:** conferir dentro da imagem final o hash/código efetivamente carregado pelo proxy, parsing profundo, AST direta e globs usuais. Só depois usar um filtro YAML limitado a CVE-2026-93687 e ao caminho exato da cópia corrigida, com expiração em 2026-11-03. Compartilhar script e filtro entre PRs, staging e produção. Nas PRs, executar controles negativos com Trivy real para provar que o filtro não cobre a cópia sem patch nem outro hash. PR constrói apenas imagem local, sem publicação/deploy. Preservar a exceção picomatch já existente no gateway e manter `.trivyignore` nos demais serviços.
- **Justificativa:** reconhecer a mitigação aplicada sem ocultar cópias não corrigidas ou depender somente de uma marca no nome da pasta. Detectar a falha do scan da imagem antes do merge, não apenas no deploy.
- **Alternativas consideradas:** ignorar o CVE globalmente (oculta cópias não corrigidas); remover Trivy/usar exit-code zero (perde bloqueio de outros alertas); mudar artificialmente a versão do pacote (falseia os metadados); atualizar braces (não há correção publicada).
- **Consequências:** build de gateway acrescentado nas PRs e verificação antes do scan em deploy; o filtro exige manutenção se o patch/hash/caminho mudar e expira automaticamente. Novo CVE, outra cópia ou falta do patch continua bloqueando. A limpeza `Remove Trivy Envs file` é etapa normal da action e permanece ativa.
- **Condição de revisão:** até 2026-11-03 ou assim que sair versão upstream corrigida. Atualizar dependência, remover patch/exceções e repetir testes/scan. Qualquer mudança no hash exige rever a cópia e o filtro conjuntamente.
- **Referências:** ADR-011, `.trivyignore-gateway.yaml`, `api-gateway/scripts/verify-braces-patch.cjs`, `scripts/security/verify-trivy-braces-filter.cjs`, `.github/workflows/gateway-image-security.yml`, workflows de staging/produção, [filtros Trivy](https://trivy.dev/latest/docs/configuration/filtering/) e [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## ADR-014 — Snapshots documentais com publicação e auditoria atômicas

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega; sem deploy ou validação em produção nesta tarefa.
- **Contexto:** 5.1 libera edição documental por catálogo, mas o conteúdo existente exigia aprovação para gravação direta. As versões antigas guardavam metadados sem o conteúdo proposto, portanto não era possível aprovar uma alteração preservando o vigente. O rascunho arquivado de 5.2 precisava ser conciliado com as permissões e custos já integrados.
- **Escolha:** reutilizar `DocumentVersion` com payload validado, tipo/recurso e sequência; manter rascunhos privados em `DocumentDraft`. Submissão de editor fica PENDING, submissão de aprovador pode publicar imediatamente, aprovação/rejeição exige a permissão própria. Bloquear o projeto ativo do tenant na transação e gravar publicação/status junto da auditoria. Preservar registros legados e não permitir aprovar registros sem snapshot. Excluir ata cancela propostas; versões aprovadas não são excluídas.
- **Justificativa:** separar a proposta do conteúdo em uso, manter a autoria real e evitar dupla revisão, publicação sem log ou contorno por recurso de outro projeto. Atualizar também Project/EapDocument/Ata na aprovação mantém os leitores existentes coerentes. A lista de Partes Interessadas e as macrofases documentais são snapshots do documento, sem concessão implícita para modificar pessoas ou custos.
- **Alternativas consideradas nesta implementação:** continuar sobrescrevendo o vigente antes da aprovação (perde isolamento da proposta); uma tabela separada por tipo (duplica revisão/auditoria); usar apenas metadados no histórico (não preserva o conteúdo proposto); excluir/recriar documentos ao revisar (perde histórico e referências).
- **Consequências:** migration de payload/tipos/rascunhos/ordenação; logs e histórico autorizados por documento, com nomes dos autores. É necessário aplicar a migration antes do app no deploy autorizado. A API genérica continua compatível nos projetos legados; o uso de snapshots aprovados ativa a proteção contra sobrescrita do Termo e requer editar por versões. O cadastro de projeto passa a orientar para Documentação. Não há migração automática de metadados antigos para conteúdo inventado, nem alteração da WBS por uma versão de Termo/EAP documental. PostgreSQL real no CI verifica transações e concorrência.
- **Condições de revisão:** extração do domínio para microsserviço, necessidade de comparar versões com diff por linha, paginação adicional do histórico (limite atual de 200 registros por consulta) ou política de retenção/eliminação de documentos.
- **Referências:** SDD 5.2/5.3; ADR-008, ADR-009 e ADR-010; `services/documentRevisionService.ts`, `lib/validation/documentRevisionSchemas.ts`, `app/api/projects/[projetoId]/revisions/route.ts`, `components/projetos/documentacao/HistoricoDocumento.tsx`, migration `20261004000000_document_revisions`, `.github/workflows/document-revisions.yml`, testes de integração PostgreSQL.


## ADR-015 — Transferência ao backlog e exclusão de sprint na mesma transação

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem operação em produção.
- **Contexto:** cards criados somente com sprintId podiam perder o vínculo ao projeto na exclusão. Transferência e soft delete separados permitiam persistência parcial; exclusões de duas sprints podiam disputar o final do mesmo backlog.
- **Escolha:** sprint-service executa leitura, validação, transferência ordenada e soft delete em transação Serializable. Cards ativos herdam o projeto da sprint quando ausente; vínculo divergente é recusado antes da escrita. P2034 repete a transação inteira no máximo duas vezes e retorna conflito se esgotado.
- **Justificativa:** preservar escopo de projeto, referências e estado anterior em qualquer falha, usando a proteção do banco também na leitura do final do backlog. A revisão de vínculos divergentes evita normalizar silenciosamente dados cuja origem é ambígua.
- **Alternativas consideradas nesta entrega:** manter updateMany sem projeto/transação (perda de acesso e persistência parcial); transferir tudo com a posição padrão (ordem ambígua); escolher automaticamente um projeto para vínculo divergente (pode contrariar origem/permissões); mutex em memória (não coordena múltiplas instâncias).
- **Consequências:** operação usa mais updates dentro de uma única transação; conflito esgotado exige retry do cliente. Não repara órfãos históricos nem modifica comentários, tempos ou cards excluídos. A atomicidade de outras mutações permanece no SDD 9.3.
- **Condições de revisão:** sprints cujo volume exceda o timeout padrão da transação; coordenação do backlog com todas as mutações no SDD 9.3; evidência do operador para recuperação de dados antigos.
- **Referências:** SDD 9.1; `sprint-service/src/sprint/sprint.service.ts`, `__tests__/integration/sprintDeletion.postgres.test.ts`, `.github/workflows/sprint-integrity.yml`.


## ADR-016 — Índice parcial de timer ativo e parada condicional idempotente

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem execução em produção.
- **Contexto:** a leitura seguida de insert permitia dois timers ativos do mesmo usuário. Repetir stop substituía o fim e a duração já encerrados. Duplicados históricos podem existir, mas não houve inspeção de produção e o banco não determina o período real de trabalho.
- **Escolha:** índice único parcial em TimeEntry por userId para registros ativos não excluídos; pré-verificação e criação sob lock na migration do app. Duplicados abortam com rollback, exigindo revisão específica do operador. Start traduz colisão do índice em 409. Stop faz compare-and-set por estado ativo, proprietário e tenant e retorna os valores persistidos nos retries.
- **Justificativa:** proteger a regra entre múltiplas instâncias e clientes, preservar períodos/histórico sem inferir dados de trabalho e evitar atualização repetida de horas já contabilizadas. O adapter PostgreSQL pode reportar nome do índice; a tradução de erro reconhece essa evidência sem mascarar outras violações.
- **Alternativas consideradas nesta entrega:** apenas consulta prévia ou mutex em memória (não garantem concorrência entre instâncias); índice único incondicional (impede histórico/manual); recalcular stop em cada retry (muda horas); encerrar duplicados automaticamente (não há evidência de qual intervalo representa trabalho real); manter transação aberta entre chamadas HTTP (não é necessária).
- **Consequências:** migration deve preceder a nova imagem do serviço no deploy autorizado. Dados duplicados exigem diagnóstico, plano e reparo autorizado antes de migrate deploy; nenhum histórico é corrigido nesta entrega. Criação convencional do índice bloqueia escritas durante a janela. Timer já ativo passa a devolver 409, aceito pelos clientes atuais; MCP mantém sua opção stop_running e idempotência existente por tarefa. A parada condicional não muda os contratos de tempo manual.
- **Condições de revisão:** modelo de múltiplos timers simultâneos, mudança de propriedade de usuário ou necessidade de criação concorrente do índice em banco de maior volume. Consolidar módulo local legado no SDD 9.7.
- **Referências:** SDD 9.2; migration `20261004010000_unique_running_timer`; `sprint-service/src/time-entry/time-entry.service.ts`; `__tests__/integration/timerIntegrity.postgres.test.ts`; `.github/workflows/sprint-integrity.yml`; `docs/operations/timer-integrity.md`.


## ADR-017 — Movimentação, histórico e ordenação num único commit transacional

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem operação em produção.
- **Contexto:** histórico antecedia update do card e a renumeração usava transações separadas. Falha parcial podia registrar movimento inexistente ou deixar posições inconsistentes; cálculos concorrentes usavam snapshots antigos.
- **Escolha:** CardService.update utiliza um único cliente transacional Serializable para ler/validar, atualizar, renumerar origem/destino, registrar histórico e ler retorno normalizado. Conflitos P2034 ou estruturados do adapter PostgreSQL refazem tudo até duas vezes; demais erros abortam sem retry. Desempates usam criação e ID; posição omitida ao mudar grupo insere ao final e posição explícita é limitada ao tamanho real.
- **Justificativa:** associar o histórico apenas a alterações confirmadas e dar à concorrência uma ordem serial verificável, preservando escopo de instituição e coerência de projeto/sprint/coluna. Releitura em retry evita repetir origem histórica de um estado que já mudou.
- **Alternativas consideradas nesta entrega:** transações só na renumeração (mantêm falha parcial); mutex em memória (não coordena instâncias); aplicar posições calculadas pelo cliente sem revalidar (estado pode ter mudado); registrar histórico fora da transação (pode não corresponder à alteração).
- **Consequências:** mais leituras/updates na transação; conflito esgotado exige retry. A ordem relativa entre pedidos simultâneos não é predefinida, mas os grupos persistidos têm ordem estável e posições contínuas. Retorno ao backlog normaliza position; cards sem coluna usam grupo próprio da sprint. Nenhum schema novo. Criação/exclusão de cards/colunas e configuração da sprint não foram unificadas nesta entrega; histórico de reordenação dentro de um grupo não é criado, mantendo o contrato anterior.
- **Condições de revisão:** volumes que excedam o timeout da transação, coordenação das demais mutações do quadro ou necessidade de histórico detalhado de reordenação/projeto sem coluna.
- **Referências:** SDD 9.3; ADR-015; `sprint-service/src/card/card.service.ts`, `__tests__/integration/cardMovement.postgres.test.ts`, `.github/workflows/sprint-integrity.yml`.


## ADR-018 — Intenção persistida e reconciliação transacional de macrofases na EAP

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem operação de produção.
- **Contexto:** delete/create de macrofases eram separados; a action atualizava projeto, lote via HTTP e EAP em etapas independentes. Falhas podiam esvaziar o lote ou ocultar intenção salva atrás da árvore antiga.
- **Escolha:** project-service valida o lote e grava projeto/substituição/revisão desejada numa transação Serializable. O app aplica o último lote e confirma a revisão no mesmo commit de nós/códigos/versão/auditoria. Revisões diferentes persistem uma pendência recuperável; o formulário oferece retry com autorização e exibe o lote pendente. Conflitos Prisma/adapter têm duas novas tentativas, sem mascarar outros erros.
- **Justificativa:** impedir perda entre exclusão e inserção, sobreviver à interrupção entre processos e evitar marcar como aplicada uma sincronização incompleta. Replay equivalente mantém o lote; retry aplicado não reexecuta EAP. Edição de EAP posterior à confirmação não é sobrescrita por retry antigo.
- **Alternativas consideradas nesta entrega:** transação atravessando HTTP (acopla processos e mantém recursos abertos); só capturar erro em memória (perde pendência em crash); apagar subárvores ausentes (perde atividades); worker automático com fila/outbox por evento (maior custo operacional para um fluxo com retry explícito suficiente); aplicar o payload do retry (pode reintroduzir lote antigo).
- **Consequências:** migration aditiva antes das imagens. WbsNode permanece canônico para árvore/custos; ProjectMacroFase guarda intenção do formulário e fallback legado. Pendência tem prioridade na leitura do formulário até aplicação. Sincronização por nome preserva fases ausentes/atividades e recusa nomes ambíguos; não promete remoção ou renomeação destrutiva. Lotes limitados a 500 e árvore a 5000 nós. Diagnóstico genérico é auxiliar; diferença de revisões é o estado persistente. Recuperação exige ação do usuário, sem worker automático.
- **Condições de revisão:** necessidade de recuperação automática, mudanças do compartilhamento do PostgreSQL, requisitos de IDs estáveis de macrofase para renomeação, volumes/timeouts ou edição simultânea de EAP durante pendências.
- **Referências:** SDD 9.4; `project-service/src/project/project.service.ts`; migration `20261004020000_macro_fases_reconciliation`; `services/macroFaseSyncService.ts`; `services/wbsService.ts`; `app/actions/projetos.ts`; `components/projetos/ProjetoFormPage.tsx`; `.github/workflows/macro-phases-integrity.yml`; `__tests__/integration/macroFases.postgres.test.ts`.


## ADR-019 — Agregados de dashboard no sprint-service com contrato validado

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem operação em produção.
- **Contexto:** cliente/action chamavam rotas inexistentes de dashboard e casts escondiam a ausência de contrato. Metrics existente retorna registros individuais, não KPIs agregados.
- **Escolha:** preservar URLs dos consumidores, rotear `/dashboard` no gateway e implementar dois agregados no sprint-service; schemas Zod puros canônicos compartilhados com Next. Ler em snapshot RepeatableRead e autorizar interseção de leitura de projeto/quadro/custos. Teste HTTP usa factory do gateway e controller/guard/resolvedor/banco reais.
- **Justificativa:** restaurar telas com contrato explícito, impedir ampliar escopo em consulta agregada e evitar usar API de registros como agregado. Retornar zeros apenas para vazio legítimo, mantendo falhas visíveis.
- **Alternativas consideradas nesta entrega:** BFF voltar a consultar banco local (contorna caminho canônico do gateway e duplica domínio); adaptar lista de DashboardMetric no cliente (não contém cards/feedbacks/tempos completos); múltiplas chamadas por sprint (aumenta custo e mistura snapshots); retornar todos os projetos quando o header está ausente (amplia acesso).
- **Consequências:** espelhamento de campos/tabela já existentes no schema Prisma mínimo do serviço, sem migration. Dashboard exige leitura de custos além do quadro; global omite projetos sem ambas. Custo continua baseado na taxa atual de User e tempo persistido; não usa taxa histórica/override de projeto. Convenção de conclusão por título permanece. Dashboard administrativo e serviços locais legados não são consolidados nesta entrega.
- **Condições de revisão:** aumento do volume que exija agregação SQL/paginação, status explícito de conclusão, taxa histórica de custo ou separação das telas financeiras e operacionais.
- **Referências:** SDD 9.5; `sprint-service/src/dashboard/`; `api-gateway/src/app.ts`; `services/apiAuthorization.ts`; `lib/api-client.ts`; `app/actions/dashboard.ts`; `__tests__/integration/dashboardRoutes.postgres.test.ts`; `.github/workflows/dashboard-contracts.yml`.

## ADR-020 — Paginação de tarefas na origem e resumo opcional de tempos no quadro

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem operação em produção.
- **Contexto:** MCP carregava backlog e cada sprint antes de filtrar/paginar; o quadro transferia todo o histórico de tempo mesmo quando o consumidor não o utilizava.
- **Escolha:** endpoint aditivo `GET /cards/page` no sprint-service, filtros SQL, keyset por criação/ID e limite superior da primeira página. Cursor opaco versionado vinculado ao tenant/filtros; autorização do gateway revalidada a cada página. Resumo de tempo no quadro solicitado explicitamente, mantendo o contrato anterior por padrão. MCP pede o resumo e serializa o total agregado; anexos são carregados somente depois da página.
- **Justificativa:** reduzir chamadas/materialização sem perder cards vinculados ao projeto pela sprint; manter ordenação independente de posição/nome e não depender da existência do card marcador. Evitar quebra de consumidores de histórico completo.
- **Alternativas consideradas nesta entrega:** offset após varredura (mantém custo e deslocamento sob inserções); offset SQL (deslocamento sob remoções); cursor em updatedAt/posição (muda em edições/movimentos); snapshot persistido de IDs (custo operacional/persistência adicional); remoção incondicional do histórico do quadro (quebra contrato); remover total exato (quebra o retorno MCP existente).
- **Consequências:** versão MINOR 1.13.0 por endpoint novo compatível; migration de índices parciais aplicada pelo caminho raiz existente. `count` exato permanece proporcional aos registros elegíveis. Requisições não compartilham snapshot: exclusão/entrada-saída dos filtros/permissão podem alterar o conjunto; cards criados com chave maior que o limite inicial ficam para nova listagem. IDs já retornados não se repetem se a chave de criação não for alterada por operação externa. Cursor não é credencial: conteúdo é validado, mas não assinado, e todas as consultas continuam limitadas ao escopo autorizado. Cursores antigos de offset de operum_list_tasks são recusados; iniciar nova listagem sem cursor. Outros cursores MCP mantêm o contrato anterior.
- **Condições de revisão:** grande custo do count, necessidade de snapshot entre páginas, ordenação por posição, operações externas que alterem createdAt ou importem dados retroativos, payload de muitas relações num único card.
- **Referências:** SDD 9.6; `sprint-service/src/card/task-page.ts`; `card.service.ts`; `mcp-server/src/tools/tasks.ts`; `sprint-service/src/sprint/sprint.service.ts`; `lib/api-client.ts`; migration `20261004030000_task_page_indexes`; `__tests__/integration/taskPagination.postgres.test.ts`; `__tests__/integration/dashboardRoutes.postgres.test.ts`; `.github/workflows/task-pagination.yml`; `docs/operations/task-pagination.md`.

## ADR-021 — Retirar duplicatas mortas e verificar fronteiras por consumidores

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega, aguardando revisão; sem operação de produção.
- **Contexto:** clientes HTTP diretos de projetos/sprints sem consumidor e duas implementações locais de departamentos coexistiam com os serviços Nest; os testes de departamentos cobriam apenas uma duplicata inativa.
- **Escolha:** inventário AST e busca de entrypoints/scripts/dynamic imports; retirar os cinco módulos sem consumidor de runtime e o teste ligado ao módulo morto. Validar CRUD/escopo no DepartmentService ativo. Guard de imports/presença e URLs diretas no app, mapa explícito de ownership e exceções locais.
- **Justificativa:** evitar continuar testando regras que não executam; reduzir caminhos concorrentes de manutenção sem migrar domínios usados ou mudar comportamento do produto.
- **Alternativas consideradas nesta entrega:** manter testes das duplicatas (dá cobertura ao caminho errado); trocar imports em lote por APIs Nest (altera regras/contratos locais sem análise); reorganizar todas as pastas (aumenta escopo); proibir todo Prisma no app (interrompe domínios ainda locais).
- **Consequências:** sem incremento SemVer, pois módulos retirados não possuem runtime e não há mudança de dependências/contratos. Serviços locais com consumidor continuam documentados; guard não é análise de fluxo completa e não prova equivalência de outros módulos sem consumidor. Helpers/regras legadas de departamentos não são incorporados ao serviço Nest nesta entrega.
- **Condições de revisão:** migração de leitores locais de projetos/sprints/métricas, acesso direto novo, imports dinâmicos montados ou mudança de proprietário do domínio.
- **Referências:** SDD 9.7; docs/domain-boundaries.md; scripts/check-domain-boundaries.mjs; project-service/src/department/department.service.spec.ts; .github/workflows/domain-boundaries.yml.

## ADR-022 — Confirmar alterações e centralizar recuperação/foco na UI

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega; aguardando revisão da PR.
- **Contexto:** SDD 10.1–10.8 identificou estado otimista sem tratamento de `{error}`,
  formulário fechado antes da persistência, timers divergentes, autosave sem flush
  confirmado e overlays que competiam pelo foco. Reprodução em 360/390/768 px
  confirmou lateral de 224 px mesmo no celular.
- **Escolha:** aplicar mutações de quadro após confirmação, com retry por recurso;
  contrato assíncrono explícito no formulário e sessão de criação parcial;
  store de timer compartilhado por card; autosave serializado com flush booleano;
  cópia privada em sessionStorage vinculada à identidade/projeto; uma pilha de
  overlays para foco, inert e lock de scroll; menu sobreposto abaixo de 768 px.
- **Justificativa:** evita rollback de snapshots que apagaria operações válidas;
  preserva dados e comunica incerteza sem anunciar sucesso falso. Reutiliza APIs
  existentes e permite testar falhas sem mudar permissões ou serviços. Identidade
  é confirmada antes de ler a cópia local; recuperação explícita evita substituir
  silenciosamente o rascunho servidor.
- **Alternativas consideradas nesta entrega:** snapshot global com rollback
  (conflita com alterações simultâneas); duplicar lógica de timer/foco por componente
  (mantém divergência); gravar cópias locais sem autor ou em localStorage permanente
  (risco de exposição/retenção); sincronização por push (exige contrato/infra novos).
- **Consequências:** versão PATCH 1.13.1 sobre 1.13.0. UI aguarda persistência para
  alterar o quadro; criação parcial mantém o card real e o formulário aberto.
  Timer compartilhado vale dentro da mesma árvore/aba; atualização entre abas
  depende de nova leitura. Cópia local é best-effort, expira em 24 horas e não
  assegura recuperação após fechamento definitivo da aba. Menus/diálogos usam
  inert nativo; regiões A4/Kanban continuam explicitamente bidimensionais.
- **Condições de revisão:** sincronização entre abas, idempotência de anexos após
  resposta perdida, navegação interna que não use links, novos tipos de overlay ou
  política de retenção de dados locais.
- **Referências:** hooks/useCardTimer.ts; hooks/useAutosave.ts;
  hooks/useRecoverableDraft.ts; hooks/useOverlay.ts; components/sprint/SprintBoard.tsx;
  components/card/CardModal.tsx; docs/validation/sdd-10/README.md; SDD 10.1–10.8;
  .github/workflows/ui-reliability.yml.


## ADR-023 — Sessões verificadas pela autoridade de autenticação

- **Data do registro:** 2026-10-04.
- **Status:** decisão desta implementação da fase 11.1, registrada antes do código; aguardando revisão.
- **Contexto:** existência de JTI no Redis não verifica desativação ou tokenVersion; indisponibilidade permitia acesso em produção.
- **Escolha:** gateway consulta auth-service sem cache de validade JWT em produção. Auth verifica assinatura, JTI, sessão e usuário persistido; falhas de dependência retornam 503, credenciais revogadas 401. Escrita/remoção de sessão deve ser confirmada. Desenvolvimento mantém tolerância explícita apenas para Redis ausente, sem dispensar a verificação do usuário no auth-service.
- **Justificativa:** uma autoridade aplica revogação consistente sem replicar consultas de identidade no gateway. Não existe fallback de produção que aceite uma credencial sem prova atual.
- **Alternativas consideradas:** cache de validade (janela de revogação); aceitar assinatura durante queda (não comprova logout); gateway consultar banco diretamente (duplica responsabilidade).
- **Consequências:** uma consulta adicional ao auth-service por requisição JWT em produção; indisponibilidade impede login, logout confirmado e acesso protegido. Logout malsucedido deve ser repetido após recuperação; não é anunciado como sucesso. Redis usa prazo limitado e reconexão.
- **Condições de revisão:** volume que exija protocolo de invalidação distribuída, disponibilidade regional ou mudança de persistência de sessões.
- **Referências:** SDD 11.1; auth-service/src/auth/auth.service.ts; auth-service/src/redis/redis.service.ts; api-gateway/src/middleware/auth.ts.

## ADR-024 — Redis separado para sessão, fila e cache

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega; aguardando revisão e operação de migração.
- **Contexto:** allkeys-lru compartilhado podia eliminar sessão ou job por pressão de cache.
- **Escolha:** três instâncias sem portas públicas, volumes próprios para sessão/fila, AOF e noeviction; cache independente e descartável.
- **Justificativa:** políticas de memória distintas não podem ser obtidas com bancos lógicos na mesma instância.
- **Alternativas consideradas:** prefixos/DB lógico (eviction continua global); Redis único noeviction (cache disputa capacidade com jobs).
- **Consequências:** memória adicional; esgotamento durável é erro de escrita. Preservar host/volume original da fila e mover sessões para nova instância; usuários devem autenticar novamente na transição. A rotina operacional deve dimensionar capacidade e alertar memória. Cache PAT mantém janela máxima de 60 segundos quando invalidação falha.
- **Condições de revisão:** volume de filas/sessões, HA ou requisitos de persistência sem perda de um segundo.
- **Referências:** SDD 11.2; docker-compose*.yml; lib/notificationPublisher.ts; notification-service/src/app.module.ts.

## ADR-025 — Releases por digest, gates por serviço e rollback condicionado

- **Data do registro:** 2026-10-04.
- **Status:** implementada nesta entrega; aguardando validação/revisão.
- **Contexto:** tags prod mutáveis podiam misturar builds concorrentes; SHA recebido pelo script não selecionava as imagens.
- **Escolha:** publicar SHA, validar todos os pacotes/imagens e gerar manifesto de digests; migração e app usam a mesma imagem. Registrar configuração anterior e restaurar somente com compatibilidade de schema declarada, false por padrão. Checks de operação e serviços precedem build de produção.
- **Justificativa:** referência imutável conserva o conjunto aprovado e possibilita recuperar release sem retag manual; dados não são revertidos automaticamente.
- **Alternativas consideradas:** serializar apenas deploy (build continua movendo tags); usar SHA com tags mutáveis (registry permite substituição); migration down automática (pode destruir dados).
- **Consequências:** produção precisa de release.env e Python 3/flock; primeira implantação não tem rollback registrado. Operador define compatibilidade da release após análise de migrations; false bloqueia rollback. Simulação com Docker fixture não prova tempo de rollout na VPS; imagem smoke/restore são ensaiados isoladamente no CI. Não há merge/deploy nesta entrega.
- **Condições de revisão:** separação dos bancos, migrations incompatíveis, múltiplas VPS ou registry que suporte políticas de imutabilidade.
- **Referências:** SDD 11.3–11.6; scripts/deploy; scripts/backup; .github/workflows/services-validation.yml; .github/workflows/operations-validation.yml.

## ADR-026 — Prontidão limitada e telemetria operacional privada

- **Data do registro:** 2026-10-04.
- **Status:** implementada; requisito de webhook no deploy parcialmente substituído por ADR-032.
- **Contexto:** health constante não impedia deployment sem dependências; endpoints de métricas e provisioning/collector estavam ausentes.
- **Escolha:** liveness independente e readiness com probes leves limitados; métricas com segredo interno, request ID sem dados sensíveis, Grafana provisionado, Alloy por proxy Docker GET de logs/listagem, regras e webhook operacional configurável.
- **Justificativa:** distinguir falha de processo de indisponibilidade externa; implantar configuração reproduzível com limites de exposição e cardinalidade.
- **Alternativas consideradas:** reiniciar por falha de DB (cascata); socket do Docker diretamente no collector (capacidade administrativa); URLs/identidades em métricas (segredos e cardinalidade); configuração manual exclusiva (não reproduzível).
- **Consequências:** dependência operacional adicional no proxy/collector/exporters; proxy é confiável e tem acesso ao socket. App mede chamadas BFF. Webhook real precisa de configuração e inventário, sem enviar alertas reais nesta PR. Estado real do Grafana não foi consultado.
- **Condições de revisão:** OpenTelemetry distribuído, maior volume de logs, autenticação distinta para scrape ou novo serviço/dependência.
- **Referências:** SDD 11.7–11.8; observability/; src/health de cada serviço; lib/operationalTelemetry.ts; docs/architecture.md.


## ADR-027 — Visualizações derivadas da EAP sem nova fonte de dados
- **Data:** 2026-10-04
- **Status:** Aceita na implementação; revisão pela PR da fase 6.
- **Contexto:** A EAP já guarda hierarquia, esforço e prazo; a planilha calcula custos por elaborador. O SDD 6.3–6.4 pede cartões detalhados e Gantt somente leitura.
- **Escolha:** Reutilizar a árvore em memória e as funções financeiras, limitar taxas à permissão `planilha:ver`, e interpretar o prazo como fim do período estimado em dias corridos. Ausência de taxa produz custo incompleto; ausência de data produz linha sem barra.
- **Justificativa:** Evita divergência com a planilha, perda de edições na alternância e datas inventadas.
- **Alternativas consideradas:** Uma segunda árvore persistida; taxa global do projeto; adicionar datas de início/fim e edição de barras agora. Essas opções duplicam dados ou ampliam o escopo além do Gantt somente leitura.
- **Consequências:** Não há migrations. Datas estimadas não representam um calendário de dias úteis nem dependências; revisão necessária quando houver edição de barras/calendário. Exportações clássicas continuam existentes.
- **Referências:** `lib/wbsLayout.ts`, `lib/wbsRollup.ts`, `lib/wbsGantt.ts`, `components/wbs/WbsGantt.tsx`, SDD fase 6.


## ADR-028 — Modelos documentais e histórico imutável do Termo

- **Data:** 2026-10-05
- **Status:** implementada; revisão pendente.
- **Contexto:** SDD 7.1–7.4 exige os modelos do Prof. Fábio e separação do formulário com histórico por campo. Dados atuais do projeto/equipe não podem alterar documentos anteriores.
- **Escolha:** guardar contexto de apresentação no payload e diferenças na transação da submissão; gerar Word do Termo/Stakeholders no navegador e manter exportação autenticada de Ata no servidor.
- **Justificativa:** snapshots reconstituem conteúdo da versão; uso do navegador para imagens evita transformar URLs do documento em acesso de rede do servidor. Modelos variam orientação e tabelas, mas compartilham helpers DOCX.
- **Alternativas consideradas nesta entrega:** prévia sempre junto ao formulário (não atende separação); reconstituir histórico com dados atuais (altera passado); buscar imagens arbitrárias no servidor (amplia superfície de SSRF).
- **Consequências:** versões legadas mostram contexto/diff ausentes; uso de imagens externas depende de CORS; limite de 5 MB e falha explícita por imagem. PDF depende da impressão do navegador. Assinatura visual não constitui assinatura digital.
- **Condições de revisão:** novos modelos ou necessidade de assinatura digital com verificação; requisito de exportação assíncrona no servidor exigiria armazenamento confiável de imagens.
- **Referências:** `services/documentRevisionService.ts`, `lib/charterChanges.ts`, `lib/exports/`, `components/projetos/documentacao/ProjectCharter.tsx`, `docs/validation/sdd-7/README.md` e SDD fase 7.

## ADR-029 — Upload local com grant cifrado de uso único

- **Data:** 2026-10-05
- **Status:** implementada; integrada à main em 2026-10-15 (1.21.0). A PR #57 foi mesclada na branch da PR #56 depois de a #56 já estar na main, e o registro ficou fora da main até essa data. Revisão pendente.
- **Contexto:** SDD 8.3 exige arquivos locais/grandes sem base64 na conversa, mantendo autorização do PAT pelo gateway.
- **Escolha:** AES-256-GCM, nonce reservado em memória por dez minutos, validação multipart em temporário privado e envio por stream; consumo por tentativa.
- **Justificativa:** não expõe PAT em claro; revalida permissões atuais; evita upload upstream de multipart inválido e buffers de 50 MB na memória.
- **Alternativas consideradas:** base64 (limite/custo na conversa); passthrough imediato (poderia persistir primeira parte antes de rejeitar uma segunda); buffers completos (picos de memória); Redis para nonce (adiado enquanto há uma réplica).
- **Consequências:** link é credencial temporária; erro requer novo link; reinício invalida pendentes. Dois uploads simultâneos limitam disco a cerca de 100 MB; queda abrupta pode deixar temporários até recriar container. Rate limit por peer usa express-rate-limit, middleware reconhecido pelo CodeQL, com proteção IPv6 e headers padrão; é conservador atrás do proxy. O limitador customizado inicial foi substituído após o scanner apontar falta de middleware reconhecido, sem ignorar a regra. O router fallback de api.operum.adm.br cobre também /uploads/: o domínio dedicado não resolveu em verificação DNS em 05/10/2026, enquanto api.operum.adm.br resolveu; nenhuma alteração de DNS/produção foi realizada. Importação para existente preserva cadastro e não é atômica entre serviços.
- **Condições de revisão:** múltiplas réplicas exigem reserva Redis atômica; rate limit por IP real exige proxy explicitamente confiável; importações concorrentes podem exigir lock por projeto.
- **Referências:** `mcp-server/src/uploadLink.ts`, `uploadRoute.ts`, `migration/importer.ts`, `mcp-server/README.md`, SDD 8.1/8.3.

## ADR-047 — Organizar define o formato da EAP inteira, com formato próprio por fase

- **Data:** 2026-10-16
- **Status:** implementada; regra de folhas no modo Padrão substituída pela ADR-048. Substitui a ADR-043 na regra de layout por nó e nos layouts "Horizontal (topo)" e "Horizontal (base)". Os ícones e o select da ADR-043 continuam.
- **Contexto:** o documento "08 - Ajustes e melhorias sistema Operum 16-10-26" mostra como cada opção do Organizar deve desenhar a EAP. Os modelos são:
  - Padrão: Churrasco;
  - Esquerda: Projeto Café e Citrolente, com 4 níveis;
  - Direita: suporte para vara de pesca;
  - Horizontal: Pintar uma sala.

  O documento também pede para remover "Horizontal (topo)" e "Horizontal (base)" e permitir que cada fase tenha formato próprio, Esquerda ou Direita. Na ADR-043, o layout valia só para os filhos do item selecionado. Assim, nenhum modelo saía com um clique só: na Direita, por exemplo, as fases ficavam empilhadas em vez de lado a lado.
- **Escolha:** o layout da raiz passa a ser o formato da EAP inteira: `LADO_A_LADO` (Padrão), `ESQUERDA`, `DIREITA` ou `HORIZONTAL`. Numa fase (1º nível), `ESQUERDA` ou `DIREITA` vira formato próprio dela e de tudo abaixo; qualquer outro valor faz a fase seguir a EAP. O layout guardado abaixo das fases não é usado. O motor (`lib/wbsLayout.ts`, função `planejar`) decide o arranjo dos filhos de cada nó pelo formato e pela profundidade:
  - Padrão: filhos lado a lado; se todos os filhos visíveis forem folhas, eles empilham com a linha perto da borda esquerda do pai.
  - Esquerda e Direita: fases lado a lado; abaixo delas, filhos empilhados à esquerda ou à direita da linha que desce do centro do pai.
  - Horizontal: a raiz fica em pé à esquerda, com texto na vertical, só na visão gráfica, e cada nível ocupa uma coluna.

  O painel de propriedades mostra "Formato da EAP" ou "Formato da fase". A migration `20261016010000_wbs_remover_horizontal_topo_base` recria o enum e converte topo e base em `HORIZONTAL`.

  **Correção em 1.31.1:** a 1.31.0 tinha um select "Fase" separado e mudava só a raiz. Como o padrão antigo `ABAIXO` virou `DIREITA` em todos os nós, toda fase antiga tinha formato próprio Direita, e só o Horizontal mudava o desenho. Agora o Organizar:
  - sem fase selecionada, muda a EAP inteira (`SET_EAP_FORMAT`): a raiz recebe o formato e todos os outros nós voltam a `LADO_A_LADO`;
  - com fases selecionadas, vira "Organizar fase" e muda só elas.

  A migration `20261016020000_wbs_fases_seguem_eap` põe `LADO_A_LADO` em todos os nós abaixo da raiz.
- **Justificativa:** o documento descreve formatos de árvore inteira, não de um nó. Guardar o formato na raiz evita gravar o layout em todos os nós e faz itens novos seguirem o formato sem nenhuma ação. Reaproveitar o valor da fase como formato próprio atende o pedido sem nova coluna no banco.
- **Alternativas consideradas:**
  - aplicar o layout escolhido a toda a subárvore: itens criados depois ficariam com o padrão e quebrariam o desenho;
  - uma coluna nova de formato no projeto ou na EAP: exigiria migration de dados e mais um contrato no `.wbs`, sem ganho sobre a raiz;
  - manter o layout por nó em qualquer nível: o documento só pede variação por fase.
- **Consequências:**
  - EAPs cuja raiz estava em Direita ou Esquerda passam a mostrar as fases lado a lado.
  - Fases que estavam em Direita ou Esquerda voltam a seguir a EAP (migration da 1.31.1), inclusive as ajustadas entre a 1.31.0 e a 1.31.1.
  - Layouts gravados em níveis mais fundos deixam de ter efeito, mas continuam no banco.
  - `.wbs` antigos com topo ou base viram Horizontal na importação.
  - Na visão com detalhes, a raiz do Horizontal fica deitada, porque o texto dos cartões não caberia em pé.
- **Condições de revisão:** pedido de formato próprio em níveis abaixo das fases, de outros formatos por fase (ex.: Horizontal) ou de cores por nível, como nos modelos.
- **Referências:** `lib/wbsLayout.ts`, `components/wbs/WbsMenubar.tsx`, `components/wbs/WbsPropertiesPanel.tsx`, `components/wbs/OrganizarIcons.tsx`, `components/wbs/WbsNode.tsx`, `lib/wbsExportSvg.ts`, `lib/validation/wbsSchemas.ts`, migrations `20261016010000_wbs_remover_horizontal_topo_base` e `20261016020000_wbs_fases_seguem_eap`, `lib/wbsReducer.ts` (`SET_EAP_FORMAT`).

## ADR-046 — Lançamentos de tempo editáveis, validados e com limite de 12 h no timer

- **Data:** 2026-10-16
- **Status:** implementada.
- **Contexto:** ao corrigir os tempos do projeto Operum em 16/10, apareceram três falhas: um timer esquecido contou 312h45 (30/09 a 13/10); a tela oferecia editar lançamento, mas a rota `PATCH /time-entries/:id` não existia (404 em produção); e o lançamento manual aceitava sobreposição com outro do mesmo usuário e qualquer duração.
- **Escolha:** rota de edição no sprint-service; validação única para manual e edição (intervalo válido, não no futuro, até 12 h, sem sobreposição do mesmo usuário); timer limitado a 12 h, encerrado no limite ao parar ou ao ser lido, marcado com `[Revisar]` e com aviso ao dono pelo notification-service.
- **Justificativa:** fechar o timer vencido nas leituras evita depender de um agendador, que o sprint-service não tem, e garante que nenhum total passe do limite. Recusar sobreposição mantém a soma de horas fiel (uma pessoa não trabalha em dois cards ao mesmo tempo). 12 h cobre um dia longo de trabalho sem permitir que um esquecimento vire dias.
- **Alternativas consideradas:** job periódico para encerrar timers (precisaria de agendador e fila no sprint-service); encerrar no momento da última atividade do usuário (não há sinal de atividade confiável); permitir sobreposição com aviso (deixaria somas erradas).
- **Consequências:** lançamentos manuais acima de 12 h precisam ser divididos. O aviso ao dono depende de `NOTIFICATION_SERVICE_URL` e é best-effort. A edição muda o fim do lançamento (o início é mantido quando só a duração muda). O teto de 168 h do MCP passa a ser, na prática, 12 h, porque a API recusa acima disso.
- **Condições de revisão:** pedido de limite configurável por projeto ou de turnos maiores que 12 h.
- **Referências:** `sprint-service/src/time-entry/regras-tempo.ts`, `time-entry.service.ts`, `time-entry.controller.ts`, `aviso-timer.ts`, `lib/avisoTimer.ts`, `components/card/CardTimer.tsx`, `components/card/TimeEntryList.tsx`.

## ADR-045 — Card precisa de responsável a partir de "Em andamento"

- **Data:** 2026-10-15
- **Status:** implementada.
- **Contexto:** havia cards concluídos sem responsável. O usuário definiu em 15/10: até "A Fazer" o card pode ficar sem responsável; a partir de "Em andamento" precisa ter; o gerente do projeto deve saber quais cards estão sem responsável e conseguir definir alguém; ao iniciar o timer num card sem responsável, quem iniciou vira o responsável.
- **Escolha:** a regra fica no sprint-service (mover para a coluna e remover o último responsável), para valer em todos os clientes (tela, MCP, API). Ela é espelhada no app para a planilha, que grava responsáveis direto (ADR-044). O timer torna responsável quem o iniciou, na tela e no MCP. O quadro mostra um aviso com atribuição rápida para quem tem `quadro:cards`.
- **Justificativa:** no serviço, a regra não depende de cada cliente lembrar dela; o `operum_move_task` do MCP também passa a respeitá-la. Bloquear só o movimento (e não a edição) não trava cards antigos que já estão nessas colunas sem responsável; esses cards aparecem para o gerente resolver.
- **Alternativas consideradas:** regra só nas actions do app (o MCP e a API passariam por fora); recusar o timer em card sem responsável (o usuário preferiu atribuir automaticamente); bloquear a criação direto na coluna (quebraria o fluxo da tela, que cria e depois adiciona os responsáveis); notificação periódica aos gerentes (o aviso no quadro aparece sempre que há pendência, sem gerar volume).
- **Consequências:** arrastar um card sem responsável para "Em andamento" ou depois mostra o erro e o card volta. O `operum_start_timer` pode adicionar o dono do token como responsável. A regra existe em dois arquivos com teste de paridade. A notificação do membro inativo (ADR-041) continua sendo o aviso ativo ao gerente; os demais casos aparecem no quadro.
- **Condições de revisão:** pedido de notificação periódica, de bloquear também a criação ou de outra coluna de corte.
- **Referências:** `sprint-service/src/card/responsavel-obrigatorio.ts`, `sprint-service/src/card/card.service.ts`, `lib/responsavelObrigatorio.ts`, `app/actions/time.ts`, `mcp-server/src/tools/time.ts`, `components/sprint/CardsSemResponsavel.tsx`, `services/wbsService.ts`.

## ADR-044 — Elaborado por da planilha são os responsáveis do card

- **Data:** 2026-10-15
- **Status:** implementada.
- **Contexto:** o card "Elaborado por e responsáveis tem que estar conectados" apontou que uma tarefa podia ter responsável no card e nenhum Elaborado por na planilha, e que a planilha aceitava só uma pessoa. O usuário definiu em 15/10: os dois são o mesmo dado, com várias pessoas, sincronizado nos dois sentidos; na primeira vez, juntar o que existe dos dois lados; com várias pessoas, o custo da tarefa é a soma (todos trabalham o tempo inteiro).
- **Escolha:** os responsáveis do card (`CardResponsible`) são a fonte; o nó da EAP espelha a lista em `elaboradoPorUserIds`, mantendo `elaboradoPorUserId` e `elaboradoPor` preenchidos. A planilha grava no card na mesma transação; o modal do card espelha no nó na hora; a sincronização EAP ↔ sprint junta os dois lados uma vez por nó (`elaboradoSincronizado`) e depois só espelha o card. Custo = tempo × soma dos valores por minuto; dias pela menor jornada.
- **Justificativa:** uma fonte única evita que os dois lados divirjam; o card já tem notificação, filtros e regras (membro inativo, ADR-041), então a planilha passa a herdar isso. A marca de "já sincronizado" impede que alguém removido do card volte pelo valor antigo do nó.
- **Alternativas consideradas:** planilha como fonte (o card perderia responsáveis definidos no quadro); sincronizar sempre por união (ninguém sairia do card); custo pela média ou dividindo o tempo (o usuário escolheu a soma); dias pela maior jornada (subestimaria a duração).
- **Consequências:** na primeira sincronização de cada projeto após o deploy, quem estava no Elaborado por entra como responsável do card, **sem notificação** (carga em lote). O quadro de elaboradores pode somar mais de 100%. A escrita pela planilha toca `CardResponsible` direto pelo Prisma, como a sincronização EAP ↔ sprint já faz com `Card`, e não pelo sprint-service. Mudanças de responsáveis feitas pelo MCP/API só aparecem na planilha na próxima sincronização.
- **Condições de revisão:** pedido de custo por fração de tempo de cada pessoa, ou de notificar quem entrou pela carga inicial.
- **Referências:** `lib/elaboradores.ts`, `services/wbsService.ts` (`updateNodeProperties`, `refletirResponsaveisNoNo`, passo 5b de `sincronizarEapComSprint`), `lib/planilhaCustos.ts`, `lib/wbsRollup.ts`, `lib/permissoesCustos.ts`, `components/custos/ElaboradoresSelect.tsx`, `app/actions/cardResponsible.ts`.

## ADR-043 — Seis layouts do menu Organizar da EAP, sem "Abaixo"

- **Data:** 2026-10-15
- **Status:** substituída em parte pela [ADR-047](#adr-047--organizar-define-o-formato-da-eap-inteira-com-formato-próprio-por-fase) (formato da EAP inteira e remoção de topo e base). Antes, tinha substituído os layouts `ABAIXO` e `ABAIXO_L` da fase 6 (SDD 6.2; não havia ADR própria).
- **Contexto:** o card "Em EAP, adicionar o jeito de visualizar que está no vídeo" voltou com 6 ícones SVG desenhados pelo usuário, com o pedido de seguir exatamente esses desenhos, apresentá-los como um select (como no vídeo de referência) e remover o "Abaixo".
- **Escolha:** o enum `WbsLayoutOrientation` passa a ter `LADO_A_LADO`, `DIREITA`, `ESQUERDA`, `HORIZONTAL`, `HORIZONTAL_TOPO` e `HORIZONTAL_BASE`. A migration recria o tipo, porque o PostgreSQL não remove valores de enum, e converte os valores antigos para `DIREITA`. A validação normaliza `.wbs` antigos e o motor desenha valores desconhecidos como Direita. O motor (`lib/wbsLayout.ts`) passa a guardar `rootY` por subárvore. Organizar e Visualização usam um select de ícones (`ToolbarSelect`).
- **Justificativa:** um conjunto fechado com o desenho do usuário evita opções parecidas entre si. "Abaixo com L" era o mesmo arranjo da Direita, com outro recuo. Recriar o enum mantém o schema igual ao banco, sem valores mortos.
- **Alternativas consideradas:** manter `ABAIXO`/`ABAIXO_L` no banco e só escondê-los na tela (sobrariam valores que a interface não sabe editar); converter `ABAIXO` para `LADO_A_LADO` (mudaria mais a aparência de árvores existentes do que `DIREITA`).
- **Consequências:** nós que estavam em Abaixo ou Abaixo com L aparecem em Direita depois da migration. A migration troca o tipo da coluna `WbsNode.layout` dentro de uma transação. O documento da EAP (`lib/eapLayout.ts`) segue o layout próprio do modelo do professor e não muda.
- **Condições de revisão:** pedido de novos arranjos (ex.: radial) ou de aplicar o layout à árvore inteira de uma vez.
- **Referências:** `lib/wbsLayout.ts`, `components/wbs/OrganizarIcons.tsx`, `components/wbs/ToolbarSelect.tsx`, `components/wbs/WbsMenubar.tsx`, `lib/validation/wbsSchemas.ts`, migration `20261015010000_wbs_layouts_organizar`, SDD 6.2.

## ADR-042 — SVG como anexo, só sem conteúdo ativo e sem execução

- **Data:** 2026-10-15
- **Status:** implementada; substitui a exclusão de SVG da lista de anexos (registrada só no comentário de `lib/attachmentTypes.ts`: "SVG e HTML ficam de fora de propósito: executariam script ao abrir o link"; sem ADR própria).
- **Contexto:** o usuário precisou anexar ícones `.svg` (menu Organizar da EAP) e o anexo recusava. SVG é XML que o navegador executa: script, handlers, links e recursos externos.
- **Escolha:** aceitar `image/svg+xml` com três barreiras: recusa no upload de qualquer conteúdo ativo (regra de recusa, não de limpeza), objeto gravado com `Content-Disposition: attachment` e pré-visualização da origem do app com CSP `sandbox` + `default-src 'none'` e `nosniff`.
- **Justificativa:** ícones e desenhos comuns não usam nada do que é recusado; recusar é determinístico e não depende de um sanitizador manter a lista em dia. As barreiras de entrega cobrem um eventual SVG que passe pela validação, inclusive arquivos antigos gravados por outros caminhos.
- **Alternativas consideradas:** sanitizar com DOMPurify no file-service (mais SVGs aceitos, mas nova dependência e o arquivo gravado deixa de ser o enviado); converter para PNG no upload (perde o vetor); continuar recusando (o usuário pediu).
- **Consequências:** SVG com `<a>`, `<use>`, `<image>`, animação ou links é recusado com mensagem pedindo um SVG simples ou PNG. Abrir o SVG pela URL do storage baixa o arquivo; a visualização fica no lightbox.
- **Condições de revisão:** pedido de SVG com `use`/gradientes externos ou animações, ou migração do storage para um domínio que aceite cabeçalhos de CSP por objeto.
- **Referências:** `file-service/src/upload/svg-safety.ts`, `file-service/src/upload/upload.service.ts`, `file-service/src/minio/minio.service.ts`, `app/api/files/[attachmentId]/image/route.ts`, `lib/attachmentTypes.ts`, `mcp-server/src/attachmentTypes.ts`.

## ADR-041 — Membro da equipe inativado perde o acesso e continua nos cards

- **Data:** 2026-10-15
- **Status:** implementada.
- **Contexto:** o card "Desativar um stakeholder" voltou do teste porque o usuário não encontrou a função: a 1.16.0 só inativava stakeholders externos, por um ícone na linha. O usuário definiu em 15/10: inativar vale também para membros da equipe; o membro inativo perde o acesso ao projeto; as tarefas que ele já fez ou em que trabalhou continuam com ele, mas pedem outro responsável para serem concluídas; o gerente do projeto recebe uma notificação de pendência.
- **Escolha:** reaproveitar `UserProject.active = false` (o mesmo campo do desvincular e da autorização) e diferenciar a inativação por `inactiveReason`/`inactivatedAt` não nulos. Rota `PATCH /projects/:id/members/:userId/situacao` no project-service. Card cujos responsáveis estão todos inativos ganha aviso e não vai para a coluna de conclusão pelas actions do quadro; os gerentes recebem a lista desses cards por notificação. Gerente do projeto e o próprio usuário não podem ser inativados por essa ação.
- **Justificativa:** usar o mesmo `active` garante a perda de acesso em todos os caminhos (gateway, páginas, listagens) sem duplicar regra; o motivo separa "saiu, mas o histórico importa" de "foi removido por engano". O bloqueio no servidor vale para a tela e não depende só do aviso visual.
- **Alternativas consideradas:** flag própria de inativo mantendo o acesso (o usuário escolheu perder o acesso); remover o membro dos cards ao inativar (perderia o histórico pedido); bloquear também no sprint-service (amplia o contrato do serviço e afetaria MCP/API; adiado).
- **Consequências:** inativos somem das listas de escolha de responsável e de "Elaborado por" (que usam `active = true`), mas continuam nos cards antigos. Movimentos para a conclusão feitos direto no sprint-service (MCP/API) não são bloqueados. Inativar um gerente exige tirar o papel antes, para ele não continuar como "Gerente do projeto" nos documentos.
- **Condições de revisão:** pedido para bloquear também via MCP/API, para inativar gerentes direto ou para reatribuir os cards automaticamente.
- **Referências:** `project-service/src/project/project.service.ts` (`setMemberSituacao`), `app/actions/projetos.ts` (`setMembroAtivoAction`), `services/membroInativo.ts`, `lib/responsavelInativo.ts`, `app/actions/sprintBoard.ts`, `components/projetos/ProjetoStakeholdersClient.tsx`, migration `20261015000000_user_project_inactive_reason`.

## ADR-040 — Funções e departamentos sem associação por projeto

- **Data:** 2026-10-14
- **Status:** implementada; substitui a associação por projeto de funções/departamentos (cadastros por projeto, `cadastros:gerenciar` para associar — ver ADR de autorização da fase 5). As funções já eram globais nos Stakeholders desde 26/09/26; os departamentos ainda eram restritos.
- **Contexto:** o usuário pediu para remover a obrigação de associar funções e departamentos a cada projeto: todos devem poder ser escolhidos.
- **Escolha:** todo o catálogo do tenant vale em qualquer projeto; telas, actions e serviço de associação foram removidos; as rotas antigas redirecionam para Stakeholders; excluir item do catálogo limpa associações antigas em vez de bloquear. As tabelas ficam (sem migration); `ProjetoDepartamento` segue espelhando o campo Departamentos do projeto.
- **Justificativa:** a associação era um passo extra sem regra de negócio que dependesse dela.
- **Alternativas consideradas:** manter a associação como destaque opcional (mantinha telas e confusão sobre por que associar).
- **Consequências:** listas de escolha mostram o catálogo inteiro do tenant; `ProjetoFuncao` fica sem uso e pode ser removida numa migration futura.
- **Referências:** `app/projetos/[projetoId]/stakeholders/page.tsx`, `components/layout/ProjectSidebar.tsx`, `app/actions/departments.ts`, `app/actions/roles.ts`, SDD 12.21.

## ADR-039 — Motivo obrigatório e histórico na exclusão de sprint

- **Data:** 2026-10-14
- **Status:** implementada.
- **Contexto:** o usuário pediu que excluir uma sprint com dados exija justificativa e que o histórico de alterações seja salvo. Com o ADR-038, excluir uma fase na EAP também exclui a sprint.
- **Escolha:** "com dados" = cards abertos ou horas registradas nos cards. Sem motivo (mín. 5 caracteres), a exclusão é recusada no servidor (quadro e EAP). Criação, alteração e exclusão de sprint vão para a auditoria existente (`AuditLog`, entity `Sprint`), com campos de → para, motivo e resumo; a página Sprints do projeto exibe esse histórico.
- **Justificativa:** reaproveita a auditoria já usada por documentos e EAP, sem migration; a regra no servidor vale também para chamadas fora da tela.
- **Alternativas consideradas:** tabela própria de histórico de sprint (migration nova, sem ganho sobre `AuditLog`); motivo em toda exclusão (atrito sem necessidade em sprints vazias).
- **Consequências:** a exclusão feita direto no sprint-service/gateway (fora das actions do app, ex.: MCP) não exige motivo nem grava este histórico. A busca por projeto usa filtro JSON em `details.projectId`.
- **Referências:** ADR-038, `services/sprintHistoricoService.ts`, `app/actions/sprints.ts`, `components/sprint/DeleteSprintButton.tsx`, `components/sprint/HistoricoSprints.tsx`, `__tests__/unit/sprintHistorico.test.ts`, SDD 12.19.

## ADR-038 — Excluir na EAP exclui o card e a sprint ligados

- **Data:** 2026-10-14
- **Status:** implementada.
- **Contexto:** o usuário relatou que excluir um item na EAP dava conflito e não excluía. Além do conflito de versão, mesmo uma exclusão gravada voltava: a sincronização EAP ↔ sprint (ADR-033/034) via o card ou a sprint ainda abertos e recriava o nó.
- **Escolha:** o autosave do editor e `deleteNode` excluem (soft delete) o card dos nós removidos; uma fase removida exclui a sprint, com os cards restantes indo para o fim do backlog (mesma regra do `remove` do sprint-service). Card/sprint ainda referenciados por outro nó salvo não são excluídos; importação de EAP não reflete exclusões. Cópias (copiar/colar, duplicar) não herdam o vínculo.
- **Justificativa:** com a sincronização nos dois sentidos, a EAP é uma visão do mesmo trabalho da sprint; excluir de um lado sem excluir do outro faz o item reaparecer.
- **Alternativas consideradas:** guardar uma lista de itens "excluídos da EAP" para a sincronização ignorar (mantém cards sem lugar na EAP); só desvincular (o card voltaria como nó novo).
- **Consequências:** excluir uma fase na EAP exclui a sprint dela; os cards excluídos ficam com `deletedAt` (recuperáveis no banco), como as exclusões feitas no quadro.
- **Referências:** ADR-033, ADR-034, `services/wbsService.ts` (`refletirExclusoesDaEap`), `lib/wbsReducer.ts`, `components/wbs/WbsContext.tsx`, `__tests__/unit/wbsExclusaoReflete.test.ts`, SDD 12.18.

## ADR-037 — Nível 2 da EAP sempre é sprint e a planilha define datas e custos

- **Data:** 2026-10-14
- **Status:** implementada; amplia o ADR-034 (antes, só sprints existentes ganhavam nó no nível 2).
- **Contexto:** o usuário tinha "1.1 Sprint 1" e "1.2 Fase 2" na EAP, mas só "Sprint 1" na aba Sprints, e definiu que cada fase da EAP é uma sprint com o nome "1.2 Fase 2". Também definiu que a data fim da sprint é a maior data prevista das atividades na planilha de custos, que a data fim do projeto é a maior data fim das fases e que isso alimenta a Data Limite e o custo (valor orçado) do cronograma financeiro em Editar projeto.
- **Escolha:** `sincronizarEapComSprint` cria a sprint (com as colunas padrão do sprint-service) para todo nó do nível 2 sem sprint e regrava o nome como "código título"; `propagarPlanilhaDeCustos` grava `dataLimite`/`custo` no nó da fase, `Sprint.endDate` e `Project.endDate`, só quando há valor calculado.
- **Justificativa:** uma única fonte para fases, sprints e datas evita cadastro duplicado; manter o valor manual quando a planilha não tem dados preserva o fluxo atual.
- **Alternativas consideradas:** mostrar o código só na tela, sem gravar no nome da sprint (o nome sairia sem código em listas, MCP e relatórios); data de início também pela planilha (não foi definida pelo usuário).
- **Consequências:** macrofases do nível 2 viram sprints; o nome da sprint muda quando a EAP é renumerada; datas e custos digitados à mão são sobrescritos assim que a planilha tem dados. As colunas padrão ficam duplicadas como constante no monolito.
- **Referências:** ADR-034, `services/wbsService.ts`, `services/planilhaService.ts`, `lib/planilhaCustos.ts`, `__tests__/unit/wbsSprintSync.test.ts`, `__tests__/unit/aplicarResumoPlanilha.test.ts`, SDD 12.14–12.15.

## ADR-036 — Cards do backlog fora da EAP

- **Data:** 2026-10-14
- **Status:** implementada; substitui, do ADR-033, a criação de card no backlog a partir de folha da EAP e a criação de nós a partir de cards do backlog.
- **Contexto:** o usuário viu cards do backlog no nível 2 da EAP/WBS, como se fossem sprints (nós criados pela 1.16.0), e pediu que cards do backlog não apareçam na EAP nem na planilha de custos.
- **Escolha:** `sincronizarEapComSprint` remove o nó ligado a card do backlog quando ele está solto no nível 2 ou dentro de um nó de sprint (card que voltou ao backlog); não cria mais card no backlog a partir de folha da EAP (sem sprint, a folha fica sem card). Folhas sob um nível 2 que não é sprint, ligadas a card do backlog, são preservadas por serem estrutura montada pelo usuário.
- **Justificativa:** a planilha de custos lê a mesma árvore; remover o nó é o que tira o card das duas telas sem filtro duplicado.
- **Alternativas consideradas:** filtrar na leitura (exigiria tratar `saveTree`, códigos e rollups de custo separadamente); remover também as folhas sob nível 2 que não é sprint (apagaria estrutura do usuário).
- **Consequências:** dados do nó removido (tempo, custo) se perdem; se o card voltar a uma sprint, o nó é recriado dentro dela sem esses dados.
- **Referências:** ADR-033, ADR-034, `services/wbsService.ts`, `__tests__/unit/wbsSprintSync.test.ts`, SDD 12.13.

## ADR-035 — Documento EAP lê a aba EAP/WBS e quadro padronizado nos documentos

- **Data:** 2026-10-14
- **Status:** implementada.
- **Contexto:** o documento EAP tinha árvore própria, copiada do modelo e editada à parte da aba EAP/WBS; o usuário pediu que ele seja preenchido com os dados da aba. Também definiu a regra: "Gerente do projeto" automático em todos os documentos e campos de pessoa como select de membro com botão de adicionar, em componentes compartilhados.
- **Escolha:** `GET /api/projects/:id/eap` monta a árvore a partir de `WbsNode` (`eapNodesFromWbs`) e o PUT grava essa estrutura na versão; o editor do documento deixa a estrutura só para leitura quando há WBS. O gerente vem de `gerenteDoProjeto` (fonte única para Termo, Partes Interessadas e EAP). Os campos do quadro ficam em `CamposQuadroDocumento`.
- **Justificativa:** uma só fonte da estrutura evita duas EAPs divergentes; o gerente cadastrado evita digitação e inconsistência entre documentos.
- **Alternativas consideradas:** botão "importar da WBS" mantendo árvore editável no documento (as duas voltariam a divergir).
- **Consequências:** projetos sem WBS continuam com a estrutura do modelo; versões já salvas mantêm a árvore que tinham.
- **Referências:** `lib/eapFromWbs.ts`, `services/gerenteProjeto.ts`, `components/projetos/documentacao/CamposQuadroDocumento.tsx`, `app/api/projects/[projetoId]/eap/route.ts`, SDD 12.11–12.12.

## ADR-034 — Nível 2 da EAP representa as sprints

- **Data:** 2026-10-14
- **Status:** implementada; substitui o posicionamento de nós do ADR-033 (cards sem nó como filhos da raiz). Validação com dados reais pendente.
- **Contexto:** após a 1.16.0, os nós criados a partir de cards apareceram no nível 2, como filhos diretos do projeto. O usuário definiu a estrutura: nível 2 são as sprints e do nível 3 para baixo ficam os cards; os cards devem mostrar o código da EAP ("1.1.1 - Fazer isso").
- **Escolha:** guardar `sprintId` em `WbsNode.properties` dos nós do nível 2. A reconciliação (`sincronizarEapComSprint`) cria/vincula um nó de nível 2 por sprint não excluída, cria nós de card dentro do nó da sprint, move o nó quando o card muda de sprint (inclusive os deixados no nível 2 pela 1.16.0) e só transforma em card as folhas do nível 3+, na sprint do seu nível 2 (nível 2 que não é sprint, como uma macrofase: sprint ativa/planejada). O código é exibido no quadro a partir de `WbsNode.code`, sem alterar `Card.title`.
- **Justificativa:** segue a estrutura pedida sem migration nem mudança no sprint-service; mantém o código como dado derivado da EAP, que muda ao reordenar a árvore.
- **Alternativas consideradas:** gravar o código no título do card (ficaria desatualizado ao renumerar e entraria no sync de títulos); criar sprints a partir de nós de nível 2 (não adotado: macrofases também ficam no nível 2 e criar sprint exige colunas/datas).
- **Consequências:** nós do nível 2 sem sprint não viram cards; card do backlog sem nó não aparece na EAP; o nome da sprint e o título do nó convergem para o lado alterado por último; um card criado no quadro só mostra o código depois do próximo carregamento.
- **Condições de revisão:** pedido para criar sprints a partir da EAP, para levar backlog à EAP ou para exibir o código em outras telas de cards.
- **Referências:** ADR-033, `services/wbsService.ts`, `app/actions/sprintBoard.ts`, `components/card/Card.tsx`, `__tests__/unit/wbsSprintSync.test.ts`, SDD 12.9.

## ADR-033 — EAP e sprint sincronizadas por vínculo no nó

- **Data:** 2026-10-14
- **Status:** implementada; posicionamento dos nós substituído pelo ADR-034 (nível 2 = sprints).
- **Contexto:** o cliente pediu que tudo da EAP apareça na sprint e que cards criados na sprint apareçam na EAP e na planilha de custos (card `cmuy87qbk000c01pmfo11m6s1`, SDD 12.8). Não havia vínculo entre `WbsNode` (monolito) e `Card` (sprint-service); o banco é compartilhado.
- **Escolha:** guardar `cardId` em `WbsNode.properties` e reconciliar, de forma idempotente, ao abrir EAP, planilha e quadro da sprint (`sincronizarEapComSprint`, `services/wbsService.ts`). Folhas viram cards em "A Fazer" da sprint ativa; cards sem nó viram filhos da raiz. Escolhas do usuário: só folhas; coluna "A Fazer" com sincronização, sem duplicar por título.
- **Justificativa:** evita migration e mudança de contrato no gateway/sprint-service; o `properties` já é validado e preservado por `saveTree`.
- **Alternativas consideradas:** coluna `wbsNodeId` em `Card` (exige migration nos dois schemas e no gateway); todos os nós como cards (volume); visão só de leitura da EAP.
- **Consequências:** sincronização ocorre ao abrir as telas, não em tempo real; só título e descrição inicial convergem; o lado alterado por último vence; card excluído não é recriado; um `saveTree` de cliente antigo pode perder o `cardId` (religa por título).
- **Condições de revisão:** necessidade de tempo real, de sincronizar responsável/prazo/custo ou de extrair EAP para serviço próprio.
- **Referências:** `services/wbsService.ts`, `services/eapSprintSyncService.ts`, `__tests__/unit/wbsSprintSync.test.ts`, SDD 12.8.

## ADR-032 — Alertas locais independentes do destino externo

- **Data:** 2026-10-05
- **Status:** aceita nesta implementação; substitui parcialmente ADR-026 quanto à obrigatoriedade de destino externo no deploy.
- **Contexto:** deploy após a PR #59 abortou com mensagem única para chave de métricas e webhook. O destino externo não foi informado; .env.example apresenta webhook vazio. Não houve inspeção dos valores reais da VPS. O usuário pediu correção do bloqueio; solicitou-se o destino e adotou-se provisoriamente alertas locais, com aviso explícito.
- **Escolha:** chave interna obrigatória; webhook opcional. Vazio gera receiver sem integração de envio e aviso, preservando regras/alertas locais. URL preenchida deve ser HTTP(S) válida. Preflight valida o ambiente Compose incoming contra o .env da VPS antes de alterar configuração ativa. Diagnósticos separados, sem valores secretos.
- **Justificativa:** falta de canal de envio não deve impedir métricas privadas, logs, regras e disponibilidade da aplicação; estado de envio pendente permanece visível. Segurança da chave interna não recebe fallback.
- **Alternativas consideradas:** exigir destino ainda desconhecido mantém bloqueio; inventar endpoint/envio externo não tem autorização/destino; ignorar configuração inteira desabilitaria observabilidade e proteção das métricas.
- **Consequências:** sem webhook não há notificações externas; o operador deve configurar canal compatível quando disponível. CI valida ambos os formatos com amtool e mantém ensaio de entrega sintética. Uma URL sintaticamente válida não prova disponibilidade/compatibilidade do receptor real.
- **Condições de revisão:** destino externo confirmado, política operacional que torne entrega externa mandatória ou suporte a outros receivers.
- **Referências:** ADR-026, scripts/deploy/configure-observability.py, remote-deploy.sh, scripts/validation/observability-config.mjs, observability.sh, .env.example, relato do usuário após PR #59.


## ADR-048 — Planilha como origem dos dados apresentados no card e sincronização de conclusão

- **Data:** 2026-10-19
- **Status:** implementada. Substitui a escolha de empilhar folhas do modo Padrão da ADR-047; mantém os formatos da EAP e os formatos próprios por fase.
- **Contexto:** as tarefas de 19/10 registram fases vazias e recolhidas mudando o layout, divergências entre EAP/planilha/cards e Dados Complementares sem edição. A planilha já guarda minutos e valores, enquanto `TimeEntry` representa apontamentos efetivos do timer.
- **Escolha:** Padrão sempre lado a lado e conectores pelo centro inferior. A planilha fornece os dados detalhados do card; datas e conclusão explícita sincronizam os campos existentes e a coluna da sprint com histórico idempotente. Minutos de planilha não criam apontamento de tempo. Dados Complementares usam o serviço de versões do Termo; o menu de projeto reúne edição e documentos. Aprovado por é o gerente do cadastro; elaborador escolhido fica congelado por versão.
- **Justificativa:** evita duas contas para os mesmos valores e mantém a distinção entre tempo informado na planilha e tempo efetivamente registrado; libera a edição preservando aprovação, histórico e permissões.
- **Alternativas consideradas:** duplicar custos e minutos em colunas do Card (mais uma fonte a sincronizar); criar TimeEntry a partir do realizado (fabricaria registros de trabalho); escrever diretrizes pelo update genérico (perderia o histórico documental).
- **Consequências:** o modal consulta a linha ao abrir, com permissão financeira; concluir exige responsável ativo. Dados anteriores são reconciliados na abertura das telas autorizadas e na edição da planilha. A migração dos dados do projeto Pintar uma Casa deve ser validada no ambiente em que esses dados residem; testes locais não comprovam atualização em produção.
- **Referências:** `services/planilhaCardSync.ts`, `services/documentRevisionService.ts`, `app/actions/projetos.ts`, `app/actions/sprintBoard.ts`, `lib/wbsLayout.ts`, testes de sincronização, layout e edição do projeto.
- **Revisar quando:** o produto passar a distinguir uma data de conclusão própria do card ou permitir reabrir automaticamente uma conclusão originada na planilha.

## ADR-049 — Exclusão de sprint refletida na EAP e numeração

- **Data:** 2026-10-19.
- **Status:** implementada nesta correção; publicação depende da integração da branch.
- **Contexto:** excluir “1.2 Fase 2” no projeto Operum manteve a fase vazia na EAP/planilha e a próxima sprint como 1.3. O serviço já devolvia os cards ao backlog; o reconciliador não tratava a fase da sprint excluída.
- **Escolha:** reconciliar após a exclusão no painel e nas leituras autorizadas, removendo somente fases de sprints comprovadamente excluídas no mesmo projeto. Recalcular códigos, descendentes e nomes das sprints na mesma transação de reconciliação. Compartilhar o lock por projeto com a exclusão serializável do sprint-service.
- **Justificativa:** manter EAP e planilha com a mesma estrutura, preservar cards/tempos do backlog e recuperar divergências anteriores sem recriar sprint excluída.
- **Alternativas consideradas:** ocultar a fase somente na UI deixaria dados e exportações divergentes; introduzir modelos da EAP no sprint-service ampliaria desnecessariamente sua responsabilidade; manter uma transação aberta através do HTTP criaria acoplamento e bloqueios.
- **Consequências:** exclusão e reconciliação continuam em transações separadas; falha parcial é informada. Atividades movidas para outra sprint preservam suas propriedades; referência desconhecida não autoriza exclusão. Não há migration.
- **Referências:** `app/actions/sprints.ts`, `services/wbsService.ts`, `sprint-service/src/sprint/sprint.service.ts` e testes de exclusão/sincronização.
- **Revisar quando:** EAP ganhar serviço próprio ou for necessário garantir a reconciliação por fila independente de novas leituras.

## ADR-050 — Data de início do projeto derivada da primeira tarefa

- **Data:** 2026-10-21.
- **Status:** implementada nesta entrega (1.34.0); publicação depende da integração da branch.
- **Contexto:** card de 19/10 pede que o início do projeto corresponda à primeira tarefa, atualizado quando a tarefa muda e sem inventar data quando nenhuma tarefa tiver data.
- **Escolha:** `Project.startDate` continua gravado, mas é sincronizado com a menor `Card.startDate` ativa do projeto após criar, editar ou excluir cards pelas actions do quadro e após a Planilha sincronizar os cards (`services/inicioDoProjeto.ts`). `getProjetoAction` devolve a data derivada e `inicioPelaPrimeiraTarefa`; Editar projeto trava o campo quando a data vem de uma tarefa. Sem tarefa com data, vale a data informada.
- **Justificativa:** documentos, Gantt e cronograma já leem `Project.startDate`; manter a coluna gravada evita mudar cada leitor.
- **Alternativas consideradas:** calcular só na leitura (cada leitor precisaria repetir a consulta); gatilho no banco (regra de negócio escondida fora do código).
- **Consequências:** alterações de card feitas diretamente no sprint-service (ex.: MCP) só refletem na próxima alteração pelo painel ou sincronização da Planilha.
- **Referências:** `services/inicioDoProjeto.ts`, `app/actions/sprintBoard.ts`, `app/actions/projetos.ts`, `services/planilhaService.ts`, card `cmvfuzrnf004h01qnk6k3z77l`.
- **Revisar quando:** o sprint-service publicar eventos de alteração de card.

## ADR-051 — Exclusão de projeto bloqueada por dependências

- **Data:** 2026-10-21.
- **Status:** implementada nesta entrega (1.34.0).
- **Contexto:** card de 19/10 pede permitir excluir um projeto só sem dependências, explicando o impedimento; a regra exata ficou para a implementação.
- **Escolha:** contam como dependência sprints e cards ativos, lançamentos de tempo ativos, atas ativas, versões de documentos e outros membros ativos além de quem exclui (`services/projetoDependencias.ts`). A interface verifica antes de confirmar e a action valida de novo no servidor.
- **Justificativa:** o soft delete do projeto deixava esses dados órfãos e invisíveis.
- **Alternativas consideradas:** excluir em cascata (perderia histórico e apontamentos); bloquear só por cards (deixaria atas e documentos órfãos).
- **Consequências:** a exclusão pelo MCP (`operum_delete_project`, que chama o project-service) não passa por essa verificação.
- **Referências:** `services/projetoDependencias.ts`, `app/actions/projetos.ts`, `components/projetos/DeleteProjectButton.tsx`, card `cmvfuz2vj003901qnhtbvvke7`.
- **Revisar quando:** a regra for levada ao project-service para valer também no MCP.

## ADR-052 — Imagens do Word exportado pelo servidor só do storage do Operum

- **Data:** 2026-10-21.
- **Status:** implementada nesta entrega (1.34.0).
- **Contexto:** o `.docx` da ata gerado no servidor não trazia a logo (só o Word montado no navegador tinha), e nenhuma exportação trazia as assinaturas dos presentes.
- **Escolha:** a rota de exportação baixa logo e assinaturas no servidor, apenas de URLs do host de `MINIO_PUBLIC_URL` (`isSafeStorageUrl`), sem seguir redirecionamentos, com 5 s de limite e 5 MB por imagem; tipo e dimensões são lidos dos bytes (PNG, JPEG, GIF). Falha vira documento sem a imagem.
- **Justificativa:** busca no servidor a partir de URL vinda do banco é vetor de SSRF; restringir ao storage mantém o recurso sem abrir a rede interna.
- **Alternativas consideradas:** gerar todo Word no navegador (o link "Exportar .docx" da lista não tem os dados da ata); embutir imagens em base64 no banco.
- **Consequências:** logos hospedadas fora do storage não aparecem no Word do servidor.
- **Referências:** `lib/exports/imagemDocx.ts`, `lib/exports/imagemServidor.ts`, `app/api/atas/[ataId]/export/route.ts`, `lib/storageUrl.ts`, cards `cmvfuz3lp003n01qna2hmswsq`, `cmvfuzka6004501qny5syk1e5`.

## ADR-053 — Documento EAP desenhado com o layout da aba EAP

- **Data:** 2026-10-21.
- **Status:** implementada nesta entrega (1.34.0); complementa a ADR-035 (estrutura da aba) passando a usar também o desenho da aba.
- **Contexto:** o documento lia a estrutura da aba, mas desenhava com layout próprio em colunas e cor única, ignorando o formato do menu Organizar, as cores e os conectores.
- **Escolha:** `GET /api/projects/:id/eap` devolve também a árvore `WbsNode` (`arvore`); o documento atual desenha a EAP gráfica com `computeLayout` e a mesma medição de larguras da aba (`lib/wbsMedidas.ts`), com nós recolhidos expandidos. Versões antigas e projetos sem WBS mantêm o layout em colunas.
- **Justificativa:** um só motor de layout garante que documento e aba não divirjam.
- **Alternativas consideradas:** capturar imagem da aba (dependeria da tela aberta e do zoom); manter o layout do modelo do professor (contraria o pedido de cópia fiel).
- **Consequências:** o documento escala a árvore para caber na página A4; árvores muito largas ficam com texto menor.
- **Referências:** `components/projetos/documentacao/EapGraficaDaAba.tsx`, `components/projetos/documentacao/EapDocumentSheet.tsx`, `lib/wbsLayout.ts`, card `cmvfuznz0004b01qnstet076j`.

## ADR-054 — Conclusão e reabertura entre Planilha e quadro

- **Data:** 2026-10-21.
- **Status:** implementada; complementa a ADR-048 (sincronização de conclusão).
- **Contexto:** a sincronização só concluía cards, não tratava a retirada da conclusão na planilha e procurava uma coluna chamada exatamente "Concluído"; um card reaberto à mão voltava para Concluído a cada leitura.
- **Escolha:** o movimento de conclusão da planilha grava no motivo a chave da conclusão (`data:aaaa-mm-dd` ou `pct:100`). Movimentação manual prevalece: com a mesma chave, um card reaberto à mão não é concluído de novo; uma chave diferente vale. Retirar a conclusão reabre o card só quando o último movimento para a coluna de conclusão foi da planilha, voltando para a coluna de origem (ou a anterior à de conclusão). A coluna de conclusão é reconhecida pelo nome (lista em `isColunaConcluida`) e, sem nenhuma, é a última coluna da sprint (`colunaDeConclusao`). Responsáveis e histórico são preservados.
- **Justificativa:** o histórico de movimentos já distingue origem e momento, sem nova coluna no banco.
- **Alternativas consideradas:** campo `concluidoPelaPlanilha` no Card (migration e mais um estado a sincronizar); planilha sempre prevalecer (desfaria decisões manuais a cada leitura).
- **Consequências:** movimentos antigos sem chave são tratados como chave "legado": um card antigo reaberto à mão pode ser concluído de novo uma vez. Sprint sem colunas é contada como pendência e não é alterada.
- **Referências:** `services/planilhaCardSync.ts`, `lib/cardUtils.ts`, `__tests__/unit/planilhaCardSync.test.ts`, card `cmvfctig2003d01qwbf79ccvv`.

## ADR-055 — Estado da sincronização gravado e repetição sob demanda

- **Data:** 2026-10-21.
- **Status:** implementada; processamento em fila avaliado e não adotado nesta entrega.
- **Contexto:** a reconciliação EAP ↔ planilha ↔ sprints roda ao abrir as telas e as falhas ficavam só no log do servidor; o usuário não sabia se os dados estavam coerentes.
- **Escolha:** tabela `ProjetoSincronizacao` (uma linha por projeto) com situação (`OK`, `PENDENCIAS`, `FALHA`), última tentativa, última conclusão, erro legível e pendências. Cada sincronização grava o estado; `OK` só sem pendências. EAP e Planilha mostram o estado e "Sincronizar agora"/"Tentar novamente" (`repetirSincronizacaoAction`), com as mesmas permissões da abertura (`projeto:editar` + `quadro:cards`). Repetir é seguro: a sincronização é idempotente e serializada por projeto (advisory lock). A sincronização dos cards passou a buscar os cards ligados numa única consulta.
- **Justificativa:** o estado persistido sobrevive a navegação e reinício e deixa a pendência recuperável sem infraestrutura nova.
- **Alternativas consideradas:** fila/worker independente da abertura de telas (exige processo e monitoramento novos; fica para quando projetos grandes tornarem a abertura lenta); mostrar o estado só em memória (perderia a pendência ao navegar).
- **Consequências:** falha registra o motivo sem apagar a última conclusão nem as pendências conhecidas. Edição da planilha que dispara a propagação (`updateNodePropertiesAction`) ainda não atualiza o estado.
- **Referências:** `services/sincronizacaoStatus.ts`, `services/eapSprintSyncService.ts`, `app/actions/sincronizacao.ts`, `components/sincronizacao/StatusSincronizacao.tsx`, migration `20261021020000_projeto_sincronizacao`, card `cmvfctk30003f01qwqnaj9z2e`.
- **Revisar quando:** a abertura da EAP/Planilha ficar lenta em projetos grandes ou surgir worker para tarefas em segundo plano.

## ADR-056 — Rascunho local e mesclagem em três vias nos conflitos da EAP

- **Data:** 2026-10-21.
- **Status:** implementada.
- **Contexto:** num conflito de salvamento, o editor carregava a árvore do servidor e pedia para refazer a alteração; a edição local se perdia. Falha de rede também perdia a edição ao fechar a aba.
- **Escolha:** antes de substituir a árvore (conflito) ou quando o salvamento falha, a edição local e a versão do servidor em que ela se baseou ficam em `localStorage`, na chave `operum:eap-rascunho:{tenant}:{usuário}:{projeto}`, por até 30 dias. Um painel no editor mostra o que ficou pendente, o que pode ser reaplicado e o que conflita. Reaplicar mescla em três vias (`lib/wbsMerge.ts`): só o que a pessoa mudou é aplicado; o que os dois mudaram fica com o servidor e é listado. Aplicar ou descartar apaga o rascunho; o rascunho de falha de rede some quando o próximo salvamento dá certo.
- **Justificativa:** guardar no navegador funciona mesmo sem rede e não grava no servidor nada que a pessoa não confirmou.
- **Alternativas consideradas:** rascunho no servidor (não funciona na falha de rede que se quer cobrir); mesclagem automática sem revisão (aplicaria mudanças sem a pessoa ver os conflitos).
- **Consequências:** o rascunho fica só no navegador onde a edição foi feita. Duas abas do mesmo usuário compartilham a chave: a mais recente prevalece.
- **Referências:** `lib/wbsMerge.ts`, `lib/wbsRascunho.ts`, `components/wbs/RecuperarRascunhoEap.tsx`, `components/wbs/WbsCanvas.tsx`, card `cmvfctgt0003b01qwh2g6ah3r`.

## ADR-057 — Login OAuth no MCP para conectores do Claude

- **Data do registro:** 2026-10-21.
- **Status:** implementada nesta entrega (1.36.0); homologação em staging e no celular pendente. O usuário pediu para seguir com as recomendações do SDD (seção 8) sem escolher outra opção.
- **Contexto:** os conectores do Claude (claude.ai, Desktop, celular, Cowork e sessões do Claude Code na nuvem) se autenticam por OAuth 2.1, seguindo a especificação MCP 2025-11-25. O MCP do Operum só aceita PAT no cabeçalho, então só funciona no Claude Code local. A equipe quer criar e atualizar tarefas pelo chat do celular.
- **Escolha:** o auth-service vira servidor de autorização (issuer `https://api.operum.adm.br`, rotas públicas `/oauth/*` pelo gateway), com CIMD (allowlist de hosts) e DCR (allowlist de redirects), PKCE S256, código de uso único, access token opaco `opr_oat_` de 1 h e refresh rotativo com detecção de reuso. O consentimento fica no app (`/oauth/autorizar`) e permite escolher vários workspaces e leitura ou escrita. O mcp-server publica os metadados do recurso, responde 401 com `resource_metadata` e chama o gateway com o token, o `X-Operum-Tenant` e uma chave interna (`X-Operum-Mcp-Key`). O gateway só aceita o token OAuth com essa chave e com a audiência do MCP. O PAT continua como está.
- **Justificativa:** reaproveita a introspecção com cache, a revogação imediata e a autorização por chamada do gateway, que já valem para o PAT. O token opaco mantém a revogação imediata. A chave interna restringe o token à sua audiência sem criar um segundo tipo de token.
- **Alternativas consideradas:** provedor de identidade externo (Keycloak, Auth0, WorkOS), que exigiria migrar o login e duplicar usuários por tenant; JWT como access token, que perde a revogação imediata; PAT emitido no consentimento, que não tem audiência, rotação nem refresh; troca de token RFC 8693 a cada chamada (mais rígida, fica como evolução); cabeçalho fixo do claude.ai (`static_headers`, beta), que é uma credencial da organização inteira e não identifica cada pessoa.
- **Decisões da seção 8 do SDD adotadas:** access de 1 h, refresh de 30 dias com rotação e teto de 90 dias; recurso canônico `https://api.operum.adm.br/mcp` agora, configurável por `MCP_RESOURCE_URL` (trocar por `mcp.` desconecta quem já conectou); loopback aceito em produção, com aviso no consentimento; revogação de grants pelo admin do tenant fica para depois; chave interna no lugar da troca de token RFC 8693. Reuso de refresh dentro de 10 s só responde `invalid_grant` (tolera retentativa do cliente); depois disso revoga a conexão.
- **Consequências:** novos modelos no auth-service (cliente, grant, tenants do grant, código, token), rotas públicas novas no gateway, rota `/.well-known/oauth-protected-resource` no Traefik e os segredos `MCP_GATEWAY_KEY` e `OAUTH_*`. Mudar depois o recurso canônico para `mcp.operum.adm.br` invalida as conexões existentes. Superfície de ataque nova (registro e busca CIMD), mitigada por allowlist, proteção a SSRF e rate limit.
- **Condições de revisão:** se o Claude passar a exigir JWT ou outro formato de token; se o Operum adotar um provedor de identidade externo; ao trocar o domínio do MCP.
- **Risco conhecido (auditoria de 24/10/2026):** phishing de consentimento pelo cliente legítimo. Quem inicia "adicionar conector" na própria conta do claude.ai pode enviar o link `/oauth/autorizar` a outra pessoa; se ela permitir, o código volta ao claude.ai com o `state` de quem iniciou, e a conexão fica na conta do atacante. O protocolo não distingue os dois casos (o cliente e o redirect são os verdadeiros). Mitigação atual: a tela mostra o aplicativo e o destino e pede para só permitir conexões iniciadas pela própria pessoa; a conexão aparece em "Apps conectados" e pode ser revogada; trocar ou redefinir a senha derruba as conexões (1.39.1).
- **Referências:** [`docs/specs/SDD-mcp-oauth.md`](specs/SDD-mcp-oauth.md), `mcp-server/src/tenants.ts`, `api-gateway/src/middleware/auth.ts`, `auth-service/src/api-tokens/`, cards `cmviogcqv003101o2mce220xt` e seguintes da sprint 1.6.

## ADR-058 — PWA nativo do Next, sem cache de dados no aparelho

- **Data do registro:** 2026-10-23.
- **Status:** implementada nesta entrega (1.38.0); homologação em Android/Chrome e iPhone/Safari reais pendente. Segue a proposta dos cards MOB-18 (`cmvirt50q00e801o2zc820wll`) e MOB-19 (`cmvirt5is00ea01o2fzr3yqn6`) da sprint 1.2 Mobile, que o usuário mandou executar.
- **Contexto:** a equipe quer usar o Operum como app no celular. O Chrome no Android só oferece instalação com manifest e service worker; o iOS instala pelo Compartilhar e, a partir do 16.4, só entrega push a apps instalados. O Operum é multi-tenant, com sessão por cookie e expiração por inatividade: um aparelho pode ser usado por mais de uma pessoa ou instituição.
- **Escolha:** manifest por `app/manifest.ts` e worker escrito no próprio repositório (`lib/pwa/serviceWorker.ts`, servido em `/sw.js`), sem biblioteca. O worker guarda apenas estáticos versionados, ícones e a página pública `/offline`; navegações sempre vão à rede. A versão nova do worker espera o usuário pedir para atualizar.
- **Justificativa:** guardar HTML autenticado ou respostas de API poderia mostrar dados da sessão anterior a outra pessoa no mesmo aparelho, ou dados de outra instituição depois da troca; sem nada de sessão no cache, não há o que limpar no logout. O worker pequeno é fácil de auditar e de testar com um escopo simulado, e não adiciona dependência de produção. Recarregar só a pedido protege edições em andamento.
- **Alternativas consideradas:** Serwist/next-pwa, com pré-cache e estratégias prontas (mais superfície e configuração para um uso que não guarda dados); cache de páginas com `stale-while-revalidate` para abrir rápido sem rede (risco de vazamento entre sessões); fila offline de mutações (fora do escopo; a recuperação em rede instável é o MOB-10); só o manifest, sem worker (o Android não ofereceria instalação nem haveria tela offline).
- **Consequências:** o app não funciona sem rede além da tela "Sem conexão". Cada versão do `package.json` gera um worker novo e caches novos; deploys sem troca de versão reaproveitam o worker e o teto de 300 entradas limita o acúmulo de chunks. Manifest, worker, ícones e `/offline` são rotas públicas. O worker é a base para o push do MOB-21.
- **Condições de revisão:** se for decidido oferecer leitura offline de dados (exigiria cache isolado por usuário/instituição e limpeza no logout); ao implementar Web Push (MOB-21); se o Next passar a oferecer worker com pré-cache nativo.
- **Referências:** `app/manifest.ts`, `app/sw.js/route.ts`, `lib/pwa/serviceWorker.ts`, `components/pwa/ServiceWorkerRegistrar.tsx`, `app/offline/`, `proxy.ts`, `next.config.ts`; guia `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.

## ADR-059 — Porta pública do gateway restringe `/auth/*`

- **Data do registro:** 2026-10-24.
- **Status:** implementada nesta entrega (1.39.0).
- **Contexto:** a auditoria de segurança de 24/10/2026 encontrou que o api-gateway, exposto em `api.operum.adm.br`, anexa `X-Internal-Api-Key` a toda requisição repassada, e o `InternalAuthGuard` do auth-service só confere essa chave. Com isso, rotas pensadas como internas (`/auth/register`, `/auth/join-tenant`, `/auth/admin/*`, `/auth/provision-tenant-admin`, `/auth/login` sem o limite do app) ficavam acessíveis a qualquer usuário logado chamando a API direto. O app Next.js e o mcp-server usam o mesmo gateway pela rede interna e precisam dessas rotas.
- **Escolha:** o gateway escuta em duas portas. A interna (4000) atende o app e o mcp-server como antes. A pública (4080), para onde o Traefik aponta, responde 404 a qualquer `/auth/*` fora da allowlist `GET /auth/me`, `GET /auth/my-tenants` e `GET /auth/all-users` (as leituras de identidade da API direta por PAT), comparando o caminho normalizado (decodificado, sem barras repetidas, minúsculas). As rotas `/oauth/*` públicas e o `.well-known` seguem iguais.
- **Justificativa:** separar por porta não depende de cabeçalho enviado pelo cliente nem de o Traefik reescrever cabeçalhos, e não exige mudar o app, que já fala com o gateway interno. A allowlist (em vez de lista de bloqueio) mantém fechada qualquer rota nova do auth-service.
- **Alternativas consideradas:** chave diferente para o tráfego público com decorator `@GatewayAllowed()` no auth-service (exigiria separar o tráfego do app e do público, que hoje passam pelo mesmo gateway); bloquear rota a rota (deixa rotas novas expostas); detectar o Traefik pelos cabeçalhos `X-Forwarded-*` (frágil).
- **Consequências:** o label do Traefik passa a apontar para a porta 4080 (`docker-compose.yml`), e a imagem expõe as duas portas. Chamadas externas a `/auth/*` fora da allowlist passam a responder 404. As correções de atribuição em massa e de escopo de tenant no auth-service (ADR-060 e ADR-061) continuam valendo como defesa em profundidade para o tráfego interno.
- **Condições de revisão:** se algum cliente externo precisar de outra rota de conta, ela entra na allowlist de forma explícita; se o app deixar de usar o gateway para `/auth`.
- **Referências:** `api-gateway/src/main.ts`, `api-gateway/src/app.ts`, `api-gateway/src/middleware/auth.ts` (`isPublicAuthAllowed`), `docker-compose.yml`, `api-gateway/src/__tests__/public-exposure.test.ts`.

## ADR-060 — Operador da plataforma separado do admin de instituição

- **Data do registro:** 2026-10-24.
- **Status:** implementada nesta entrega (1.39.0). O usuário escolheu separar os papéis durante a auditoria de segurança.
- **Contexto:** o papel `admin` de um usuário valia para a plataforma inteira: listava, criava, suspendia e renomeava todas as instituições e entrava em qualquer uma (`provision-tenant-admin`, `join-tenant`). Instituições clientes também têm admins, que assim enxergavam e alteravam as outras.
- **Escolha:** nova coluna `User.platformOperator` (padrão `false`). Gerenciar instituições (página `/admin/tenants`, `listTenants`, `updateTenant`, ações de criar, mudar status, renomear e entrar) exige operador, conferido no banco a cada chamada (`lib/platformOperator.ts` no app; `exigirOperador` no auth-service). O `admin` passa a administrar só a própria instituição: as rotas de admin do auth-service filtram por `tenantId` de quem chama e aceitam só os campos de um schema estrito. A migration `20261024120000_operador_e_identidade` marca como operadores os admins atuais das instituições `mavellium` e `mavellium-main`.
- **Justificativa:** o papel lido do banco não depende da sessão nem do cliente. Separar o papel evita depender de cada tela lembrar de filtrar por instituição.
- **Alternativas consideradas:** manter `admin` como operador e impedir clientes de terem admins (limita o produto); lista de e-mails operadores em variável de ambiente (exige deploy para mudar e não aparece no cadastro).
- **Consequências:** admins de outras instituições perdem o acesso a "Instituições". Conceder ou retirar o papel de operador é, por ora, uma alteração direta no banco. O `GET /auth/me` e o `/api/me` passam a informar `platformOperator` para o menu.
- **Condições de revisão:** se surgir tela para gerenciar operadores; se os subdomínios das instituições da Mavellium mudarem antes da migration rodar.
- **Referências:** `prisma/migrations/20261024120000_operador_e_identidade/`, `lib/platformOperator.ts`, `app/actions/admin.ts`, `services/tenantService.ts`, `auth-service/src/admin/`, `auth-service/src/auth/auth.service.ts`.

## ADR-061 — Vínculo explícito entre as contas da mesma pessoa

- **Data do registro:** 2026-10-24.
- **Status:** implementada nesta entrega (1.39.0).
- **Contexto:** uma pessoa tem uma conta (`User`) por instituição. A troca de instituição, a lista "Minhas instituições" e os workspaces do consentimento OAuth uniam as contas só pelo e-mail. Como o admin de qualquer instituição cadastra qualquer e-mail sem verificação, quem controlasse uma conta com o e-mail E trocava para as contas de E em todas as outras instituições.
- **Escolha:** nova coluna `User.identityId`. Só contas com a mesma identidade trocam entre si e aparecem no consentimento OAuth. O vínculo nasce em fluxos que comprovam a posse: entrar ou ser provisionado numa instituição a partir da conta atual (operador), ou confirmar a senha da conta de destino na primeira troca (com o mesmo limite de tentativas do login). Na sessão do navegador, contas com o mesmo e-mail e ainda não vinculadas aparecem em "Minhas instituições" pedindo essa senha. A migration vincula de saída as contas com o mesmo e-mail e o mesmo hash de senha (criadas por `provisionTenantAdmin`, que copia o hash).
- **Justificativa:** a senha da conta de destino é a prova que já existe para cada conta. Não exige verificação de e-mail nem identidade global, que o Operum ainda não tem.
- **Alternativas consideradas:** identidade global com e-mail verificado (mudança maior no login e no cadastro); exigir senha em toda troca (atrito sem ganho depois do primeiro vínculo); esconder as contas não vinculadas (a pessoa não teria como vinculá-las).
- **Consequências:** quem tem contas não vinculadas confirma a senha uma vez em cada instituição. A lista ainda mostra o nome de instituições em que o mesmo e-mail tem conta, para quem está logado com aquele e-mail; não dá acesso sem a senha. Os workspaces de uma conexão OAuth ficam restritos às contas vinculadas.
- **Condições de revisão:** se o Operum adotar verificação de e-mail ou identidade global; se o atrito da primeira troca for relevante.
- **Referências:** `auth-service/src/auth/identity.ts`, `auth-service/src/auth/auth.service.ts` (`getMyTenants`, `switchTenant`, `joinTenant`, `provisionTenantAdmin`), `auth-service/src/oauth/oauth.service.ts` (`tenantsOf`), `app/actions/auth.ts`, `components/UserTenantsList.tsx`, `components/layout/TenantSwitcher.tsx`, `auth-service/src/__tests__/seguranca-contas.test.ts`.

## ADR-062 — Manter o patch de braces sem exceção depois da retirada do advisory

- **Data do registro:** 2026-10-24.
- **Status:** implementada nesta entrega. O usuário pediu a correção do check "Gateway Image Security", que falhava em todas as PRs.
- **Contexto:** o GitHub retirou o advisory GHSA-vfj7-8cjw-p6xm (CVE-2026-93687, `braces <=3.0.3`) em 23/10/2026, sem publicar versão corrigida. O Trivy deixou de acusar o `braces@3.0.3` sem patch, e o controle negativo de `scripts/security/verify-trivy-braces-filter.cjs` (que exigia esse alerta) passou a falhar em todas as PRs a partir de 24/10. A regra do Trivy também expirava em 03/11/2026.
- **Escolha:** remover o que dependia do advisory: a exceção `ignoreGhsas` do `pnpm audit` (raiz e gateway), a regra de CVE-2026-93687 em `.trivyignore-gateway.yaml` e o script/etapa de controles negativos. Manter o patch de profundidade, seus testes (`bracesPatch.test.ts`) e a verificação do patch na imagem (`verify-braces-patch.cjs`).
- **Justificativa:** um advisory retirado não é uma correção: o limite de profundidade continua útil contra globs maliciosos e não tem custo. Sem o advisory, as exceções não protegem nada e só mantêm um controle que falha.
- **Alternativas consideradas:** remover também o patch (perde a defesa sem ganho; a versão do `braces` é a mesma); ajustar o script para aceitar o alerta ausente (mantém um controle sem objeto e a expiração de 03/11).
- **Consequências:** o `pnpm audit` e o Trivy voltam a acusar o `braces` se o advisory for republicado; nesse caso, reavaliar se o patch ainda cobre o problema antes de recriar exceções.
- **Condições de revisão:** atualização do `braces` (ou de quem o usa: micromatch, http-proxy-middleware, fast-glob) para uma versão com limite próprio; republicação do advisory.
- **Referências:** ADR-011, ADR-013, `patches/braces@3.0.3.patch`, `api-gateway/patches/braces@3.0.3.patch`, `__tests__/unit/security/bracesPatch.test.ts`, `api-gateway/scripts/verify-braces-patch.cjs`, `.trivyignore-gateway.yaml`, `.github/workflows/gateway-image-security.yml`, [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## ADR-063 — Confirmação da conta ativa para operador ao trocar de instituição

- **Data do registro:** 2026-10-24.
- **Status:** implementada em código na 1.40.0; complementa a ADR-061 exclusivamente para operadores da plataforma. A ADR-061 continua vigente para os demais usuários.
- **Contexto:** contas por instituição têm hashes e histórico de senha independentes. O operador relatou rejeição na confirmação entre instituições; o formulário também dependia do estado React da senha, que pode não acompanhar o preenchimento automático. A divergência dos hashes de produção não foi inspecionada nem comprovada nesta entrega.
- **Escolha:** o operador, identificado por `platformOperator` no banco, reautentica a conta ativa antes de vincular/acessar sua conta existente no destino. `admin` institucional não recebe essa exceção; permanece a senha de destino. A resposta informa `passwordScope` para o formulário. O formulário lê `FormData` na submissão, oferece visualização e não inventa domínio institucional.
- **Justificativa:** o operador já administra as instituições (ADR-060); a reautenticação usa uma credencial atual, sem depender de cópias antigas. O acesso permanece restrito a contas elegíveis e não cria conta ou papel implicitamente.
- **Alternativas consideradas:** vincular automaticamente por e-mail (rejeitada por quebrar isolamento); igualar senhas entre instituições (rejeitada por alterar credenciais e histórico); exigir sempre senha do destino (mantida para pessoas sem autoridade de plataforma).
- **Consequências:** confirmação do operador conta tentativas na conta ativa; bloqueios da conta ativa/destino e inatividade continuam impedindo a operação. Operador com troca de senha obrigatória não vincula novas contas. Após confirmação, usa-se o vínculo explícito existente, com auditoria.
- **Condições de revisão:** adoção de identidade global ou reautenticação MFA; revisão do alcance do papel de operador.
- **Referências:** `auth-service/src/auth/auth.service.ts`, `components/UserTenantsList.tsx`, `auth-service/src/__tests__/seguranca-contas.test.ts`, `__tests__/components/UserTenantsList.test.tsx`, ADR-060 e ADR-061.

## ADR-064 — Orçamento MCP reutiliza a atividade canônica da EAP

- **Data do registro:** 2026-10-24.
- **Status:** implementada em código na 1.40.0.
- **Contexto:** as ferramentas de tarefas não expunham orçamento; o campo do produto pertence à Planilha de Custos/EAP, ainda no app, e não ao modelo Card do sprint-service.
- **Escolha:** duas ferramentas específicas consultam/definem `estimated_minutes` pelo gateway, que encaminha a uma rota interna do app. O serviço resolve o card/projeto/atividade no tenant, valida as permissões financeiras e reutiliza `updateNodeProperties` para escrever somente `tempoMinutos`, com auditoria e controle de versão.
- **Justificativa:** manter uma única origem para o orçamento e reutilizar autorização e transação existentes, sem duplicar fórmulas no MCP.
- **Alternativas consideradas:** estimativa na descrição do card (não preenche o campo do produto); coluna de estimativa no Card (duplicaria a fonte); acesso do MCP direto ao banco (contornaria o gateway).
- **Consequências:** sem migration ou nova credencial. O app precisa estar disponível em `AUTHORIZATION_SERVICE_URL`. GET exige leitura financeira e PATCH exige orçamento; o gateway continua exigindo escopo de escrita do token. Vínculos ausentes/ambíguos e nós agregadores falham explicitamente; nenhuma sincronização estrutural é feita silenciosamente.
- **Condições de revisão:** extração do domínio EAP/Planilha para microsserviço; implementação de orçamento para cards sem atividade na EAP.
- **Referências:** `mcp-server/src/tools/budgets.ts`, `api-gateway/src/app.ts`, `services/apiAuthorization.ts`, `services/taskBudgetService.ts`, `app/api/internal/task-budget/[cardId]/route.ts`.

## ADR-065 — Realizado por projeção dos apontamentos encerrados dos cards

- **Data do registro:** 2026-10-24.
- **Status:** implementada em código na 1.40.2; publicação pendente da entrega.
- **Contexto:** o usuário relatou que horas/minutos lançados nos cards não preenchiam o realizado da Planilha de Custos. O cálculo lia apenas `WbsNode.properties.tempoRealMinutos`; os lançamentos eram persistidos em `TimeEntry`, sem ligação no cálculo da planilha/EAP.
- **Escolha:** projetar em `getTree` a soma dos segundos encerrados de cada card vinculado, em uma propriedade derivada que não entra no schema salvo da EAP. Havendo histórico encerrado, ele é a fonte do tempo, substituindo o manual; sem histórico, permanece o preenchimento manual existente. Remover o último registro zera o realizado, sem ressuscitar valor manual. Timer ainda rodando não participa da soma. O resolvedor é compartilhado pela planilha, custos, rollups e exportações.
- **Justificativa:** alterações/exclusões e registros anteriores à correção passam a funcionar na leitura, sem backfill e sem depender de todos os caminhos de escrita (painel e MCP) manterem uma cópia sincronizada. Agregação em lote e snapshot dos totais evitam N+1 e divergência entre histórico e soma.
- **Alternativas consideradas:** somar manual e apontamentos (rejeitada por dupla contagem); copiar o total para a EAP em cada mutação (exigiria cobrir várias rotas, conciliar eventos e recuperar falhas); abandonar o realizado manual em todas as linhas (quebraria os projetos sem apontamentos).
- **Consequências:** linha com apontamentos tem tempo somente leitura na planilha; correções são feitas nos registros do card. Materiais e datas permanecem independentes. Segundos são preservados no cálculo e o custo segue a regra existente dos elaboradores, sem inferir salário. Consultas são escopadas por projeto/tenant/card/autor; histórico soft-deleted só identifica a origem, nunca soma tempo. Não conclui cards nem altera orçado. A leitura local de `TimeEntry` é uma projeção do domínio EAP ainda no app, não uma segunda escrita no domínio de tempo.
- **Condições de revisão:** extração da EAP para outro serviço; mudança do custeio por elaborador para custeio por autor do apontamento; necessidade de desassociar explicitamente uma linha da fonte de tempo do card.
- **Referências:** `services/realizadoDosCards.ts`, `services/wbsService.ts`, `lib/tempoRealizado.ts`, `lib/planilhaCustos.ts`, `lib/wbsRollup.ts`, `components/custos/PlanilhaCustosView.tsx`, `app/actions/time.ts`; card Operum `cmvmsu51q000001o9nj9gy786`.

## ADR-066 — Auditar no app as ações de admin sobre usuários e instituições

- **Data do registro:** 2026-10-24.
- **Status:** implementada em código na 1.40.4; publicação pendente da entrega.
- **Contexto:** ao preparar as consultas pós-deploy da auditoria de 24/10, constatou-se que criar, editar, mudar o papel e ativar/desativar usuários pela tela de admin não gravava nada em `AuditLog`, nem as ações do operador sobre instituições. Não havia como saber quem promoveu alguém a admin, nem quando.
- **Escolha:** as Server Actions de `app/actions/admin.ts` gravam em `AuditLog` (entity `User` ou `Tenant`) o autor, o alvo, a ação (`USUARIO_*`, `INSTITUICAO_*`) e o "antes/depois" lido do banco, por `services/auditoriaAdminService.ts`. Senha, hash, MFA e tokens ficam fora; a troca de senha aparece só como `senhaRedefinida: true`. As ações do operador ficam na auditoria da instituição afetada, com `autorTenantId`.
- **Justificativa:** desde o ADR-059 as rotas de admin do auth-service não ficam na porta pública; as Server Actions são o único caminho de escrita. A tabela `AuditLog` já existe no banco compartilhado e é a lida pela rota `/audit`.
- **Alternativas consideradas:** gravar no auth-service (cobriria qualquer chamador, mas o auth-service não tem `AuditLog` no schema dele e exigiria migration e contrato novos); só registrar em log do container (não sobrevive à troca do container).
- **Consequências:** a alteração no auth-service e o registro não são atômicos. Se a gravação da auditoria falhar, a alteração continua valendo e o erro vai para o log do servidor. Uma chamada interna direta ao auth-service, sem passar pelo app, não é auditada.
- **Condições de revisão:** nova rota de escrita de usuários fora do app; extração da auditoria para um serviço próprio.
- **Referências:** `services/auditoriaAdminService.ts`, `app/actions/admin.ts`, `__tests__/integration/actions/admin.actions.test.ts`; card Operum `cmvmvk8ev000p01ml07mn9kl5`.

