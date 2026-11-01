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


# Reutilização obrigatória de componentes de interface

- Antes de implementar ou alterar uma interface, procurar o componente existente em `components/ui` e os componentes de domínio. Reutilizá-lo; não recriar marcação, estilos ou comportamento equivalentes na página.
- Criou um componente reutilizável: aplicar aos demais usos equivalentes no escopo solicitado, em vez de manter versões paralelas. Corrigir o componente compartilhado quando a melhoria for comum a todos os consumidores.
- Campos de texto usam `Input` e `Textarea` de `components/ui/Field.tsx`. Campos compostos usam `FieldGroup` para compartilhar o foco externo sem duplicar o aro no input interno. Campos especializados (senha, contato, moeda, data, edição expansível) compõem essa base e mantêm suas máscaras, validações e acessibilidade. Seletores novos usam `Select`; seletores nativos existentes usam `NativeSelect` da mesma base.
- Hover, pressão e foco dos campos têm fonte única em `components/ui/Field.css`. Não duplicar esses estados por página, nem adicionar anéis grossos ou sobrescritas locais para reproduzir o mesmo efeito. Preservar indicação de erro, navegação por teclado, desabilitado, somente leitura e preferências de acessibilidade.
- Não criar `<button>` nativo fora de `GlassButton`: ações usam suas variantes e controles específicos usam `custom`, preservando type e semântica. A API legada `Button` delega à mesma base. Botões de vidro usam `GlassButton`; fechar usa `GlassCloseButton`; cards de vidro usam `GlassCard` (ou `SettingsCard` nas configurações); visualização/recorte de imagem usa `GlassImageUpload`. Estender a API do componente quando necessário, preservando seus consumidores.
- Inputs nativos ficam restritos à implementação da base e controles de outra natureza: hidden, arquivo, checkbox, radio, range, cor e botões nativos. Qualquer outra exceção exige motivo técnico explícito junto ao código e na descrição da PR; conveniência visual não justifica duplicação.
- Antes de concluir, verificar se restaram usos equivalentes fora do componente e executar as verificações pertinentes. Não declarar migração global concluída se houver telas pendentes.

# Animação e resposta visual da interface

- Toda nova interface ou melhoria deve comunicar interação: hover, foco por teclado, pressão, seleção, carregamento, sucesso e erro, conforme o controle. O ponto de partida aplicado é Configurações (submenu, cards e botões).
- Reutilizar a animação no componente compartilhado, não copiar keyframes e transições por página. Ações usam GlassButton; fechamento usa GlassCloseButton; cards usam GlassCard com `interactive` quando recebem esse tratamento. Controles específicos, como tabs e opções de menus, usam o modo `custom` para preservar dimensões e semântica.
- Priorizar transições suaves, curtas e discretas. Nada de pulsação permanente, deslocamentos grandes ou efeitos que atrapalhem leitura, digitação ou cliques. Estados de carregamento devem desabilitar apenas as ações pertinentes e não aceitar envios duplicados.
- Respeitar `prefers-reduced-motion`, `prefers-reduced-transparency`, foco visível, disabled e readonly. A interface deve continuar compreensível sem animação e utilizável por teclado.
- Entradas e saídas devem acompanhar o ciclo real do componente; cancelar animações no descarte. Não atrasar confirmação de segurança ou disparar uma exclusão apenas para mostrar um efeito. Animações de remoção de linha do editor permanecem específicas desse fluxo confirmado.

# Prioridade e posição das ações de salvar

- Salvar deve ficar visível e acessível enquanto o usuário edita, sem exigir rolagem até o fim. A ação permanece no rodapé; mover o botão para o cabeçalho não resolve essa exigência.
- Reutilizar `FormActions` para o rodapé e `FormBody` para os dados roláveis. Em painéis de altura limitada, usar `form-layout`, manter somente FormBody com overflow e deixar o rodapé fora dessa rolagem. Não criar uma faixa sobreposta que esconda os últimos campos ou corte a borda inferior do card.
- O rodapé usa o material do card e a paleta atual, sem fundo branco opaco imposto a todos os temas. Preservar padding, borda inteira e espaço para alcançar o último campo.
- Preservar o formulário nativo, type, validação, estado de carregamento e foco; não duplicar botões em portais para simular um rodapé. Manter os docks/rodapés existentes que já cumprem a regra.
- Antes de concluir, verificar o primeiro e o último campo e confirmar que Salvar continua visível no topo e no fim da rolagem. Testar também modais e janelas com menor altura nas áreas alteradas.
