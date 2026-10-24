# Propriedade de domínio e inventário de consumidores — SDD 9.7

Inventário de fontes em 2026-10-04 sobre a base da PR #51. Não representa execução em produção. `scripts/check-domain-boundaries.mjs --inventory` reproduz referências de import/export, import() e require() literais via AST TypeScript e resolução de aliases/paths. Inclui entrypoints do app, componentes, scripts, testes e serviços Nest; ignora dependências, builds, clientes gerados e arquivos históricos de pesquisa. Referências de documentação e comandos JSON/YAML/shell foram conferidas por busca textual antes da remoção. A função local chamada require em apiAuthorization é autorização, não carregamento de módulo. Não foram encontrados imports dinâmicos de módulos retirados nem entrypoints com nomes montados para eles.

## Caminhos ativos e exceções

| Domínio | Responsável canônico | Caminho do app / exceções explícitas |
|---|---|---|
| Departamentos, membros e roles de projeto | project-service | actions/departments.ts e lib/api-client via gateway. CRUD Nest permanece igual; testes exercitam DepartmentService atual. |
| Projetos e macrofases | project-service | actions/projetos.ts via gateway. Leitura local de projeto/acesso em services/projectService.ts e projectAccess.ts ainda atende páginas/exportações/responsáveis; roles locais e reconciliação EAP permanecem no app. |
| Sprints, cards, colunas e tempo | sprint-service | actions/sprints.ts, sprintBoard.ts e time.ts via gateway. services/sprintService.ts ainda fornece leitura nas páginas de sprints/dashboard de projeto; essas páginas usam guards de acesso. Não migrado nesta entrega. |
| Dashboards global/individual | sprint-service | Contratos canônicos e actions/dashboard.ts via gateway (SDD 9.5). services/dashboardService.ts continua atendendo métricas em páginas locais de projeto. |
| Anexos | file-service | gateway e MCP com validação de escopo de card. Fluxos locais de documentos/exportação/upload têm responsabilidades distintas ainda presentes. |
| Identidade, sessão, autorização | auth-service + app | login/PAT pela API; DAL, permission resolver e bridge de autorização no app, conforme arquitetura atual. |
| Documentação, atas, EAP/WBS e custos | app | services/documentRevisionService.ts, ataService.ts, eapService.ts e wbsService.ts, isolamento via projeto/tenant e transações locais. |
| Importação | app e MCP | CSV local; export/import MCP atravessa gateway. Não unificados nesta entrega. |

BFFs/actions adaptam transporte/resultado; os serviços locais acima continuam exceções explicitamente identificadas, não uma segunda implementação autorizada de mutações já migradas. Esta consolidação não move todos os domínios nem muda contratos/DB. Módulos com zero consumidores abaixo são candidatos para avaliação futura por domínio, não uma prova isolada de equivalência de suas regras com o serviço atual.

## Remoções verificadas

| Arquivo retirado | Consumidores encontrados antes |
|---|---|
| lib/projectClient.ts | Nenhum import, reexport, dynamic import, script, teste ou entrypoint. Cliente HTTP direto contornava gateway, mas não era usado. |
| lib/sprintClient.ts | Nenhum consumidor; mesmo caso do cliente de projetos. |
| services/departmentService.ts | Somente __tests__/unit/services/departmentService.test.ts. Nenhum runtime. |
| services/departamentoService.ts | Nenhum consumidor, nem teste. |
| lib/validation/departmentSchemas.ts | Somente os dois serviços de departamentos retirados. |

Teste da implementação morta retirado junto dos módulos; substituído por project-service/src/department/department.service.spec.ts: listagem/escopo, criação/duplicata, atualização, soft delete e associação. Helpers locais antigos (get-or-create, deactivate, cascatas distintas) não foram transferidas para alterar o comportamento do serviço canônico.

## Referências atuais dos módulos locais

AST considera imports de tipos e reexports como referências, de maneira conservadora. Reexports precisam ser rastreados pelos consumidores acima; esta tabela não prova alcance em produção. Sem reorganização geral de pastas.

