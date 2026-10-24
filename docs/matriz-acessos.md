# Matriz de acessos dos perfis

Levantamento de 24/10/2026, versão 1.40.2, feito a partir do código. Descreve o que
cada perfil pode consultar, editar e aprovar **hoje**, com os padrões de fábrica.
O administrador da instituição pode mudar as permissões das funções e de cada
usuário (ver [Como as permissões se somam](#como-as-permissões-se-somam)). Por isso,
o que vale numa instituição pode diferir dos padrões abaixo.

**Status:** rascunho para revisão com o Fábio. As divergências da última seção
ainda não foram decididas, exceto D1 e D2.

Fontes: [lib/permissoes.ts](../lib/permissoes.ts) (catálogo e padrões),
[services/authz.ts](../services/authz.ts) (resolução),
[services/apiAuthorization.ts](../services/apiAuthorization.ts) (regras da API via gateway),
[lib/platformOperator.ts](../lib/platformOperator.ts) e
[app/admin/layout.tsx](../app/admin/layout.tsx).

## Perfis

| Perfil | Como existe no sistema |
|--------|------------------------|
| **Operador da plataforma** | `User.platformOperator = true`, lido do banco a cada chamada (ADR-060). Independe do `role`. Hoje: admins das instituições `mavellium` e `mavellium-main`. |
| **Administrador da instituição** | `User.role = 'admin'`. Vale só na própria instituição. |
| **Gerente de projeto** | Papel de projeto `UserProjectRole` com a função `gerente` (escopo PROJETO). Atribuído só pelo admin. |
| **Membro do projeto** | `User.role = 'member'` com vínculo ativo em `UserProject`. Recebe a função-base "Membro do projeto". |
| **Tech Lead / PO** | Cargos em `UserProject.role`. Sem permissões extras por padrão: começam iguais ao membro (decisão do usuário, 30/09/2026). |
| **Não membro** | Usuário da instituição sem vínculo ativo no projeto. |

Tokens de acesso (PAT) e o conector do Claude (OAuth/MCP) agem como o usuário dono
do token, com as mesmas permissões. Um token sem o escopo `write` só lê.

## Plataforma e instituição

| Ação | Operador | Admin | Gerente | Membro | Não membro |
|------|:--------:|:-----:|:-------:|:------:|:----------:|
| Instituições: criar, mudar status, renomear, entrar, provisionar admin (`/admin/tenants`) | Sim¹ | Não | Não | Não | Não |
| Painel `/admin`: usuários, funções, departamentos, projetos da instituição | Só se admin | Sim | Não | Não | Não |
| Definir permissões das funções e ajustes por usuário | Só se admin | Sim | Não | Não | Não |
| Atribuir cargos e o papel de gerente | Só se admin | Sim | Não | Não | Não |
| Escrever no catálogo de funções, permissões e departamentos (API) | Só se admin | Sim | Não | Não | Não |
| Criar e editar etiquetas (globais da instituição) | — | Sim | Sim² | Sim² | Não |
| Ler a auditoria (`/audit`) | Só se admin | Sim | Não | Não | Não |
| Editar ou excluir lançamento de tempo de outra pessoa | Só se admin | Sim | Não | Não | Não |
| Parar o próprio timer | — | Sim | Sim | Sim (basta ver o projeto) | Não |

¹ Precisa também ser admin para abrir a tela, porque o layout de `/admin` exige `role = 'admin'` (D4).
² Basta ter `quadro:cards` em qualquer projeto da instituição (D6).

## Dentro de um projeto

"Sim" para o admin vale em **todos** os projetos da instituição, mesmo sem ser membro.

| Permissão | Chave | Admin | Gerente | Membro (padrão) | Tech Lead / PO (padrão) | Não membro |
|-----------|-------|:-----:|:-------:|:---------------:|:-----------------------:|:----------:|
| Ver o projeto | `projeto:ver` | Sim | Sim | Sim | Sim | Não |
| Editar dados do projeto e macrofases | `projeto:editar` | Sim | Sim | Não | Não | Não |
| Gerenciar membros e stakeholders | `projeto:equipe` | Sim | Sim | Não | Não | Não |
| Ver sprints e cards | `quadro:ver` | Sim | Sim | Sim | Sim | Não |
| Criar e editar cards | `quadro:cards` | Sim | Sim | Sim | Sim | Não |
| Mover cards | `quadro:mover` | Sim | Sim | Sim | Sim | Não |
| Excluir cards | `quadro:excluir` | Sim | Sim | Não | Não | Não |
| Gerenciar sprints e colunas | `quadro:sprints` | Sim | Sim | Não | Não | Não |
| Ver documentos | `documentos:ver` | Sim | Sim | Sim | Sim | Não |
| Editar documentos (gera versão pendente) | `documentos:editar` | Sim | Sim | Sim | Sim | Não |
| Aprovar ou rejeitar versões | `documentos:aprovar` | Sim | Sim | Não | Não | Não |
| Excluir documentos | `documentos:excluir` | Sim | Sim | Não | Não | Não |
| Ver a planilha de custos | `planilha:ver` | Sim | Sim | Sim | Sim | Não |
| Editar o orçado (inclui orçamento pelo MCP) | `planilha:orcado` | Sim | Sim | Não | Não | Não |
| Editar o realizado das próprias linhas ("Elaborado por") | `planilha:realizado-proprio` | Sim | Sim | Sim | Sim | Não |
| Editar o realizado de todas as linhas | `planilha:realizado-todos` | Sim | Sim | Não | Não | Não |
| Gerenciar funções e departamentos do projeto | `cadastros:gerenciar` | Sim | Sim | Não | Não | Não |

Notas:

- Toda permissão de projeto exige também `projeto:ver`. Sem ver o projeto, nada passa.
- Editar documentos cria uma versão pendente; quem também tem `documentos:aprovar` publica a própria versão direto.
- O realizado próprio compara o ID gravado em "Elaborado por" (`elaboradoPorUserId`), não o nome.
- `cadastros:gerenciar` perdeu o uso na 1.20.0 (ADR-040): todo o catálogo vale em qualquer projeto.

## Como as permissões se somam

1. Admin recebe tudo nos projetos da própria instituição.
2. Quem não é membro ativo do projeto não recebe nada, nem por ajuste.
3. Membro recebe a função-base "Membro do projeto" **mais** as funções dos cargos dele e o papel de gerente.
4. Aplicam-se os ajustes globais do usuário (conceder ou negar).
5. Por último, os ajustes do usuário naquele projeto: o do projeto vence o global.

Enquanto o admin não define as permissões de uma função, vale o padrão: gerente tem
tudo, função-base tem o padrão do membro, as demais funções não somam nada.

## Divergências para revisar

Cada item ainda aberto precisa de decisão antes de virar card de correção.

| ID | Divergência | Situação hoje | Proposta para discutir |
|----|-------------|---------------|------------------------|
| D1 | Não existe perfil "Professor". | Professor aparece só no texto dos documentos (Termo de Abertura, EAP). | **Decidido em 24/10/2026: não precisa de perfil próprio.** Quem precisar de acesso diferente usa uma função ou ajustes por usuário. Observação: uma função só **soma** permissões; para tirar algo da função-base, só com ajuste de negação por usuário. |
| D2 | `docs/architecture.md` listava `gerente` como `User.role` global. | O admin só grava `admin` ou `member` ([admin.service.ts](../auth-service/src/admin/admin.service.ts)). O `register.dto.ts` ainda aceita `gerente`, mas a rota foi fechada na porta pública (ADR-059). Gerente é papel de projeto. | Corrigido nesta revisão da arquitetura. Avaliar tirar `gerente` do DTO. |
| D3 | Negar uma permissão para um admin não tem efeito. | A resolução devolve tudo para o admin antes de olhar os ajustes. | Confirmar que é intencional e avisar na tela de ajustes do usuário. |
| D4 | Operador que não é admin não abre a tela de instituições. | O layout de `/admin` exige `role = 'admin'` antes de conferir o operador. Hoje todo operador também é admin, então não aparece. | Decidir se o operador sempre será admin ou se a tela sai do layout de admin. |
| D5 | Gerente não corrige lançamento de tempo da equipe. | Editar ou excluir tempo de outra pessoa exige `role = 'admin'`. | Decidir se o gerente pode corrigir horas no próprio projeto. |
| D6 | Etiquetas são da instituição inteira. | Quem pode editar cards em **qualquer** projeto cria e edita etiquetas usadas em todos. | Decidir se as etiquetas ficam por projeto ou só com admin. |
| D7 | Tech Lead e PO sem diferença do membro. | Correto pela decisão de 30/09, mas o card original pedia "algumas permissões" para eles. | Definir as permissões dessas funções na tela Funções. |

## Cards relacionados

- "O acesso às permissões do usuário é feito em Funções e no próprio usuário" (sprint 1.11, concluído): modelo de funções e ajustes.
- "Usuários comuns têm acesso a todos os documentos" (sprint 1.11, em teste): padrão do membro (`documentos:ver`, `documentos:editar`).
- "Usuário comum na planilha pode editar o realizado do Elaborado por" (sprint 1.11, em teste): `planilha:realizado-proprio`.
- "Definir o que o usuário tem acesso" (sprint 1.11, em teste).
