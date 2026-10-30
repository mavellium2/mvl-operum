<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Versionamento das atualizações

- Antes de concluir uma alteração e abrir ou atualizar uma PR, avaliar seu impacto na versão do Operum. Atualizar a versão sempre que a entrega alterar comportamento, funcionalidades, APIs/MCP, segurança ou dependências de produção.
- Seguir SemVer (`MAJOR.MINOR.PATCH`): PATCH para correções e atualizações de segurança compatíveis; MINOR para funcionalidades novas compatíveis; MAJOR para mudanças incompatíveis. Em uma entrega com vários itens, usar o maior impacto e incrementar uma única vez, não a cada commit ou ajuste de revisão.
- Mudanças exclusivamente em documentação, testes, formatação ou refatorações sem efeito no comportamento não exigem incremento. Registrar na descrição da PR quando o incremento não se aplicar.
- Usar `version` do `package.json` da raiz como fonte única da versão do produto. A interface já recebe esse valor por `NEXT_PUBLIC_APP_VERSION` em `next.config.ts`; não duplicar versões manualmente na UI nem incrementar automaticamente os pacotes dos microsserviços.
- Quando houver incremento, atualizar no mesmo conjunto de alterações o `package.json` e o `CHANGELOG.md`, com a versão, a data e um resumo do que mudou. Atualizar lockfiles e outras referências somente quando forem afetados, preservando a instalação com `--frozen-lockfile`.
- Conferir a versão mais recente da branch de destino antes de escolher o número e novamente antes do merge, para evitar versões repetidas ou regressões entre PRs paralelas. Se a versão da base avançar, ajustar a versão e o changelog da PR.
- Incluir na descrição da PR a versão anterior e a nova, além do motivo do incremento. A regra de versionamento não autoriza merge, publicação de release ou deploy; seguir as autorizações da tarefa.


# Arquitetura e registro de decisões

- Em cada PR, avaliar o impacto em `docs/architecture.md` e `docs/decisions.md`, junto da avaliação de versão. Atualizar a documentação na mesma PR que muda a implementação; não esperar um prazo semanal ou mensal.
- Atualizar as seções afetadas de `docs/architecture.md` quando mudar serviços ou responsabilidades, fluxos de dados, contratos de API/MCP, modelos de dados e migrations, autenticação/autorização e isolamento de tenant, integrações, infraestrutura, deploy ou configuração operacional. Ajustar diagramas, tabelas e exemplos afetados. Distinguir o estado implementado de propostas e pendências.
- Correções internas, ajustes visuais e mudanças de texto sem impacto arquitetural não exigem reescrever a arquitetura. Na descrição da PR, indicar os documentos atualizados ou explicar brevemente por que não se aplica.
- Ao concluir uma fase do SDD ou preparar uma release, fazer uma revisão de consistência das áreas alteradas desde o marco anterior. Essa revisão complementa a atualização por PR; não a substitui.
- Registrar em `docs/decisions.md` escolhas relevantes e seus motivos: adoção ou troca de tecnologia, limites entre serviços, persistência, segurança, integrações, deploy e compromissos que afetem a evolução do projeto. Não criar um registro para cada ajuste trivial.
- Cada decisão deve ter ID estável, título, data do registro, status, contexto, escolha, justificativa, alternativas consideradas, consequências e referências ao código, SDD, commit ou PR. Incluir condições de revisão quando conhecidas. Propostas ainda não aprovadas devem permanecer identificadas como propostas.
- Para decisões antigas, usar apenas evidências do repositório ou informações confirmadas pelo usuário. Identificar registros retrospectivos; não inventar data de aprovação, participantes, alternativas avaliadas ou motivos históricos. Marcar o que não estiver documentado como tal.
- Preservar o histórico: uma mudança de direção cria uma nova decisão e marca a anterior como substituída, com links entre ambas. `architecture.md` descreve como o sistema funciona hoje; `decisions.md` explica por que as escolhas foram feitas; `CHANGELOG.md` resume o que mudou em cada versão.