| Módulo | Referências fora dos testes | Referências de testes |
|---|---|---|
| services/adminService.ts | app/admin/users/page.tsx | __tests__/unit/services/adminService.test.ts |
| services/apiAuthorization.ts | app/api/internal/authorize/route.ts | __tests__/unit/app/api/internal/authorize.test.ts<br>__tests__/unit/services/apiAuthorization.test.ts |
| services/ataService.ts | app/api/atas/[ataId]/export/route.ts<br>app/projetos/[projetoId]/atas/[ataId]/page.tsx<br>app/projetos/[projetoId]/atas/page.tsx<br>app/projetos/[projetoId]/documentacao/page.tsx | __tests__/integration/atas/atas.page.test.tsx<br>__tests__/unit/services/ataService.test.ts |
| services/auditoriaService.ts | app/actions/cadastros.ts<br>app/actions/permissoes.ts<br>services/documentRevisionService.ts<br>services/wbsService.ts | __tests__/unit/app/actions/permissoes.test.ts |
| services/authService.ts | — | __tests__/unit/services/authService.test.ts |
| services/authz.ts | app/actions/permissoes.ts<br>app/actions/wbs.ts<br>app/api/projects/[projetoId]/eap/route.ts<br>app/api/projetos/[projetoId]/planilha-custos/export/route.ts<br>app/api/search/route.ts<br>app/projetos/[projetoId]/layout.tsx<br>app/projetos/[projetoId]/planilha-custos/page.tsx<br>app/projetos/novo/page.tsx<br>lib/documentRevisionHttp.ts<br>services/apiAuthorization.ts<br>services/documentRevisionService.ts<br>services/permissoesService.ts<br>services/projectAccess.ts | __tests__/api/document-revisions.test.ts<br>__tests__/api/documento-versions.test.ts<br>__tests__/api/planilha-custos-export.test.ts<br>__tests__/integration/documentRevision.postgres.test.ts<br>__tests__/unit/app/actions/permissoes.test.ts<br>__tests__/unit/app/actions/wbsCustos.test.ts<br>__tests__/unit/app/api/projects/charter.versions.test.ts<br>__tests__/unit/services/apiAuthorization.test.ts<br>__tests__/unit/services/authz.test.ts |
| services/cardResponsibleService.ts | — | __tests__/unit/services/cardResponsibleService.test.ts |
| services/comentarioService.ts | — | __tests__/unit/services/comentarioService.test.ts |
| services/csvImportService.ts | app/api/csv/route.ts | __tests__/unit/services/csvImportService.test.ts |
| services/dashboardMetricService.ts | — | — |
| services/dashboardService.ts | app/admin/dashboard/page.tsx<br>app/projetos/[projetoId]/dashboard/page.tsx<br>app/projetos/[projetoId]/sprints/page.tsx | __tests__/unit/services/dashboardService.test.ts |
| services/documentRevisionService.ts | app/actions/atas.ts<br>app/api/projects/[projetoId]/charter/route.ts<br>app/api/projects/[projetoId]/charter/versions/route.ts<br>app/api/projects/[projetoId]/documento/route.ts<br>app/api/projects/[projetoId]/documento/versions/[versionId]/route.ts<br>app/api/projects/[projetoId]/documento/versions/route.ts<br>app/api/projects/[projetoId]/eap/route.ts<br>app/api/projects/[projetoId]/revisions/route.ts | __tests__/api/document-revisions.test.ts<br>__tests__/api/documento-versions.test.ts<br>__tests__/integration/documentRevision.postgres.test.ts<br>__tests__/unit/app/api/projects/charter.versions.test.ts |
| services/eapService.ts | app/api/projects/[projetoId]/eap/route.ts<br>services/documentRevisionService.ts | __tests__/api/eap.route.test.ts |
| services/fileUploadService.ts | — | __tests__/unit/services/fileUploadService.test.ts |
| services/macroFaseSyncService.ts | app/actions/projetos.ts | __tests__/integration/macroFases.postgres.test.ts<br>__tests__/unit/app/actions/projetos.test.ts |
| services/migrationService.ts | — | — |
| services/notificacaoService.ts | app/api/notificacoes/count/route.ts<br>app/notificacoes/page.tsx<br>lib/notificationPublisher.ts | __tests__/unit/services/notificacaoService.test.ts |
| services/permissionService.ts | — | __tests__/unit/services/permissionService.test.ts |
| services/permissoesService.ts | app/actions/permissoes.ts<br>components/permissoes/PermissoesFuncoes.tsx<br>components/permissoes/PermissoesUsuario.tsx | __tests__/unit/app/actions/permissoes.test.ts<br>__tests__/unit/services/permissoesService.test.ts |
| services/projectAccess.ts | app/actions/atas.ts<br>app/actions/cadastros.ts<br>app/actions/projetos.ts<br>app/api/atas/[ataId]/export/route.ts<br>app/api/projects/[projetoId]/charter/route.ts<br>app/api/projects/[projetoId]/charter/versions/route.ts<br>app/api/projects/[projetoId]/documento/route.ts<br>app/api/projects/[projetoId]/documento/versions/route.ts<br>app/api/projects/[projetoId]/macro-fases/[faseId]/route.ts<br>app/api/projects/[projetoId]/macro-fases/route.ts<br>app/api/projects/[projetoId]/revisions/route.ts<br>app/projetos/[projetoId]/atas/[ataId]/page.tsx<br>app/projetos/[projetoId]/atas/nova/page.tsx<br>app/projetos/[projetoId]/atas/page.tsx<br>app/projetos/[projetoId]/dashboard/page.tsx<br>app/projetos/[projetoId]/departamentos/page.tsx<br>app/projetos/[projetoId]/documentacao/page.tsx<br>app/projetos/[projetoId]/funcoes/page.tsx<br>app/projetos/[projetoId]/layout.tsx<br>app/projetos/[projetoId]/planilha-custos/page.tsx<br>app/projetos/[projetoId]/sprints/page.tsx<br>app/projetos/[projetoId]/stakeholders/page.tsx<br>app/projetos/[projetoId]/wbs/page.tsx<br>app/projetos/novo/page.tsx<br>app/projetos/page.tsx | __tests__/api/document-revisions.test.ts<br>__tests__/api/documento-versions.test.ts<br>__tests__/api/documento.route.test.ts<br>__tests__/api/eap.route.test.ts<br>__tests__/integration/atas/atas.page.test.tsx<br>__tests__/unit/app/actions/projetos.test.ts<br>__tests__/unit/app/api/projects/charter.versions.test.ts |
| services/projectRoleService.ts | app/actions/membros.ts<br>app/actions/projetos.ts<br>app/arquivos/page.tsx<br>app/projetos/[projetoId]/stakeholders/page.tsx<br>services/projectService.ts | __tests__/integration/atas/atas.page.test.tsx |
| services/projectService.ts | app/actions/cardResponsible.ts<br>app/api/projetos/[projetoId]/planilha-custos/export/route.ts<br>app/dashboard/sprint/[sprintId]/page.tsx<br>app/sprints/[sprintId]/page.tsx<br>services/projectAccess.ts<br>services/projetoService.ts | __tests__/api/planilha-custos-export.test.ts<br>__tests__/unit/actions/cardResponsible.test.ts |
| services/projetoCadastroService.ts | app/actions/cadastros.ts<br>app/projetos/[projetoId]/departamentos/page.tsx<br>app/projetos/[projetoId]/funcoes/page.tsx<br>app/projetos/[projetoId]/stakeholders/page.tsx<br>services/ataService.ts | __tests__/unit/services/ataService.test.ts<br>__tests__/unit/services/projetoCadastroService.test.ts |
| services/projetoService.ts | — | __tests__/unit/services/projetoService.test.ts |
| services/roleService.ts | — | __tests__/unit/services/roleService.test.ts |
| services/sprintColumnService.ts | — | __tests__/unit/services/sprintColumnService.test.ts |
| services/sprintFeedbackService.ts | — | — |
| services/sprintService.ts | app/projetos/[projetoId]/dashboard/page.tsx<br>app/projetos/[projetoId]/sprints/page.tsx | __tests__/unit/services/sprintService.test.ts |
| services/tagService.ts | — | __tests__/unit/services/tagService.test.ts |
| services/tenantService.ts | app/actions/admin.ts<br>app/admin/tenants/page.tsx<br>lib/tenant.ts | __tests__/unit/lib/tenant.test.ts<br>__tests__/unit/services/tenantService.test.ts |
| services/timeService.ts | — | __tests__/unit/services/timeService.test.ts |
| services/userService.ts | — | __tests__/unit/services/userService.test.ts |
| services/wbsService.ts | app/actions/projetos.ts<br>app/actions/wbs.ts<br>app/api/projects/[projetoId]/charter/route.ts<br>app/api/projetos/[projetoId]/planilha-custos/export/route.ts<br>app/projetos/[projetoId]/planilha-custos/page.tsx<br>app/projetos/[projetoId]/wbs/page.tsx<br>components/wbs/WbsCanvas.tsx<br>components/wbs/WbsContext.tsx<br>services/macroFaseSyncService.ts | __tests__/api/planilha-custos-export.test.ts<br>__tests__/unit/app/actions/wbsCustos.test.ts<br>__tests__/unit/services/wbsCustosPermissions.test.ts |

## Verificação contínua e revisão da fase 9

`node scripts/check-domain-boundaries.mjs` impede restaurar os módulos retirados/importá-los e detectar PROJECT_SERVICE_URL/SPRINT_SERVICE_URL nas fontes do app. O novo workflow Domain Boundaries roda a verificação, testes do project-service e build. A regra não veta os contratos puros importados do sprint-service nem consultas locais documentadas. Acesso direto adicional/fetch montado indiretamente ainda exige review; a verificação não é um analisador completo de fluxo de dados.

Revisão de consistência dos itens 9.1–9.6: limites de escrita atômica (sprint/timer/movimento), reconciliação de macrofases, contratos de dashboard e paginação continuam nos caminhos documentados e preservados pelos workflows PostgreSQL/HTTP existentes. Nenhum service ativo foi substituído pela implementação antiga. A fase 9.7 não exige incremento de versão: apenas retira código sem consumidor e muda testes/documentação/checks, sem comportamento do produto ou dependências.

### Projeção de realizado para EAP/Planilha (1.40.2)

`services/realizadoDosCards.ts`, consumido por `services/wbsService.ts:getTree`, lê agregados de `TimeEntry` no banco compartilhado apenas para compor a visão de custos. Não cria, edita ou exclui apontamentos: o sprint-service continua dono dessas escritas via gateway. Esta é uma exceção local de leitura enquanto a EAP pertence ao app (ADR-065); ao extrair esse domínio, o contrato de projeção precisa acompanhar a migração.
