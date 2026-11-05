# Changelog

Versionamento semântico (`MAJOR.MINOR.PATCH`). A versão exibida na UI (rodapé da
sidebar e `/sobre`) vem de `package.json` → `NEXT_PUBLIC_APP_VERSION` em `next.config.ts`.

As versões até 1.6.0 foram reconstruídas retroativamente a partir do histórico do git:
1.0.0 marca a entrada em produção na arquitetura de microsserviços, e cada marco de
funcionalidade depois disso é uma versão MINOR.

## [1.54.0] — 2026-11-05

- **Apresentação dos gráficos 3D:** cards, tipografia e textos adaptados à aparência do Operum; legenda de elaboradores responsiva com nomes completos. Valores financeiros em reais, com rótulos separados acima das colunas e renderizados em primeiro plano.

- **Hidratação dos gráficos:** títulos SVG gerados como texto único, evitando diferenças entre servidor e navegador e a recriação da página no cliente.

- **Gráficos da planilha:** preservados os quadros-resumo e substituídos os gráficos Valores por macrofase, Tempo por macrofase e Atividades por elaborador por colunas agrupadas 3D para Valores e Tempo e pizza 3D para Elaboração das Atividades, conforme referência Excel fornecida. Preserva títulos, paleta Office 2007, valores sobre as colunas, rótulos inclinados e legenda lateral da pizza. Renderização SVG com dados vivos, descrição acessível e sem animações de recálculo.

## [1.53.0] — 2026-11-05

- **Cards legíveis:** descrições e comentários passam a mostrar Markdown, com títulos, listas, negrito, tabelas, checklists e links. HTML digitado não é executado, links externos abrem em outra aba e tabelas largas rolam dentro do próprio bloco. Comentários longos deixam de virar uma linha só; durante a busca de comentários, o texto aparece simples com os termos realçados. Incorpora a 1.51.0, que não chegou a ser publicada.

- **Minicard do quadro:** o resumo da descrição aparece como texto simples, sem os símbolos de Markdown.

- **MCP:** as instruções do servidor trazem uma regra de escrita para agentes (resultado primeiro, parágrafos curtos, listas e linha em branco entre blocos), e os campos de descrição e comentário apontam para ela.

- **Dependências:** `react-markdown` 10.1.0 e `remark-gfm` 4.0.1 (ADR-086).

- **Partes interessadas:** diretório e formulário dos painéis de adicionar interno/externo ocupam toda a largura disponível, sem herdar a largura de um terço da tela de cadastros.

- **EAP documental:** árvore textual usa a mesma família de fonte do cabeçalho (Arial), mantendo negrito e recuos da hierarquia.

- **Remover envolvidos:** lixeira em cada pessoa dos grupos personalizados e Backspace em linhas vazias removem a linha, preservando o restante e devolvendo o foco à anterior.

- **Espaçamento de envolvidos:** edição, leitura e impressão usam o mesmo bloco compartilhado: título em linha inteira, lista na linha seguinte com recuo de 22,5 mm, entrelinha compacta e 4 mm entre grupos. Controles de reordenação não aumentam a altura do título.

- **Teclado e títulos nos documentos:** Tab/Shift+Tab percorrem também os novos campos e botões sem voltar ao início. Títulos preservam espaços e pontuação digitados. Todas as listas de envolvidos começam na linha abaixo de seu título.

- **Listas de envolvidos:** títulos e pessoas alinhados em colunas, com hífen antes de cada pessoa; botão de adicionar título com foco imediato e Enter para avançar/inserir pessoas. Mesma apresentação na leitura, impressão e Word.

- **Principais envolvidos no Termo:** adicionar títulos com conteúdo multilinha, mover blocos completos para cima/baixo e exibir integrantes um por linha. A ordem também é preservada na impressão e no Word; documentos antigos continuam legíveis.

- **Custos no Termo de Abertura:** valores alinhados à direita e formatados em reais, com máscara de moeda na edição.

- **Termo de Abertura:** removidas as ações de adicionar e excluir macrofases no documento; a gestão da estrutura permanece no projeto/EAP/planilha.

- **Navegação de atas:** o submenu Documentação permanece aberto na lista, criação e leitura/edição de atas, com Atas de Reunião selecionado.

- **Editar projeto:** Objetivo e Descrição do Produto/Serviço ocupam toda a largura do formulário, com a descrição abaixo do objetivo.

- **Barra superior da planilha:** título, período, status e ações alinhados em uma única linha, com rolagem horizontal em telas pequenas.

- **Desempenho do salvamento automático:** edições de campos não recarregam a tabela nem repetem a sincronização completa EAP/sprints. Cálculos derivados são propagados uma vez por lote; atualizações necessárias de estrutura usam transição de baixa prioridade.

- **Continuidade no salvamento:** atividades novas permanecem visíveis entre a confirmação da estrutura e a chegada dos dados atualizados do servidor, sem desaparecer e reaparecer.

- **Salvamento automático e versões da planilha:** alterações são gravadas após uma pausa, sem exigir Salvar para trabalhar. O histórico registra estados restauráveis com autor e data, numerados `v1.0.1`, `v1.0.2`, …, `v1.0.99`, `v1.1.0`. Restaurar preserva o histórico e gera uma nova versão. Inclui estrutura, campos, descrição, prioridade, responsáveis, anexos, comentários e lançamentos encerrados; cronômetros precisam estar parados para restaurar.

- **Abas de nova atividade:** seção de conversa não aparece na aba Atividade; comentários permanecem separados na aba própria.

- **Painel de nova atividade:** descrição editável e seleção, renomeação e remoção de anexos disponíveis antes de salvar. Arquivos ficam no rascunho e são enviados automaticamente após a criação do card; falhas preservam os arquivos pendentes e não reenviam os concluídos.

- **Prioridade antes de salvar:** novas atividades já exibem a bandeira logo após o título na ordem do Tab. A seleção fica no rascunho e é aplicada ao card após criação e sincronização automáticas; falhas preservam a escolha para tentar novamente.

- **Prioridade na tabela:** clicar na bandeira permite escolher Baixa, Média ou Alta, com gravação direta no card, sem abrir o painel lateral e respeitando as permissões existentes.

- **Acessibilidade na planilha:** seletor de elaboradores ganha foco visível no campo e na pessoa selecionada; setas, Home/End percorrem opções, Espaço/Enter marcam, Esc retorna ao campo e Tab avança. Rolar a lista não fecha o seletor.

- **Calendário acessível:** ícone do SeletorData agora é botão na ordem do Tab, com foco visível e ativação por Enter/Espaço; abre no dia selecionado e Esc devolve o foco ao ícone.

- **Datas na planilha:** Data prevista e Data realização passam a usar o mesmo SeletorData de Editar projeto, com calendário e navegação por teclado compartilhados.

- **Formatação de minutos:** células de realizado e conversões de horas/dias exibem no máximo duas casas decimais, evitando dízimas extensas.

- **Tempo realizado editável:** Min, Horas e Dias exibem o realizado total já existente (manual mais apontamentos). A edição ajusta a parcela manual pela diferença, sem duplicar apontamentos, com conversão entre unidades e atualização dos totais. A edição permite reduzir o total por um ajuste explícito, sem alterar os lançamentos (ADR-092). Os apontamentos do card continuam somados ao manual, preservando a regra de cálculo e as permissões existentes.

- **Atividades na planilha:** removidos os controles de iniciar/parar timer das linhas.

- **Painel de atividade:** ícone lateral disponível desde a criação da linha, incluindo edição do título e elaboradores no rascunho.

- **Ações das atividades:** menu substituído por “+” para inserir imediatamente abaixo e lixeira com confirmação de exclusão. A inserção intermediária renumera os irmãos na prévia e na EAP ao salvar; o “+” da macrofase continua acrescentando no fim.

- **Nova atividade:** o “+” da macrofase cria a última atividade; o “+” da atividade insere abaixo dela, já com o próximo código hierárquico na prévia e sincronização explícita com as sprints ao salvar (conforme permissões). A linha aparece completa, com foco e seleção no título e os demais campos disponíveis para preenchimento direto, sem formulário intermediário.

- **Ações da macrofase na planilha:** botão “+” adiciona uma tarefa diretamente, substituindo o menu de três pontos e sua opção de exclusão.

- **Numeração de macrofases:** após editar o título de um novo bloco, o campo de número recebe foco e seleção automaticamente; digitar a posição e pressionar Enter reorganiza a planilha sem cliques adicionais. Salvar exige essa escolha e aplica a ordem à EAP, cuja sincronização atualiza os códigos das sprints vinculadas.

- **Planilha de custos:** adicionar macrofase cria diretamente um bloco no início da tabela, com numeração automática e foco no título para edição, pendente de Salvar. Botão compacto de adicionar macrofase posicionado à direita do título da coluna Macrofases. A ação continua disponível na planilha vazia.

## [1.52.0] — 2026-11-04

- **Card na planilha de custos:** bandeiras indicam a prioridade das atividades. O painel lateral abre na aba Atividade pelo ícone da linha ou pelos valores realizados. A aba Atividade usa o componente do card da sprint encaixado no painel lateral, com edição da descrição e da prioridade, comentários e anexos. Arquivos enviados pela conversa aparecem como mensagens e também em Anexos. Menções a pessoas do projeto geram notificações e um aviso no canto da tela.

- **Comentários:** a conversa do card ganha uma busca que filtra as mensagens por texto ou autor, destaca o termo encontrado e informa quantos comentários correspondem. Funciona no modal do quadro e no painel de atividade da planilha de custos.

- **Lançamento manual de tempo:** o formulário do timer ganha o campo Dias, além de horas e minutos. Os campos começam vazios, sem o 0 preso na frente, e o lançamento só é gravado com um tempo válido. Períodos acima de 12 h são divididos automaticamente em lançamentos contíguos de até 12 h, com desfazimento dos já gravados se algum falhar. Quando o período se sobrepõe a um lançamento existente, a mensagem mostra a duração, o intervalo e a descrição desse lançamento e orienta a editá-lo/excluí-lo ou ajustar a duração.

- **Planilha de custos:** a macrofase ganha “Excluir macrofase” no menu de ações. A confirmação mostra o impacto (atividades, tarefas, sprints e custos) e pede o motivo quando a sprint tem dados. Ao confirmar, a macrofase e todas as atividades saem da EAP e das sprints. Com alterações pendentes na planilha, a exclusão pede para salvar ou descartar antes (ADR-087).
- **Realizado não perde o tempo digitado:** antes, o primeiro apontamento do card (por exemplo, ao usar o play/stop) substituía os minutos digitados na planilha. Agora os dois somam: o campo Min continua editável com a parte digitada, e um selo na mesma linha mostra quanto veio do timer. Nenhuma atividade em produção estava nessa situação (ADR-089).
- **Minutos com duas casas:** Sub-total, Total do projeto, quadro de tempo, gráficos e detalhes do card mostram minutos quebrados com duas casas (1.640,18) e inteiros sem casas.
- **Planilha de custos como a sprint da gestão:** cada atividade ligada a um card ganha o play/stop do quadro (só o ícone; o tempo aparece enquanto roda) e um botão de detalhes. O painel lateral mostra macrofase, etapa na sprint, responsáveis, timer e descrição, que pode ser editada ali e é a mesma do card. Ao pausar, o tempo entra no realizado (ADR-088).
- **Planilha de custos:** a macrofase vira uma faixa de seção, com fundo e borda próprios, nome em destaque e a contagem de atividades. O título começa na margem esquerda da planilha, seguido pelos controles de arrastar e de ações. A coluna de atividades fica fixa na rolagem horizontal e os campos calculados aparecem sem fundo de edição.
- **Planilha de custos:** a coluna Atividades tem largura limitada. Nomes longos quebram em até 3 linhas, e o nome completo aparece ao passar o mouse ou ao editar.
- **Exportação da planilha:** o valor por minuto aparece com duas casas decimais no Excel, como na tela (R$ 0,2251 → R$ 0,23). A célula guarda o valor completo, e os totais não mudam.
- Versão escolhida acima de 1.51.0, reservada para a entrega de Markdown nos cards (branch `feat/markdown-cards-mcp`).

## [1.50.0] — 2026-11-03

- **Planilha de custos:** campos, elaboradores, nomes e operações de criar, arrastar e excluir ficam em rascunho até “Salvar alterações”. Totais, quadros e gráficos refletem a prévia imediatamente; erros indicam a linha e permitem corrigir e tentar de novo. A estrutura salva aparece na EAP e nas sprints. A barra superior organiza identificação, período e ações em uma linha no desktop, com grupos compactos e salvar destacado quando há pendências. Gráficos de valores e tempo usam barras horizontais com rolagem quando há muitas fases; a distribuição por elaborador ganha gráfico de anel e lista legível nas aparências do sistema.
- **Navegação:** ocultar o menu lateral fica junto do controle de recolher.
- **Atas:** edição e criação usam área de trabalho integrada às aparências, cabeçalho compacto e folha preservada para impressão.
- **Login multi-instituição:** uma preferência antiga no navegador deixa de bloquear a senha correta de outra conta do mesmo e-mail; senha, estado e bloqueio continuam validados pelo serviço de autenticação.
- **Carregamento da interface:** a inicialização da aparência usa o componente de script do Next.js e o painel flutuante de alterações só abre após a montagem no navegador, evitando avisos de script e divergência de hidratação.
- **EAP/WBS:** ferramentas reunidas numa única barra compacta no desktop, aparência do sistema aplicada com vidro discreto aos controles, menus e painel de propriedades, Gantt sem fundo branco fixo, enquadramento preservado quando o menu lateral muda de largura e “Ajustar tela” passa a mostrar todos os cards visíveis. O menu de visualizações abre sobre a barra sem ser cortado; Dia, Semana e Mês alteram a escala do Gantt mesmo em períodos curtos.
- **Sincronização automática:** EAP e planilha deixam de exibir avisos de sucesso ou pendências de rotina; uma falha real continua visível com nova tentativa disponível.
- **Documentos:** área de trabalho, ferramentas e lista de atas acompanham a aparência selecionada com superfícies discretas; ícones da barra recebem contraste e tamanho próprios, e as folhas preservam o branco e as cores para leitura e impressão.
- **Planilha de custos:** cabeçalho compacto em uma linha no desktop, sem espaço vazio acima; tabela com rolagem própria, títulos fixos e cores próprias para cabeçalho, dados e totais, preservando a ordem das colunas, resumos e gráficos.
- Versão escolhida acima de 1.49.1, a mais recente em origin/main.

## [1.49.1] — 2026-11-03

- **Arquivos:** nova tentativa breve quando a conferência de cards está temporariamente indisponível; falha persistente continua visível no aviso da página sem abrir erro de console no ambiente local.

## [1.49.0] — 2026-11-02

- **Validação da listagem:** rejeita parâmetros de consulta repetidos ou em formato de lista antes de usar filtros e paginação, eliminando confusão de tipos na API de projetos.

- **Login após inatividade:** preserva a instituição da sessão verificada antes de encerrá-la, evitando que uma preferência antiga provoque “Credenciais inválidas” no próximo acesso.

- **Permissões individuais:** grupos recolhíveis em vidro, pesquisa, controles compartilhados de herdar/permitir/negar e indicação discreta de salvamento automático e exceções.

- **Vínculo do usuário:** cargo e departamento selecionados nos catálogos; salário mensal e horas diárias substituem a edição direta de valor/hora, com prévia de dia, hora e minuto e persistência pela action compartilhada de membros.

- **Layout de usuários:** topo estável, lista compacta, endereço/senha recolhidos e rolagem independente somente por necessidade, com ações de salvar fora do corpo rolável.

- **Editar usuário:** altura natural conforme os campos e projetos vinculados, sem limite fixo no painel nem rolagem interna do formulário.

- **Detalhes do usuário:** edição e permissões em painel à direita da lista, sem modal, com seleção destacada e ações de salvar fora da rolagem. Painel compartilhado com o cadastro de stakeholders.

- **Usuários do admin:** layout em vidro adaptado às aparências, pesquisa ampliada, filtros em popover, edição compartilhada, ações compactas, inativos ao final e feedback de erros ao ativar/inativar.

- **Exclusão de projetos:** confirmação permanece aberta quando uma Server Action reenvia o mesmo lote; a lista preserva os cards e seus estados locais.

- **Cards de projetos:** hover com elevação discreta e iluminação estável de vidro, pressão breve ao clicar e retorno suave, sem seta, e quantidade de macrofases junto aos membros e período.

- **Isolamento da dashboard administrativa:** indicadores, gráficos, ranking, projetos e rascunhos consideram somente a instituição atual, reutilizando o contrato autenticado de métricas. Removida a faixa clara do cabeçalho de Meus projetos.

- **Carregamento sob demanda:** Meus projetos começa com 9 cards e acrescenta até 9 por clique em “Carregar mais projetos”, preservando pesquisa, filtros e posição. Inclui progresso, proteção contra cliques repetidos e nova tentativa em falhas.

- **Meus projetos:** pesquisa por nome/descrição, filtro por situação em popover de vidro e período completo nos cards. Ativos vêm antes dos concluídos, arquivados e inativos, com estilos próprios e ordenação aplicada antes da paginação.

- **Projetos:** nova tela em vidro adaptada às aparências, cards responsivos, ações compartilhadas e último projeto aberto em primeiro, por conta/instituição neste navegador.

- **Contexto de navegação:** Departamentos, Funções, Configurações, Sobre e Notificações preservam o menu do projeto durante a navegação; sair para a lista de projetos ou trocar de instituição encerra esse contexto.

- **Navegação do projeto:** identidade em vidro, retorno aos projetos no topo, áreas de trabalho antes da edição e subitens de documentos integrados ao tema.

- **Menu lateral:** nova composição de vidro adaptada à aparência, instituição no topo, navegação agrupada e conta no rodapé. Menus global e de projeto compartilham modos expandido, compacto e oculto, com preferência persistida.
- **Instituições e conta:** busca, papel por instituição, confirmação de senha no próprio seletor e mensagens de falha. Perfil, configurações, Sobre e saída ficam no menu da conta; troca e logout respeitam a guarda de alterações não salvas existente.
- **Responsividade e teclado:** painel móvel com navegação rolável, foco contido e retorno ao acionador; popovers ficam dentro da área acessível do menu móvel. Identificação dos ícones compactos, estado ativo semântico e atalho Ctrl/Cmd K para pesquisar.
- **Sessão compartilhada:** navegação e conta reutilizam a consulta de sessão no AppShell; a preferência do menu continua ao entrar ou sair de projetos. Sem migrations ou novas dependências de produção.

## [1.48.0] — 2026-11-02

- **Botões de fechar:** controles de X restantes passam a usar GlassCloseButton, preservando eventos, foco, referências e rótulos.
- **Inicialização da aparência:** preferência aplicada antes da hidratação, estado compartilhado entre telas e remoção do fundo escuro temporário. Seletor de vidro ganha resposta curta, sem salto ou oscilação.
- **Editar animado:** AnimatedEditButton compartilha vidro e animação suave de lápis em Departamentos e Funções, com resposta ao teclado e redução de movimento.
- **Lixeira compartilhada:** Departamentos e Funções reutilizam AnimatedTrashButton do editor, incluindo tampa e brilho; exclusões com falha preservam os cards. Estilos passam a acompanhar o componente.
- **Navegação de cadastros:** seletor compartilhado permanece montado no layout entre as rotas, preservando a animação da lente de vidro.
- **Painel compartilhado de alterações:** ChangesPanel extraído do editor e reutilizado em acessos com os mesmos cards, vidro, animação, rolagem e ação de desfazer. Regra explícita de reutilização registrada em AGENTS.md.
- **Rodapé dos acessos:** indicador clicável mostra alterações e permite descartar escolhas locais. Área de dados com FormBody e rolagem real mantém Salvar acessível também em telas pequenas.
- **Interruptores de acesso:** componente Switch compartilhado substitui checkboxes de permissões; cada grupo permite ativar/desativar todos sem afetar outros grupos nem salvar automaticamente.
- **Funções e departamentos:** catálogos em cards de vidro separados, pesquisa compartilhada e navegação segmentada. Cards selecionam diretamente os acessos da função, sem botão intermediário nem textos redundantes. Painel Acessos da equipe agrupa controles e sinaliza escolhas pendentes. No desktop, permissões ficam ao lado do catálogo, com seleção por função e botão de salvar fora da rolagem dos dados.
- **Retorno após logout:** preferência de última instituição no navegador, validada novamente por conta, senha e situação do ambiente no login, inclusive no host compartilhado de produção.
- **Ciclo de instituições:** suspensas vão ao fim da lista com aparência desabilitada; exclusão registra deletedAt e retira o ambiente da listagem, mantendo o histórico conforme a política de conservação.
- **Troca de instituições:** corrige rejeição de UUIDs de instituições anteriores, mantendo validação de formato, vínculo e senha junto ao suporte a CUID.
- **Administrador da nova instituição:** criação da instituição, vínculo do criador como administrador, identidade compartilhada e auditoria passam a ser uma única transação; falhas não deixam um ambiente sem administrador.
- **Criação de instituições:** identificador gerado pelo nome, consulta de disponibilidade restrita ao operador, sugestões com sufixos numéricos e edição manual preservada. Validação no servidor cobre formato, tamanho e concorrência de criação.
- **Instituições da plataforma:** área do operador diferenciada de Minhas instituições, com aparência adaptativa, cards de vidro, pesquisa e filtros de situação, cards compartilhados com Configurações, ações explícitas e confirmação de inativação/exclusão lógica. Cards exibem usuários e projetos, vínculo destacado e acesso direto com o fluxo autenticado de troca de conta. Edição inclui identificador com validação e aviso de impacto no login. Erros de edição visíveis. Permissões e ações administrativas permanecem separadas.
- **Privacidade e termos:** páginas públicas com navegação entre documentos e links no Sobre; texto sobre conta, colaboração, dados pessoais, integrações e canal institucional do responsável.
- **Busca no histórico:** versões do Sobre recebem pesquisa por versão/conteúdo, intervalo de datas inclusivo, ordenação crescente/decrescente e limpeza dos filtros com campos compartilhados.
- **Sobre:** visão geral e histórico em áreas separadas, cards compactos de produto/equipe e aparência adaptativa compartilhada com o editor. Créditos separados por desenvolvimento e orientação acadêmica, com Fábio Rodrigues Gonçalves, e versão copiável.

## [1.47.0] — 2026-11-01

- **Configurações:** aparência adaptativa e vidro em todas as seções, navegação fixa, cabeçalho compacto e animações suaves no submenu, cards e botões. Perfil reorganizado em colunas com visualização e recorte da foto compartilhados com a logo do projeto.
- **Salvar acessível:** rodapés compartilham FormActions. Perfil usa card de altura automática limitada ao espaço disponível, campos roláveis em FormBody e botão Salvar embaixo, sem faixa de fundo e sem cortar a borda do card.
- **Integrações:** áreas separadas para conectar aplicativos, gerenciar conexões e tokens; pesquisa, contadores, cabeçalho fixo e formulários preservados ao alternar. Guias em modal de vidro com passos numerados e conexão copiável.
- **Instituições:** pesquisa por nome/identificador e edição da instituição ativa por administrador, com validação de formato, unicidade do identificador e auditoria na mesma transação. A UI informa o uso do novo identificador na entrada. Status e acesso a outros tenants permanecem fora dessa edição.
- **Componentes compartilhados:** 106 campos em 51 arquivos e 308 botões nativos em 80 arquivos migram para bases reutilizáveis, preservando referências, tipos e submissão nativa. Busca e interação dos cards também são compartilhadas. Regras em AGENTS.md e verificações automáticas impedem campos/botões nativos paralelos.
- **Documentação:** arquitetura atualizada; ADRs 081/082 registram o escopo de edição da instituição. Sem migrations ou novas dependências de produção.

## [1.46.0] — 2026-11-01

- **Aparência:** novo visual diurno entre 12h e 17h e entardecer entre 17h e 19h, com escolha manual nas configurações. No automático, céu e vidro se misturam por dez minutos em cada virada, respeitando redução de movimento. Indicadores financeiros e Adicionar Fase recebem cores e vidro próprios para o entardecer.
- **Editor:** criação de projetos usa o mesmo visual da edição e inicia com foco no nome. Altura do cronograma e reserva do menu inferior se adaptam ao espaço disponível; melhorias de contraste, calendário e painéis.
- **Validação:** avisos junto aos campos e atalhos para corrigir nome obrigatório, datas inválidas ou invertidas, fases duplicadas ou incompletas e limites de texto. Histórico e alterações recebem foco, fecham com Esc e devolvem o foco ao botão.
- **Salvamento atômico:** dados, EAP, vínculos, Termo e histórico do editor confirmam na mesma transação, incluindo restauração e exclusão de fase. Recibos por tentativa permitem reenviar após perda de resposta sem duplicar versões ou documentos. Aplicar a migration `20261101170000_projeto_operacao_atomica` e regenerar o Prisma Client.
- **Documentação:** arquitetura atualizada e ADR 080 para transações e repetição segura das operações do editor. Sem novas dependências de produção.

## [1.45.0] — 2026-11-01

- **Editar Projeto:** layout compacto com abas Diretrizes/Escopo e Cronograma Financeiro, propriedades laterais, barra inferior centralizada e componentes reutilizáveis de vidro para cards, botões e seletores.
- **Aparência:** paletas de manhã, tarde e noite, automático por horário local, modos fixos claro/tarde/escuro e preferência do sistema em Configurações → Aparência. Escolha local por navegador; aplicação inicial no editor e em seu menu lateral.
- **Histórico:** versões preservadas, comparação de alterações, desfazer por campo e confirmação de restauração. Restaurar ativa a versão escolhida sem criar outra; o próximo salvamento pede confirmação e usa o maior número do histórico mais um.
- **Fases:** inclusão com foco e rolagem suave; exclusão de fases salvas com prévia de impacto na EAP, sprints, tarefas, custos e Termo. Campos pareados expandem/recolhem juntos; datas usam calendário compartilhado.
- **Segurança:** prévia do recorte decodifica PNG/JPEG/WebP e desenha em canvas, evitando interpretar a URL do arquivo como conteúdo HTML (CodeQL js/xss-through-dom).
- **Imagem do projeto:** visualização ampliada, moldura de vidro e recorte com zoom e posição antes do envio.
- **Ata e documentação:** lista de atas com resumo/status e revisão de propostas por ata, preservando as correções publicadas na 1.44.1.
- **Acessibilidade:** foco e teclado nos controles, avisos de alterações pendentes, redução de movimento/transparência e adaptação dos painéis à tela.
- **Desenvolvimento:** corrige resolução de imports do MCP em `pnpm dev:all`. Sem dependências novas. Inclui migrations de histórico e versão ativa; aplicar migrations e regenerar Prisma antes de executar a versão atualizada.

## [1.44.1] — 2026-10-31

- **Ata no modelo "01_Form Ata de Reunião":** quadro e seções I a IV numa tabela contínua, rótulos em negrito, "Nome:"/"Setor/Empresa:", assinaturas numa caixa cinza e "Obs:" em negrito; sem o "© 01_Form Ata de Reunião", na folha e no Word. Os botões de adicionar ficam sobre a borda da tabela, sem abrir espaço entre as seções. "Adicionar presente" já abre o seletor de membro da linha nova.
- **Correção — presentes da Ata:** "Incluir toda a equipe" e "Adicionar presente" só mostravam a primeira linha (a folha escondia as linhas novas das tabelas).
- **Correção — texto sobreposto no Termo (Firefox):** a caixa de texto ficava presa à altura mínima da célula e o texto passava por cima das seções seguintes; a paginação também via tudo numa folha só. Agora a caixa cresce com o texto e os blocos da folha não encolhem.
- **"Página X de Y" em todos os documentos**, inclusive no Termo de Abertura.
- **EAP gráfica idêntica à aba EAP/WBS** (formato, cores e conectores), no lugar das colunas do modelo da 1.44.0 (ADR-075).

## [1.44.0] — 2026-10-31

- **Folhas A4 de verdade, como no Word:** cada documento é distribuído em folhas A4 separadas (210 × 297 mm; paisagem 297 × 210 mm), na tela e no PDF. Blocos inteiros (cabeçalho, quadro, assinaturas) não se partem; tabelas quebram entre linhas, sem cortar uma linha, com o cabeçalho das colunas repetido quando o modelo pede; textos longos continuam na folha seguinte a partir de uma linha inteira e seguem editáveis atravessando a quebra (setas, apagar e cursor acompanham). Rodapé "Página X de Y" em cada folha (e "Operum · documento · versão" na Ata). Margens laterais estreitas (10 mm) para aproveitar a folha. O PDF imprime as mesmas folhas.
- **Termo de Abertura no modelo do professor ("02_Project Charter"):** logo e título "Termo de Abertura de Projeto - Project Charter", quadro com rótulos em negrito, seções com o título acima da caixa (Justificativa, Objetivos, Metodologia, Descrição do produto), premissas e restrições lado a lado item a item, macro fases numeradas (1.1, 1.2…) com custo total, principais envolvidos agrupados e designação de gerente.
- **EAP no modelo da aula ("04 Aula GP - Modelo de EAP"):** folha paisagem com os títulos "Modelo de Estrutura Analítica do Projeto (EAP - Gráfica)" e "(EAP - Texto)", quadro de identificação em negrito e EAP em texto recuada por nível; a EAP gráfica usa o arranjo em colunas do modelo (fases lado a lado) com as cores dos blocos da aba EAP/WBS, e todas as páginas mostram "Página X de Y". Corrige a EAP gráfica ilegível em projetos com muitos itens (encolhida para caber na folha): com muitas fases os blocos ficam mais estreitos e o texto quebra em linhas, sem diminuir a fonte. O contador "Páginas" do editor passa a contar as folhas reais.
- **Correção — documentos travando o navegador:** a folha media a página de novo sem parar enquanto o documento ficava aberto (cerca de 2 mil vezes por segundo), o que consumia CPU e memória até travar o navegador, principalmente na EAP. Agora mede de novo só quando o conteúdo, as fontes ou as imagens mudam.

## [1.43.0] — 2026-10-30

- **Documentos — edição direto na folha:** Termo de Abertura, Partes Interessadas, EAP e Atas passam a ser editados na própria folha A4 (o que se vê é o que sai no PDF), no lugar do formulário + "Gerar documento". Segue a tela "Edição de documento" desenhada no Penpot.
- **Barra do documento:** grupos Versão (abre versões anteriores só para leitura), Documento (salvar versão — Ctrl+S, histórico, revisar proposta pendente com contador, imprimir — Ctrl+P), Edição (desfazer/refazer — Ctrl+Z/Ctrl+Shift+Z, adicionar linha, limpar campo), Navegar (campo anterior/próximo com Tab e próximo campo vazio com contador; na EAP, Páginas 1/2), Download (PDF e Word), Outros (ajustar à largura, zoom, ajuda rápida e manual), indicador de salvamento e "Editar dados do projeto" para corrigir o cadastro compartilhado (nome, gerente, classificação), que vale para todos os documentos atuais; os registros históricos são preservados.
- **Kit de campos:** dados do cadastro (sem cadeado nem dica "Automático"), Texto (vazio mostra a pergunta que orienta), Pessoa, Data (dd/mm/aaaa) e Lista/tabela ("+ Adicionar" no fim e "×" na linha). O campo em foco mostra ao lado da folha a ajuda, o contador de caracteres e "Tab → próximo campo".
- **Folha:** seções numeradas em romano com faixa cinza, bloco de assinaturas no fim e rodapé "Operum · documento · versão" com "Página X de Y" em todas as páginas do PDF; margens de 12 mm (topo) e 15 mm (laterais).
- **Partes Interessadas:** folha no layout do modelo "03_Form Stakeholders" (título centralizado, quadro com rótulos em negrito e data de aprovação numa linha só, tabela direto com o cabeçalho das colunas), com margens de 8 mm e colunas reequilibradas para caber mais pessoas por página; telefone sempre no formato (00) 00000-0000. "Adicionar parte interessada" se abre em interno ou externo e usa, num painel à direita, o mesmo cadastro da tela Stakeholders; ao salvar, mostra o sucesso, fecha o painel e a pessoa entra na tabela (também quando já existe versão aprovada, sem duplicar e respeitando exclusões feitas na versão). No Word, o rodapé tem só o número da página.
- **Seleção (componente único no sistema):** novo seletor com busca, navegação por teclado e lista estilizada, usado em todos os campos de escolha (documentos, filtros, admin, projeto, sprint, EAP/WBS, planilha, notificações, arquivos, integrações). Na folha dos documentos ele segue a fonte e a linha do texto. Nos campos de pessoa, "Criar novo membro" abre o cadastro interno de Stakeholders no painel lateral e, ao salvar, já seleciona a pessoa no campo de origem (Elaborado por, Aprovado por, presentes, responsáveis).
- **Sair sem salvar:** ao deixar qualquer documento com alterações que ainda não viraram versão (links, menu de documentos ou fechar a aba), o Operum pergunta se a pessoa quer salvar, salvar mais tarde (rascunho só dela, restaurado quando voltar) ou descartar as alterações.
- **Ata:** o número é preenchido pelo sistema; na ata nova já aparece o próximo número do projeto, confirmado ao salvar.
- **Menu Documentação:** subitens logo abaixo do item Documentação, com bolinha de estado e contador de propostas pendentes. A instituição do Termo passa a vir do cadastro do projeto, como na Ata.
- **Configurações → Assinatura:** seção própria no menu para desenhar a assinatura (mouse, dedo ou caneta, desfazer e limpar) e salvar em PNG com fundo transparente, ou importar PNG/JPG/PDF, escolher a página do PDF e recortar. Processamento no navegador (Signature Pad, PDF.js e React Image Crop), sem serviço externo; a assinatura anterior é preservada se cancelar ou der erro. Os documentos (folha e Word) usam a assinatura do gerente do projeto, com rótulo e imagem na mesma linha.
- **Editar projeto → Ano do AMS:** com Período "Ano", aparece o campo 1º/2º, independente do termo e do ano calendário; vai para a linha institucional dos documentos e é limpo ao trocar para semestre. Projetos existentes ficam sem classificação até preencher.
- **Instalação:** novas dependências do app (`signature_pad`, `pdfjs-dist`, `react-image-crop`) e migration aditiva `20261030210000_project_ano_ams` (coluna opcional `Project.anoAms`); campo MCP opcional `ano_ams` em criar/editar projeto. Aplicar a migration antes de publicar app e project-service; publicar o MCP para expor o campo.

## [1.42.0] — 2026-10-26

- **Sprint → Planilha de Custos:** a data realizada acompanha o movimento de conclusão do card, inclusive movimentos anteriores, no fuso de São Paulo. Reabertura remove a data automática; nova conclusão usa o novo movimento. Datas manuais são preservadas. Planilha, EAP, minicards e exportações usam a mesma origem; não são inventados tempo ou gastos.
- **Planilha → Sprint:** mantém a conclusão pelo preenchimento de data realizada válida (inclusive com custo realizado zero) e o controle de reabertura por origem; valores sem data não concluem o card.
- **MCP:** novas ferramentas `operum_get_task_costs` e `operum_set_task_costs` consultam/editam materiais orçados, realizados e data realizada pela atividade canônica da EAP, com autenticação interna, validação financeira por campo e auditoria. A data explícita propaga a conclusão ao card; o retorno informa pendências de sincronização.
- Sem dependências novas ou migrations. A atualização precisa ser publicada no app, gateway e MCP para entrar em produção.

## [1.41.0] — 2026-10-26

- **Integrações:** catálogo com logos locais e guias expansíveis para ChatGPT, Claude, Claude Code e Codex: requisitos, passos de conexão, URLs/comandos copiáveis, permissões, teste inicial, desconexão e solução de problemas.
- **OAuth/MCP:** compatibilidade com o ChatGPT por CIMD, negociando o método público `none` na lista de capacidades do cliente, inclusive quando a preferência legada é `private_key_jwt`. O servidor anuncia suporte a `iss` nas respostas de autorização.
- Inclui `chatgpt.com` e o callback estável do ChatGPT nas configurações padrão; ambientes com allowlists explícitas precisam atualizar o `.env`. Mantém PKCE S256, proteção SSRF, isolamento de instituições e comparação exata dos callbacks.
- Sem dependências novas ou migrations. A conexão real no ChatGPT depende da publicação, da configuração do ambiente e de homologação.

## [1.40.4] — 2026-10-24

- **Segurança:** as ações de admin sobre usuários (criar, editar, mudar papel, ativar e desativar) passam a ficar registradas na auditoria da instituição, com quem fez e o que mudou. Senhas não entram no registro; a troca aparece só como "senha redefinida".
- As ações do operador sobre instituições (criar, provisionar admin, entrar, mudar status e renomear) também ficam registradas, na auditoria da instituição afetada (ADR-066).

## [1.40.3] — 2026-10-24

- **Segurança:** o histórico de alterações da sprint ("antes/depois" no quadro e nas metas da sprint) só lê sprints de projetos da instituição de quem altera. A exclusão de fase pela EAP também confere a instituição ao resumir a sprint. Pendência da auditoria de 24/10.

## [1.40.2] — 2026-10-24

- Corrige o realizado da Planilha de Custos: atividades vinculadas a cards passam a usar os apontamentos encerrados, incluindo lançamentos manuais e timers parados. Edição e exclusão dos registros se refletem na próxima leitura; excluir o último zera o tempo.
- Planilha, EAP, exportações e minicards usam a mesma projeção do tempo realizado, com precisão dos segundos registrados e cálculo monetário existente. O orçamento e os materiais não são alterados.
- Onde não há histórico encerrado, o tempo manual da planilha continua disponível. Quando há apontamentos, o campo de tempo fica somente leitura e orienta a correção no card, evitando dupla contagem. As ações de tempo invalidam as telas relacionadas.

## [1.40.1] — 2026-10-24

- Corrige o redirecionamento ao login das ferramentas de orçamento MCP: a rota interna `/api/internal/task-budget/:id` deixa de exigir cookie de sessão no proxy e continua validando chave interna, identidade e permissões financeiras no servidor.
- Adiciona regressão com o matcher real do Next.js para a rota interna e para caminhos que devem continuar protegidos.

## [1.40.0] — 2026-10-24

- **MCP:** ferramentas `operum_get_task_budget` e `operum_set_task_budget` consultam e alteram os minutos orçados na atividade da EAP/Planilha de Custos vinculada ao card. Exigem permissões financeiras, preservam o realizado e recusam vínculo ausente ou ambíguo.
- **Instituições:** confirmação do operador da plataforma utiliza a senha da conta ativa; administradores institucionais e membros continuam comprovando a senha de destino na primeira vinculação. Contas inativas/suspensas e limites de tentativas continuam bloqueando acesso.
- **Formulário de confirmação:** lê a senha efetivamente preenchida no formulário, inclusive por preenchimento automático sem evento do React; permite mostrar/ocultar senha e informa qual conta está sendo confirmada. O identificador da instituição deixa de ser apresentado como domínio inexistente `.operum.com`.

## [1.39.1] — 2026-10-24

Correções médias e baixas da auditoria de segurança de 24/10.

### Segurança
- **Login:** uma senha errada passa a contar tentativa em todas as contas do mesmo e-mail (antes, e-mails com conta em mais de uma instituição nunca eram bloqueados), e a mensagem de conta inativa ou bloqueada só aparece para quem acertou a senha.
- **Senhas:** trocar ou redefinir a senha (inclusive pelo admin) revoga também os tokens de acesso pessoais e as conexões OAuth da conta. A troca sem a senha atual só vale no primeiro acesso, e a etapa final da redefinição respeita o limite de tentativas do código.
- **Tokens:** tokens de acesso pessoais e chamadas autorizadas deixam de valer para contas excluídas e instituições suspensas.
- **API pública:** os limites de requisições passam a valer por cliente (IP real vindo do Traefik), não para todos juntos.
- **Login:** o retorno após o login recusa endereços com caracteres de controle (`/%09/site-externo`), que levavam a outro site.
- **Anexos e arquivos:** enviar e apagar anexos pela tela exige a mesma permissão da API; a assinatura (perfil e equipe) aceita só PNG e JPEG conferidos pelo conteúdo; a importação de CSV tem limite de 1 MB e 500 linhas e cria os cards em lotes.
- **Cadastros:** remover função ou departamento é só do admin e da própria instituição; etiquetas só são apagadas por quem as criou (ou pelo admin); a consulta de exclusão de sprint fica na instituição.
- **MCP:** todos os ids das ferramentas são validados (um id com `../` vindo de conteúdo lido pela IA não desvia a chamada), e anexos por URL têm limite de downloads simultâneos.
- **Repositório e CI:** as permissões pessoais de agentes de IA (`.claude/settings.local.json`) saem do git e o arquivo compartilhado deixa de liberar execução de código e `git push`; actions de terceiros fixadas por SHA; deploy de produção com permissão padrão só de leitura.

## [1.39.0] — 2026-10-24

Correções da auditoria de segurança de 24/10 (críticas e altas).

### Segurança
- API pública: o api-gateway passa a ter uma porta pública (4080, usada pelo Traefik) que só expõe `GET /auth/me`, `/auth/my-tenants` e `/auth/all-users` nas rotas de conta (`/auth`). Antes, por repassar a chave interna em toda requisição, rotas internas de conta (`/auth/register`, `/auth/join-tenant`, as rotas de admin (`/auth/admin`), `/auth/provision-tenant-admin`) ficavam acessíveis a qualquer usuário logado chamando a API direto (ADR-059).
- Perfil e admin: `PATCH /auth/me` e as rotas de admin do auth-service aceitam só os campos permitidos (sem `role`, `tenantId`, hash de senha etc.), e as de admin ficam restritas à instituição de quem chama. A edição de membro no app e o vínculo de membro no project-service também deixam de gravar campos fora da lista (o `projectId` do vínculo não pode mais ser trocado pelo corpo da requisição).
- Troca de instituição: contas de instituições diferentes só trocam entre si quando vinculadas. Uma conta com o mesmo e-mail e ainda não vinculada pede a senha dela na primeira troca. O consentimento OAuth mostra só as instituições vinculadas (ADR-061).
- Permissões por caminho: maiúsculas no caminho (ex.: `/projects/x/Roles`) não contornam mais a regra que reserva papéis e cargos ao administrador.
- Notificações: cada pessoa só lê, marca e apaga as próprias notificações pela API, e criar notificação pela API pública deixa de ser possível. O link "Ver" aceita só caminhos do próprio Operum.
- EAP: o vínculo de um item com card ou sprint só vale para cards e sprints do mesmo projeto; editar propriedades não troca o card ligado; os responsáveis de um card não são copiados para itens de outro projeto.
- Chave interna comparada em tempo constante em todos os serviços.

### Adicionado
- Operador da plataforma: gerenciar instituições passa a exigir o papel de operador (`User.platformOperator`). O `admin` administra só a própria instituição. A migration concede o papel aos admins atuais das instituições da Mavellium (ADR-060).
- Confirmação de senha em "Minhas instituições" na primeira troca para uma conta ainda não vinculada.

## [1.38.1] — 2026-10-24

### Segurança
- Atualiza `body-parser` (1.20.9 / 2.4.0, GHSA-27r3-jxmh-p828), `multer` (2.5.0, GHSA-q7qp-rjg7-q26m) e `undici` (7.30.1, GHSA-xjj6-f33q-929c) por overrides no workspace e nas instalações isoladas dos serviços, corrigindo três negações de serviço publicadas em 22/10 que reprovavam o `pnpm audit --audit-level=high` e bloqueavam o deploy das 1.37.0 e 1.38.0. Sem mudança de comportamento.

## [1.38.0] — 2026-10-23

Operum instalável como app no celular (PWA).

### Adicionado
- O Operum pode ser instalado na tela inicial do Android (Chrome: "Instalar app") e do iPhone (Safari: Compartilhar → "Adicionar à Tela de Início"). Abre em tela cheia, sem a barra do navegador, com nome e ícone próprios. Manifest em `/manifest.webmanifest` e ícones com a marca do Operum (comuns, maskable para Android e `apple-touch-icon` para iOS).
- Service worker (`/sw.js`) que guarda só arquivos estáticos e a nova página **Sem conexão** (`/offline`), mostrada quando o app é aberto sem internet, com o botão "Tentar novamente". Nenhuma página com dados, resposta de API ou anexo fica guardada no aparelho.
- Aviso "Nova versão do Operum disponível" com o botão **Atualizar**. A página só recarrega quando o usuário pede, para não perder uma edição em andamento.

### Alterado
- Favicon do navegador trocado pelo ícone do Operum (era o padrão do Next.js).
- CSP com `manifest-src 'self'` e `worker-src 'self'`. Manifest, service worker, ícones e `/offline` passam a responder sem sessão; as demais rotas continuam protegidas.

## [1.37.0] — 2026-10-23

### Adicionado
- Tela **Configurações** (`/configuracoes`), no menu lateral para usuários e administradores, com navegação por seções: Perfil, Segurança, Instituições e Integrações.
- Seção **Integrações**, que reúne os apps conectados por OAuth (como o conector do Claude) e os Personal Access Tokens usados pelo MCP e pela API.
- Máscara e validação de telefone e e-mail em todos os formulários: perfil, usuários do admin, membros, stakeholders, criação rápida de membro, documento de Partes Interessadas, cópias da ata, login, cadastro e recuperação de senha. Telefone aceita fixo `(00) 0000-0000`, celular `(00) 00000-0000` ou número internacional com `+`; o e-mail perde espaços e precisa ter formato válido. O erro aparece ao sair do campo e as actions validam de novo no servidor. Valores antigos fora do padrão não bloqueiam a edição de outros campos.
- Máscara e validação de dinheiro em todos os campos em reais: valor/hora (membros e vínculo por projeto no admin), remuneração mensal, custo das macrofases (cadastro do projeto e Termo de Abertura) e materiais da Planilha de Custos. Os centavos entram pela direita (`1.234,56`), valores negativos ou acima de R$ 99.999.999.999,99 são recusados e as actions validam de novo no servidor. Valores em reais exibidos com ponto decimal (`R$ 500.00`) passam a usar vírgula.

### Alterado
- Meu perfil virou a seção Perfil das Configurações; alterar senha e instituições ganharam seções próprias. O avatar do rodapé abre as Configurações.
- O perfil não mostra nem edita mais cargo, departamento e valor/hora; esses dados seguem com a gestão de membros e usuários. Salvar o perfil não altera mais esses campos.
- Tokens e apps conectados saíram do perfil. Os endereços antigos `/perfil` e `/perfil/tokens` redirecionam para as novas seções, e as mensagens de erro do MCP, os READMEs e o tutorial apontam para o novo local.

### Corrigido
- Editar um membro sem mexer no valor/hora podia gravá-lo multiplicado por 10 ou 100 (ex.: 75,5 virava 755), porque o valor salvo era lido com o ponto como separador de milhar.
- O total de custos do cadastro do projeto multiplicava custos salvos pelo Termo de Abertura (formato `1000.00`).
- Remuneração ou valor/hora inválidos eram descartados em silêncio; agora a action responde com o erro.
- Escolher "Plano do Projeto" em "Enviar cópias para" da ata era recusado ao salvar, porque todas as cópias eram validadas como e-mail.

## [1.36.2] — 2026-10-23

### Segurança
- Atualiza o zod para 4.6.7 (override `>=4.6.6 <5.0.0`) no workspace e nas instalações isoladas dos serviços que o usam, corrigindo o consumo excessivo de memória ao validar coleções grandes (GHSA-mrhx-c7xc-m3w5) e desbloqueando a auditoria de dependências do CI. Sem mudança de comportamento.

## [1.36.1] — 2026-10-23

Correção do conector OAuth do MCP.

### Corrigido
- Com o OAuth sem configuração completa (`OAUTH_ISSUER`, `MCP_RESOURCE_URL` e `MCP_GATEWAY_KEY`), o auth-service usava valores padrão e fazia o login inteiro, mas o mcp-server recusava o token emitido. No app do Claude aparecia "Sua conta foi autorizada, mas a integração rejeitou as credenciais que acabou de emitir". Agora os metadados, o registro, o token e o consentimento respondem 404 enquanto a configuração estiver incompleta, e o Claude avisa já ao adicionar o conector. Revogação e "Apps conectados" seguem funcionando.

## [1.36.0] — 2026-10-23

Conector do Operum no app do Claude (web, Desktop e celular) com login OAuth.

### Adicionado
- MCP com login OAuth 2.1: o Operum pode ser adicionado como conector personalizado no claude.ai e usado pelo chat do app no celular. O auth-service virou servidor de autorização (metadados, registro de cliente CIMD/DCR, PKCE S256, token de acesso de 1 h e renovação com rotação) e o mcp-server publica os metadados do recurso protegido. Uma conexão pode cobrir vários workspaces. Fica desligado até configurar `OAUTH_ISSUER`, `MCP_RESOURCE_URL` e `MCP_GATEWAY_KEY` (ver `.env.example`).
- Tela de autorização `/oauth/autorizar`: mostra o app, para onde volta, as permissões (leitura ou leitura e escrita) e os workspaces.
- "Apps conectados" em Meu perfil → Personal Access Tokens, com desconexão imediata.
- `.mcp.json` com o servidor `operum-nuvem` para sessões do Claude Code na nuvem (token em segredo de rede) e o passo a passo no tutorial.

### Segurança
- O token OAuth só é aceito pelo gateway quando vem do mcp-server (chave interna) e com a audiência do MCP. Usado direto na API pública, é recusado.
- Corrigido: o bloqueio da introspecção interna de PAT diferenciava maiúsculas, e `/AUTH/API-TOKENS/INTROSPECT` chegava ao auth-service para usuários logados. O gateway agora compara o caminho normalizado.
- Rotas de conta do auth-service recusam qualquer token de acesso (PAT ou OAuth), não só PAT.

## [1.35.1] — 2026-10-23

Atualização de segurança.

### Segurança
- Next.js 16.3.8 → 16.4.2. Corrige duas falhas críticas de execução remota de código sem autenticação (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) e uma negação de serviço no App Router (GHSA-p3m5-59mp-jv5r), que afetam todas as versões de 16.0.0 a 16.4.0. O `pnpm audit --audit-level=high` volta a passar.

## [1.35.0] — 2026-10-21

Sincronização EAP ↔ planilha ↔ sprints (sprint 1.3).

### Adicionado
- EAP e Planilha mostram o estado da sincronização (sincronizado, com pendências ou com falha), a última conclusão, as pendências em linguagem clara e o botão "Sincronizar agora"/"Tentar novamente".
- EAP: em conflito ou falha de salvamento, suas alterações ficam guardadas no navegador e podem ser revisadas e reaplicadas sobre a versão atual, sem sobrescrever o que outra pessoa mudou.

### Corrigido
- Retirar a conclusão na Planilha reabre o card que ela concluiu; card reaberto à mão não volta sozinho para Concluído.
- A coluna de conclusão é reconhecida mesmo renomeada (Done, Entregue…; sem nenhuma, a última coluna).
- Sincronização dos cards com a planilha faz uma consulta só para todos os cards ligados.

## [1.34.0] — 2026-10-21

Correções relatadas em 19/10 (sprint 1.8).

### Adicionado
- Sprint: cada coluna pode ter uma cor própria, escolhida no cabeçalho e salva por coluna.
- Lista de sprints indica o progresso por cor (degradê verde que avança com os cards concluídos) e a sprint concluída fica verde-clara.
- Editar projeto: campos Termo e Turno quando o período é semestral; os documentos passam a mostrar "5° termo Noturno" no lugar do aviso "A definir".
- Data de início do projeto segue a primeira tarefa com data; sem nenhuma, vale a data informada.
- Prévia dos documentos (Termo de Abertura, Ata, Stakeholders) separada por páginas, com "Página X de Y" em cada folha.
- Ata: lista de presentes com contagem, remoção pelo nome e "Incluir toda a equipe"; e-mails cadastrados dos stakeholders oferecidos em "Enviar cópias para"; botão para enviar o arquivo de um anexo.
- Documento EAP reproduz a aba EAP: mesmo formato do menu Organizar, blocos, cores e conectores.

### Corrigido
- Menu do projeto: ícones de Departamentos e Funções no mesmo tamanho dos demais.
- Minicards mostram as horas orçadas e realizadas da Planilha de Custos, as datas prevista e realizada, o valor orçado (em aberto) e o realizado (concluídos).
- EAP Detalhes e Horas e Custos: as etapas usam o Sub-total da Planilha de Custos (etapa sem atividades fica zerada, como na planilha).
- EAP no formato Horizontal: blocos e fases com o mesmo tamanho.
- Documentos refletem o nome atual do departamento após renomeá-lo no cadastro.
- PDF de stakeholders não sai mais com uma segunda página em branco; linhas de tabela não são cortadas entre páginas.
- Ata exportada (.docx) traz a logo do projeto, o número centralizado, só uma linha vazia em presentes e ações, espaçamento menor e as assinaturas cadastradas dos presentes; a prévia segue o mesmo layout.
- Termo de Abertura aprovado mostra a assinatura atual do gerente quando a versão não a registrou.
- Exclusão de projeto é bloqueada, com a explicação, enquanto houver sprints, cards, lançamentos de tempo, atas, documentos ou outros membros ativos.

## [1.33.1] — 2026-10-20

### Segurança
- Atualiza `follow-redirects` para 1.16.1 no workspace e nas instalações isoladas, corrigindo vazamento de credenciais em redirecionamentos e desbloqueando a auditoria da imagem do gateway.
- Atualiza Vite para 8.3.3 no workspace e nos serviços isolados, eliminando o bloqueio de auditoria nos testes e serviços sem desativar os checks de segurança.

### Corrigido
- Menu do projeto inclui os atalhos de Departamentos e Funções para administradores, abrindo o catálogo global já existente.
- Cronograma Financeiro mantém código e descrição da fase lado a lado; descrições longas aceitam quebra de linha em campo redimensionável.
- Cabeçalho e total do custo das macrofases seguem o mesmo alinhamento dos valores editáveis.
- Lint da raiz ignora a saída compilada do MCP, permitindo validar o projeto após construir os serviços sem tratar JavaScript gerado como código-fonte.

## [1.33.0] — 2026-10-19

### Adicionado
- Filtros por vínculo e área/empresa na lista de stakeholders, com busca sem distinção de acentos, contagem de resultados e limpeza dos filtros.
- Modo explícito de ordenação, com setas acessíveis por teclado e toque, restrito ao mesmo grupo e sem filtros ativos.
- Estados próprios de carregamento e erro recuperável para a página de stakeholders.

### Melhorado
- Lista de pessoas com nomes e contatos legíveis, informações alinhadas em telas amplas e blocos responsivos quando a lista fica estreita. Mantida a paleta azul e neutra do Operum.
- Botão Adicionar pessoa com texto, edição sempre visível e remoção da rolagem interna da lista.
- Falha de reordenação restaura a ordem anterior à tentativa e permite repetir, inclusive em erro de rede.

## [1.32.1] — 2026-10-19

### Corrigido
- Excluir sprint remove sua fase da EAP e da Planilha de Custos, recompõe os códigos dos irmãos e descendentes e renomeia as sprints restantes (ex.: 1.3 → 1.2). Cards devolvidos ao backlog e seus tempos são preservados; atividades já movidas para uma sprint ativa mantêm as propriedades da planilha.
- Exclusão e sincronização usam o mesmo lock por projeto. A action atualiza as páginas do projeto real da sprint e informa falha parcial; a sincronização na leitura também reconcilia exclusões anteriores confirmadas.

## [1.32.0] — 2026-10-19

### Adicionado
- Dados da Planilha de Custos no card vinculado e na lista de sprints, respeitando a permissão de leitura financeira. Horas/custos do timer ficam identificados como registrados.
- Edição do projeto dentro do mesmo menu, com documentos em submenu.
- Identificação de quem elaborou cada versão no histórico e usuário logado como preenchimento inicial.

### Corrigido
- Planilha de Custos com valor por minuto, total `(MIN × R$) + Materiais`, moeda brasileira, datas legíveis, subtotais de materiais, Total do projeto, gráficos empilhados e inclusão/exclusão de linhas vinculadas à EAP. Exportação XLSX acompanha a coluna R$ como valor do minuto.
- EAP Padrão sempre lado a lado, inclusive fases vazias ou recolhidas; conectores saem do centro inferior do pai.
- Salvamentos da EAP enfileirados para não competir pela mesma versão; leituras atrasadas não substituem edição local.
- Painel Estilo permanece aberto até fechar pelo X, inclusive ao trocar ou limpar a seleção.
- EAP detalhada usa os elaboradores e minutos da planilha; custos incluem materiais mesmo sem valor de mão de obra.
- Aprovado por vem do gerente do projeto e é congelado na versão pelo servidor.
- Dados Complementares podem ser editados por quem edita e aprova documentos, salvando uma versão do Termo de Abertura.
- Cronograma exibe códigos e recebe datas e custos calculados da planilha, com moeda brasileira.
- Data prevista e conclusão da planilha sincronizam o card, com histórico idempotente e sem criar apontamentos de tempo.

## [1.31.1] — 2026-10-16

### Corrigido
- **EAP > Organizar:** em EAPs antigas, só o Horizontal mudava o desenho. O layout padrão antigo, convertido em "Direita" na 1.25.0, estava gravado em todas as fases e passou a valer como formato próprio delas na 1.31.0. Uma migration faz todos os itens abaixo da raiz voltarem a seguir o formato da EAP.
- **EAP > Organizar:** sem nada selecionado (ou com a raiz ou um item que não é fase selecionados), a escolha vale para a EAP inteira e todas as fases voltam a segui-la. Com fases selecionadas, o menu vira "Organizar fase" e muda só elas. O select "Fase" separado foi removido. A mudança pode ser desfeita com Ctrl+Z.

## [1.31.0] — 2026-10-16

### Alterado
- **EAP > Organizar:** a opção escolhida passa a valer para a EAP inteira, seguindo os modelos do documento de 16/10:
  - **Padrão:** itens lado a lado; um item que só tem folhas as empilha na vertical (modelo do Churrasco).
  - **Esquerda** e **Direita:** fases lado a lado, com os itens de cada fase empilhados à esquerda ou à direita, em qualquer nível.
  - **Horizontal:** raiz em pé à esquerda e cada nível numa coluna (modelo "Pintar uma sala").

  Antes, a opção valia só para os filhos do item selecionado.
- **EAP:** EAPs que estavam com a raiz em Direita ou Esquerda passam a mostrar as fases lado a lado.

### Adicionado
- **EAP > Fase:** com uma fase selecionada, é possível deixar só ela em Esquerda ou Direita, ou fazê-la voltar a seguir a EAP. O painel de propriedades tem o mesmo campo.

### Removido
- **EAP > Organizar:** "Horizontal (topo)" e "Horizontal (base)". As EAPs e os arquivos `.wbs` que usavam essas opções passam a usar Horizontal.

## [1.30.0] — 2026-10-16

### Adicionado
- **MCP: corrigir lançamentos de tempo.** Três tools novas:
  - `operum_list_time_entries` lista os lançamentos da tarefa, com total e marca de revisão;
  - `operum_update_time_entry` corrige início, fim e descrição;
  - `operum_delete_time_entry` apaga um lançamento e exige `confirm: true`.

  Antes, corrigir um tempo errado exigia a tela ou uma chamada direta à API.

### Alterado
- **MCP:** `operum_log_time` passa a aceitar no máximo 12 h por lançamento (era 168 h), igual à API desde a 1.29.0.

## [1.29.0] — 2026-10-16

### Corrigido
- **Tempo:** editar um lançamento pelo card (duração e descrição) dava erro, porque a rota não existia no servidor. Agora funciona; com nova duração, o fim é recalculado a partir do início, e timer ainda rodando não pode ser editado.
- **Tempo:** recusas ao excluir um lançamento passam a aparecer como mensagem (antes eram ignoradas).

### Alterado
- **Timer com limite de 12 h:** um timer esquecido é encerrado no limite, marcado com "[Revisar]" na descrição, e quem o iniciou recebe uma notificação. O card avisa a partir de 8 h de sessão. Antes, um timer contou 312h45 em 13 dias.
- **Lançamento manual e edição validados:** fim depois do início e não no futuro, no máximo 12 h por lançamento e sem sobrepor outro lançamento da mesma pessoa (inclusive um timer rodando). A mensagem de recusa diz qual lançamento conflita.

## [1.28.1] — 2026-10-15

### Corrigido
- **Tokens (Perfil > Gerenciar tokens):** o comando "Conectar no Claude Code" vinha com `https://mcp.operum.adm.br/mcp`, endereço que ainda não tem DNS, então a conexão não funcionava. O padrão passa a ser `https://api.operum.adm.br/mcp`, que é o endereço em uso. A variável `NEXT_PUBLIC_MCP_SERVER_URL` é fixada no build da imagem e não era passada.

### Documentação
- Guia "Como conectar o Claude ao Operum (MCP)" com o roteiro do vídeo tutorial: `docs/tutoriais/integracao-mcp-claude.md`.

## [1.28.0] — 2026-10-15

### Adicionado
- **Responsável obrigatório:** a partir de "Em andamento" (Em andamento, Em teste, Concluído), todo card precisa de pelo menos um responsável. Mover um card sem responsável para essas colunas é recusado, assim como remover o último responsável de um card que já está nelas e esvaziar o "Elaborado por" dele na planilha. A regra vale para a tela, o MCP e a API. Até "A Fazer", pode ficar sem responsável.
- **Timer:** iniciar o timer num card sem responsável torna responsável quem iniciou (na tela e pelo MCP), já que o card vai para "Em andamento".
- **Quadro da sprint:** aviso para quem edita cards com os cards em "Em andamento" ou depois sem responsável ativo (nenhum, ou só inativos), e um diálogo para atribuir alguém em cada um.

### Corrigido
- **Card → responsáveis:** recusas do servidor ao adicionar ou remover responsável eram ignoradas sem aviso; agora aparecem como mensagem.

## [1.27.0] — 2026-10-15

### Alterado
- **Planilha de custos:** "Elaborado por" passa a aceitar várias pessoas e é o mesmo dado dos responsáveis do card da tarefa: mudar de um lado muda do outro. Na primeira sincronização de cada projeto, os dois lados são juntados (quem estava no Elaborado por entra como responsável do card, sem notificação); depois disso, o card manda. Só membros ativos do projeto podem ser escolhidos, e quem passa a ser elaborador pela planilha recebe o aviso "Nova tarefa atribuída".
- **Custos com várias pessoas:** o custo da tarefa soma o valor por minuto de cada elaborador (todos trabalham o tempo inteiro), na planilha e em "Horas e custos" da EAP. A conversão de minutos em dias usa a menor jornada entre elas. O quadro de elaboradores conta a tarefa para cada um. Qualquer um dos elaboradores pode lançar o realizado próprio.

## [1.26.1] — 2026-10-15

### Corrigido
- **Card:** ao abrir um card, título, descrição, prioridade, cor, etiquetas e datas levavam de 3 a 10 s para aparecer. O modal começava vazio e preenchia os campos dentro de uma transição do React, e o React 19 segura transições enquanto houver Server Action pendente; como o Next executa as Server Actions do cliente uma de cada vez, o card só era preenchido depois que tempo, movimentações e comentários carregavam. Agora o modal já nasce com os dados que o quadro tem, e só o histórico de tempo, as movimentações e os comentários chegam depois. Cada card aberto (e cada modal de criação) é montado do zero, então o formulário não herda o card anterior.

## [1.26.0] — 2026-10-15

### Adicionado
- **Planilha de custos:** ao passar o mouse (ou focar pelo teclado) sobre uma tarefa, aparece a descrição dela, com as quebras de linha. A descrição é a atual do card ligado à tarefa; sem card, a do item da EAP. Tarefas com descrição ficam com um sublinhado pontilhado.

## [1.25.1] — 2026-10-15

### Corrigido
- **Esqueci minha senha:** sem SMTP configurado, o auth-service não enviava o e-mail, respondia sucesso e **gravava o código no log**. Em produção ele agora nunca registra o código e registra um erro claro, na subida e a cada pedido. Com SMTP, testa a conexão ao subir, e os logs mostram o e-mail mascarado. O deploy avisa quando falta SMTP no `.env` da VPS, e as variáveis (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `APP_PUBLIC_URL`) foram documentadas no `.env.example`. Para o e-mail chegar, é preciso preencher o SMTP no `.env` da VPS.
- **Deploy:** o aviso de SMTP ausente quebrava a validação de observabilidade do deploy (`observability-config.mjs` exige stderr vazio com webhook configurado), e a release parou antes de publicar. O aviso agora só considera o SMTP quando o compose tem o `auth-service`, e a validação ganhou os casos de SMTP. Esta correção saiu como 1.24.1 na PR #75, que entrou depois da 1.25.0 e não chegou a ser publicada.

## [1.25.0] — 2026-10-15

### Alterado
- **EAP → Organizar:** o menu virou um select com os 6 ícones desenhados pelo Vinícius, e cada um desenha os filhos do item selecionado do jeito do ícone: Padrão (organograma), Direita e Esquerda (filhos empilhados ao lado da linha que desce do centro do pai), Horizontal, Horizontal (topo) e Horizontal (base) (pai à esquerda, no meio, no topo ou na base da coluna de filhos). O layout "Abaixo" foi removido, e quem usava "Abaixo" ou "Abaixo com L" passa a ver "Direita" (migration `20261015010000_wbs_layouts_organizar`; arquivos `.wbs` antigos também são convertidos ao importar).
- **EAP → Visualização:** o seletor de modo usa o mesmo select com ícone, dentro da barra, com os nomes em português: EAP (gráfico), EAP com detalhes, Horas e custos e Gantt.

## [1.24.0] — 2026-10-15

### Adicionado
- **Anexos:** arquivos `.svg` podem ser anexados aos cards (também pelo MCP), com miniatura e lightbox. Por segurança, só é aceito SVG sem conteúdo ativo: script, atributos de evento (como `onload`), `javascript:`, `foreignObject`, links e recursos externos e DOCTYPE/ENTITY são recusados com uma mensagem clara. O SVG é gravado para baixar quando aberto direto, e a pré-visualização é servida com CSP `sandbox` (ADR-042).

## [1.23.0] — 2026-10-15

### Adicionado
- **Stakeholders:** membros da equipe também podem ser inativados, com motivo obrigatório. Na linha de cada stakeholder e no formulário de edição, o botão "Inativar"/"Reativar" tem texto (antes era só um ícone, que não era encontrado). Inativos aparecem em vermelho com o motivo em Stakeholders e no formulário de Partes Interessadas.
- **Membro inativo:** perde o acesso ao projeto (como no desvincular), mas continua nos cards em que já era responsável. Card cujos responsáveis estão todos inativos mostra "Responsável inativo: adicione outro para concluir" e não pode ir para a coluna de conclusão até ganhar outro responsável.
- **Notificação:** ao inativar um membro, cada gerente do projeto recebe a pendência com os cards que ficaram sem responsável ativo.
- Migration `20261015000000_user_project_inactive_reason` (só colunas anuláveis em `UserProject`) e rota `PATCH /projects/:id/members/:userId/situacao` no project-service.

### Observações
- Não é possível inativar a si mesmo nem um gerente do projeto (tire o papel de gerente antes).
- A regra de conclusão vale para o quadro; movimentos feitos direto pela API/MCP não são bloqueados (ADR-041).

## [1.22.1] — 2026-10-15

### Corrigido
- **Cadastros Globais:** no menu do admin, "Funções" abria a aba Departamentos, e era preciso um segundo clique. Cada seção agora tem o próprio endereço (`/admin/cadastros/funcoes` e `/admin/cadastros/departamentos`): o menu abre direto na seção e destaca só o item dela, e as abas da página trocam o endereço. `/admin/cadastros` continua funcionando e abre Departamentos.

## [1.22.0] — 2026-10-15

### Adicionado
- **Quadro da sprint:** lupa no cabeçalho de cada coluna, inclusive no Backlog, para buscar só nos cards daquela coluna. A busca ignora acentos e maiúsculas, exige todas as palavras digitadas e procura no título, no código da EAP, na descrição, nos responsáveis e nas etiquetas. Soma-se aos filtros do quadro. O selo mostra "encontrados/total"; Escape ou o "×" limpam e fecham. Enquanto a coluna está filtrada, o arraste dela fica pausado (não sai nem entra card), para o card não cair na posição errada.

## [1.21.0] — 2026-10-15

### Adicionado
- **MCP:** `operum_copy_project` e `operum_import_project` aceitam `target_project_id` para copiar ou importar dentro de um projeto que já existe. Sprints e colunas são casadas pelo nome (as que faltam são criadas, no fim da ordem do destino); tarefas com título igual ou com similaridade de pelo menos 0,9 são puladas e listadas no relatório. Continua com `dry_run=true` por padrão.
- **MCP:** `operum_create_upload_link` gera um link HTTPS de uso único (10 minutos) para enviar ao card um arquivo que está no computador, com `curl`, sem passar o conteúdo pela conversa. Até 50 MB, PAT cifrado (AES-256-GCM), autorização conferida de novo no gateway e limite de requisições na rota `/uploads/:token`. Exige `MCP_UPLOAD_SECRET` e `MCP_PUBLIC_URL` no ambiente; sem eles, só essa tool fica indisponível.

### Observação
- Implementado em 05/10 (PR #57), mas a PR foi mesclada na branch da PR #56 depois de a #56 já ter entrado na main, e o código não chegou à produção. Esta versão traz essas mudanças para a main.

## [1.20.0] — 2026-10-14

### Adicionado
- **EAP ↔ sprint:** todo item do nível 2 da EAP vira sprint, com as colunas padrão; o nome da sprint é "código título" (ex.: "1.2 Fase 2") e acompanha a renumeração da EAP. Card do backlog de uma fase que acabou de virar sprint vai para "A Fazer" dela.
- **Planilha de custos:** a linha de subtotal de cada fase mostra a data fim (a maior data prevista das atividades). Essa data passa a ser a data fim da sprint e a "Data Limite" da fase no cronograma financeiro de Editar projeto; a maior delas é a data fim do projeto. O custo da fase no cronograma financeiro passa a ser o valor orçado. Sem datas ou valores calculados, vale o que foi informado à mão.
- **Sprints:** excluir uma sprint com dados (cards ou horas registradas) exige justificar o motivo, no quadro e na EAP (excluir uma fase exclui a sprint dela). O diálogo mostra quantos cards e horas a sprint tem.
- **Sprints:** histórico de alterações das sprints na página Sprints do projeto: criação, alterações (nome, datas, status, descrição, qualidade, dificuldade, de → para) e exclusão com motivo e resumo do que a sprint tinha, com quem fez e quando, inclusive o que veio da EAP.
- **Ata de Reunião:** Word e PDF no layout do modelo "01_Form Ata de Reunião": logo e "Ata de Reunião Nº", quadro com instituição em cinza, Local/Data, "Elaborado por" e "Aprovado por" com nome e função, tabelas de presentes (7 linhas) e ações (6 linhas), Documentos anexos, "Enviar cópias para" com caixas e "Plano do Projeto", Assinaturas e Obs. Novo botão "Baixar Word" na Ata, com a logo do projeto.

### Alterado
- **Funções e departamentos:** não é mais preciso associá-los a cada projeto. Todas as funções e departamentos do cadastro podem ser escolhidos em qualquer projeto (Stakeholders passa a oferecer todos os departamentos). Saem do menu do projeto os itens "Funções" e "Departamentos" (os endereços antigos levam a Stakeholders), e excluir uma função ou departamento do cadastro não pede mais para "desassociar" antes.
- **Documentos:** a linha da instituição da Ata e da EAP vem de Editar projeto > Informações iniciais: "Localização - Departamentos - termo - Período Ano". O termo fica "A definir no Operum (ex: 5° termo Noturno)" até existir no cadastro. Na Ata, o campo deixa de ser digitado.

### Corrigido
- **Timer:** "Não foi possível confirmar o timer" nos cards do quadro. Cada card fazia duas chamadas ao servidor, e o Next executa Server Actions do cliente uma de cada vez; com muitos cards, a fila passava do limite de 15 s. Agora o quadro lê o timer de todos os cards numa única chamada, em paralelo no servidor.
- **Quadro da sprint:** arrastar cards entre colunas demorava ou parecia não funcionar, e o card sumia e voltava. O movimento esperava a fila de chamadas ao servidor (a leitura do timer de cada card, corrigida acima) e só era aplicado depois da resposta, então o card voltava à origem até o servidor confirmar. Agora o card vai para o destino ao soltar e só volta, sozinho, se o servidor recusar.
- **Termo de Abertura:** salvar versão falhava com "Unrecognized key: papel" desde a 1.16.0 (a função dos integrantes não estava na validação da versão).
- **EAP:** salvar versão do documento falhava com erro interno desde a 1.19.0 (os ids de "Elaborado por"/"Aprovado por" eram gravados na tabela do documento, que não tem essas colunas).
- **EAP:** excluir um item mostrava "Conflito: esta EAP foi editada por outra pessoa" e não excluía. A sincronização com as sprints (ao abrir quadro, planilha ou documento, inclusive em outra aba) avança a versão da EAP, e o editor continuava com a versão antiga, inclusive ao voltar pela página em cache. O editor agora busca a versão atual ao abrir e ao voltar para a aba, adota a versão nova do servidor quando não há alteração pendente e, se ainda houver conflito, recarrega a árvore em vez de travar.
- **EAP ↔ sprint:** excluir um item na EAP agora exclui o card ligado, e excluir uma fase exclui a sprint dela (os cards que sobrarem vão para o fim do backlog). Antes, a sincronização recriava o item a partir do card ou da sprint. Recortar e colar mantém o vínculo; copiar/colar e duplicar criam cópias sem vínculo.
- **Ata:** "← Voltar às atas" (Nova Ata e Editar Ata) levava à lista antiga `/projetos/:id/atas` e dava 404; agora volta para Documentação > Atas de Reunião, e a rota antiga redireciona para lá.
- **Ata:** em "I. Relação dos presentes", o seletor do nome ficava espremido pelo campo de setor e não dava para ler; agora o nome ocupa 2/3 da linha.

## [1.19.0] — 2026-10-14

### Alterado
- **Documentos → EAP:** a estrutura do documento vem da aba EAP/WBS (títulos, ordem e códigos). No documento ela fica só para leitura, com link para editar na aba; a versão salva guarda a estrutura da WBS. Sem WBS montada, continua o modelo.
- **Documentos:** "Gerente do projeto" é sempre o gerente cadastrado no projeto (papel gerente), em todos os documentos, e aparece só para leitura no formulário. A assinatura da EAP passa a ser a do gerente, em versão aprovada, como no Termo.
- **Documentos:** campos do quadro padronizados em um componente (`CamposQuadroDocumento`): Elaborado por e Aprovado por são o select de membro da equipe com "+" para criar membro, mais Versão e Data de aprovação. Usado no Termo, em Partes Interessadas e na EAP (que tinha inputs de texto). Na Ata, Elaborado por, Aprovado por, presentes e responsáveis passam a usar o mesmo select com "+".
- **EAP ↔ sprint:** cards do backlog não aparecem na EAP/WBS nem na planilha de custos. Os nós de card do backlog que ficaram no nível 2 (como se fossem sprints) ou dentro de uma sprint são removidos; folhas da EAP não criam mais cards no backlog quando o projeto não tem sprint. O documento da EAP roda a mesma sincronização ao abrir.

## [1.18.0] — 2026-10-14

### Alterado
- **Documentos → EAP:** o documento segue o modelo do professor ("Modelo de Estrutura Analítica do Projeto"): logo do projeto e título, quadro de identificação com bordas (instituição em cinza, nome, gerente, elaborado por/versão, aprovado por, assinatura/data de aprovação) e todas as páginas em A4 paisagem. A EAP gráfica mostra a raiz no topo, o nível 2 lado a lado e os demais itens empilhados em coluna, em caixas azuis com "código título", com o rodapé "© 05_Modelo EAP Gráfica". A EAP texto usa Times New Roman, recuo por nível, itens com filhos em negrito e continua nas páginas seguintes sem cortar. A API `GET /api/projects/:id/eap` passa a devolver `logoUrl`.

## [1.17.0] — 2026-10-14

### Alterado
- **EAP ↔ sprint:** o nível 2 da EAP passa a ser as sprints (`WbsNode.properties.sprintId`) e os cards ficam do nível 3 para baixo, dentro da sprint deles. Sprint sem nó ganha nó no nível 2 (ou é ligada ao nó de mesmo nome); folha do nível 3+ vira card em "A Fazer" da sprint do seu nível 2; card que muda de sprint leva o nó junto. Os nós de card que a 1.16.0 criou direto sob o projeto são movidos para dentro da sprint do card. Card do backlog sem nó não entra na EAP.

### Adicionado
- **Sprint:** os cards vinculados à EAP mostram o código do nó antes do título ("1.1.1 - Fazer isso"), no quadro e no cabeçalho do card. O título gravado não muda.

### Corrigido
- **Timer:** card sem timer ativo mostrava "Unexpected end of JSON input — Atualizar timer". O sprint-service responde `null` como 200 sem corpo e o cliente da API (`lib/api-client.ts`) tentava ler JSON; resposta vazia agora vira `null`.

## [1.16.0] — 2026-10-14

### Adicionado
- **Stakeholders:** inativação de stakeholder externo com motivo obrigatório (reativação limpa o motivo; migration `20261014000000_stakeholder_inactive_reason`). Inativos aparecem em vermelho com o motivo no formulário de Partes Interessadas, na tela e no Word.
- **Stakeholders:** a aba separa membros da equipe e stakeholders externos, com contagem por grupo.
- **Termo de Abertura:** integrantes mostram a função do cadastro ("Nome – papel"); formulário na mesma ordem do modelo.
- **Documentos:** numeração "Página X de Y" na impressão em PDF do Termo, Partes Interessadas, EAP e Ata.
- **EAP:** a página da EAP gráfica sai em paisagem com a árvore inteira visível.
- **EAP ↔ sprint:** folhas da EAP/planilha viram cards em "A Fazer" da sprint ativa e cards criados na sprint viram nós da EAP e da planilha (vínculo em `WbsNode.properties.cardId`).

## [1.15.2] — 2026-10-14
- **Segurança:** atualiza dependências de produção com avisos novos: `next` 16.3.8 (SSRF na otimização de imagens), `proxy-addr` ≥ 2.0.8 (gateway), `sharp`, `source-map-js`, `shell-quote` e `@modelcontextprotocol/sdk` ≥ 1.31.0 (mcp-server). Sem mudança de comportamento.

## [1.15.1] — 2026-10-05
- **Deploy:** valida a chave de métricas antes de alterar a release; webhook vazio mantém alertas locais com aviso de envio externo pendente. Webhook preenchido inválido continua bloqueado, com diagnóstico específico sem expor segredos.

## [1.15.0] - 2026-10-05

### Adicionado
- Exportação Word de Partes Interessadas e Termo de Abertura; prévia imprimível da Ata.
- Termo com formulário separado, geração explícita e abertura de snapshots históricos, com diferenças por campo, autor e data.

### Corrigido
- Partes Interessadas em A4 paisagem e documentos alinhados à estrutura dos modelos do Prof. Fábio.
- Campo institucional nas Atas e Termo; custo brasileiro com milhares e centavos preservados.
- Cabeçalho e equipe registrados no snapshot do Termo, sem substituir versões antigas por dados atuais.

## [1.14.0] - 2026-10-04

### Adicionado
- EAP com modos Chart View Details e Hours and Cost View; custos orçados e reais usam taxas individuais dos elaboradores e respeitam `planilha:ver`.
- Gantt somente leitura com hierarquia expansível, linha de hoje e zoom dia/semana/mês, disponível por `?view=gantt`.

### Corrigido
- Geometria vertical e mista da EAP evita sobreposição entre subárvores de larguras diferentes e acomoda cartões detalhados.
- Acesso somente leitura não inicializa nem permite renomear a EAP.

## [Não lançado]

## [1.13.2] — 2026-10-04
- **Sessões (SDD 11.1):** revogação verificada no auth-service por gateway e operações locais do Next; indisponibilidade bloqueia acesso e login/logout exigem confirmação da persistência.
- **Redis (SDD 11.2):** sessões, fila e cache isolados; fila mantém host/volume original e noeviction, sessões migram para instância própria e exigem novo login na transição.
- **Deploy (SDD 11.3–11.5):** manifesto de digests aprovado após validação de todos os serviços/imagens, migration e app com a mesma imagem e rollback por release condicionado à compatibilidade de schema.
- **Recuperação (SDD 11.6):** scripts de backup criptografado fora da VPS, restore em diretório isolado e ensaio com PostgreSQL/MinIO sintéticos; rotina existente da VPS ainda não confirmada.
- **Operação (SDD 11.7–11.8):** liveness independente, readiness limitada, métricas privadas, logs com request ID, Grafana provisionado, collector restrito e alertas configuráveis; sem deploy nesta entrega.

## [1.13.1] — 2026-10-04
- **Kanban (SDD 10.1–10.2):** alterações são aplicadas após confirmação, com erro e retry independentes; formulário permanece aberto em falhas, impede envio duplo e retoma anexos/responsáveis do card já criado sem duplicar a tarefa.
- **Timers (SDD 10.3):** minicard e modal compartilham estado confirmado; falhas e timeout geram reconciliação ou estado desconhecido explícito, sem descartar o timer antes da parada confirmada.
- **Termo de Abertura (SDD 10.4):** autosave serializado com feedback e flush antes de versionar; saída com pendências é protegida e cópia local na mesma aba permite recuperar alterações não confirmadas por autor/projeto.
- **Acessibilidade (SDD 10.5–10.7):** abertura de tarefas por botão, sidebar recolhida sem foco, overlays com contenção/restauração de foco, títulos únicos e Escape somente no superior.
- **Celular (SDD 10.8):** menu lateral sobreposto, conteúdo com largura disponível e navegação documental adaptada; prévia A4 mantém rolagem própria. Validação visual em 360/390/768 px, rotação e largura equivalente a zoom de 200%.

## [1.13.0] — 2026-10-04
- **Tarefas (SDD 9.6):** novo endpoint paginado com filtros no sprint-service; MCP lista tarefas sem varrer todas as sprints do projeto, incluindo cards cujo projeto vem da sprint.
- **Paginação:** cursor por criação e ID, com limite inicial de travessia e vínculo ao tenant/filtros; tags e responsáveis somente da página, anexos buscados exclusivamente dos IDs retornados.
- **Quadro:** UI e MCP pedem resumo dos tempos encerrados e timers ativos, reduzindo o payload. Histórico completo continua disponível nas rotas de detalhe e no modo anterior do quadro.
- **Banco e validação:** índices parciais para backlog/sprint; testes PostgreSQL e HTTP reais, travessia concorrente, isolamento e medições de consultas, bytes e latência.

## [1.12.5] — 2026-10-04
- **Dashboards (SDD 9.5):** rotas global e por sprint restauradas, com KPIs, ranking, cards atrasados, colunas e feedbacks agregados no sprint-service.
- **Contratos e acesso:** respostas validadas pelo serviço e pelo cliente; consultas limitadas ao tenant e aos projetos com leitura de quadro e custos. Dados vazios retornam zeros/listas vazias, sem ocultar erros de contrato ou permissão.
- **Validação integrada:** testes reais de action → gateway → controller → PostgreSQL, incluindo dados, isolamento, revogação de permissão e cabeçalhos de escopo forjados.

## [1.12.4] — 2026-10-04
- **Macrofases (SDD 9.4):** validação do lote antes da escrita e substituição atômica junto dos dados do projeto, preservando o lote anterior quando há falha.
- **EAP:** pendência de sincronização persistente e retry da última revisão salva. Sincronização, códigos, versão e auditoria compartilham uma transação; tentativas repetidas não duplicam fases e preservam atividades existentes.
- **Recuperação:** formulário mostra macrofases pendentes e permite tentar sincronizar novamente com as permissões de projeto e custos verificadas no servidor.

## [1.12.3] — 2026-10-04
- **Kanban (SDD 9.3):** movimentação de card, histórico e ordenação de origem/destino passam a compartilhar uma transação. Falhas revertem todas as etapas; movimentos concorrentes reavaliam o estado antes do retry.
- **Concorrência:** reconhecimento de conflitos estruturados do adapter PostgreSQL tanto na movimentação quanto na exclusão de sprint, mantendo retries limitados. Suítes PostgreSQL executam isoladas entre arquivos; concorrência dentro dos testes permanece ativa.
- **Ordenação:** posições normalizadas no retorno, desempate estável, inserção ao final quando posição omitida e limpeza dos vínculos de sprint ao retornar ao backlog. Validação de instituição, autoria e coerência entre projeto, sprint e coluna preservada no servidor.
- **Validação:** check PostgreSQL cobre falhas em cada etapa, movimentações concorrentes e preservação de comentários/tempos.

## [1.12.2] — 2026-10-04
- **Timer (SDD 9.2):** um único timer ativo por usuário, protegido por índice parcial no banco. Inícios concorrentes retornam conflito previsível; repetir ou concorrer a parada preserva exatamente o intervalo já encerrado, sem duplicar horas.
- **Migration:** pré-verificação de duplicados ativos com aborto seguro, sem alterar automaticamente tempos históricos. Procedimento de diagnóstico e revisão documentado para o operador.
- **Validação:** check de integridade ampliado com PostgreSQL real para concorrência de start/stop, rollback, índice fora do serviço e isolamento entre usuários/instituições.

## [1.12.1] — 2026-10-04
- **Integridade (SDD 9.1):** exclusão de sprint transfere os cards ativos ao backlog do mesmo projeto e exclui logicamente a sprint em uma única transação. Cards criados apenas com sprint preservam acesso, comentários e tempos; vínculos de outro projeto impedem a exclusão. Transferência ordenada ao final do backlog e retries limitados para conflitos concorrentes.
- **Validação:** novo check com PostgreSQL real verifica transferência, rollback após falha, isolamento e exclusões concorrentes.
- **Versão:** restaura sequência SemVer após a correção Docker ter sido integrada com 1.11.1 sobre a funcionalidade 1.12.0; ambas as entregas permanecem incluídas.


## [1.12.0] — 2026-10-04
- **Documentos (SDD 5.2):** membros com permissão de edição propõem versões do Termo de Abertura, Partes Interessadas, EAP e Atas. O conteúdo aprovado permanece vigente até a aprovação da proposta; rejeições preservam a versão anterior.
- **Histórico e Registro:** versões pendentes destacadas, conteúdo preservado para revisão, autoria e logs de rascunho, submissão, aprovação, rejeição e exclusão. Rascunhos do Termo são privados por autor; versões aprovadas permanecem no histórico.
- **Segurança documental:** publicação e auditoria na mesma transação, revisão concorrente serializada por projeto, validação de árvores e participantes, isolamento por instituição/projeto e cancelamento de propostas ao excluir uma ata. Documentos legados continuam acessíveis; registros antigos sem conteúdo não podem ser aprovados como novas versões.
- **Custos (SDD 5.3):** comportamento por campo/responsável já entregue na 1.9.0 reconferido nesta entrega; realizado próprio continua restrito ao responsável persistido, independente da permissão de orçado.
- **Validação:** novo check de PR aplica migrations e testa aprovação, rollback e concorrência em PostgreSQL isolado. Sem deploy ou validação em produção nesta entrega.

## [1.11.1] — 2026-10-04
- **Docker:** inclui o `CHANGELOG.md` no contexto de build para a página `/sobre`, corrigindo a falha de prerenderização na imagem de produção. PRs passam a construir a imagem do app e verificar o histórico no output standalone antes do merge

## [1.11.0] — 2026-10-04
- **Sobre:** a página `/sobre` destaca as novidades da versão atual e permite consultar as atualizações das versões anteriores, com datas e seções expansíveis. O histórico acompanha automaticamente o changelog do projeto.

## [1.10.1] — 2026-10-04
- **Segurança/CI:** imagem final do gateway verifica o patch de `braces` antes do Trivy. Exceção de CVE-2026-93687 limitada ao caminho/hash da cópia corrigida, com expiração em 03/11/2026; outras cópias e alertas high/critical continuam bloqueando o scan.
- **Prevenção:** PRs para main/develop constroem localmente e analisam a imagem final do gateway, sem publicação ou deploy. Staging/produção usam a mesma verificação antes do scan.

## [1.10.0] — 2026-10-03
- **Permissões (SDD 5.1):** operações de projeto, equipe, sprints, cards, movimentos, comentários, timers, anexos e cadastros passam a aplicar o catálogo configurado por função e usuário. Leituras/listagens/busca ficam limitadas aos projetos autorizados; interface recebe o mesmo conjunto de permissões do servidor.
- **API/MCP:** gateway consulta autorização no app por endpoint com chave interna, obtém o papel do usuário ativo no banco e falha fechado em indisponibilidade. Headers de escopo enviados pelo cliente são descartados. Atribuir cargos/gerente e alterar catálogos globais continua exclusivo do administrador.
- **Documentos:** leitura e operações existentes aplicam as permissões documentais; GET genérico de projeto omite textos de charter sem `documentos:ver`. Alterar conteúdo publicado exige edição e aprovação enquanto o fluxo de revisões pendentes do item 5.2 não for entregue.
- **Segurança (dependências):** patch local de `braces@3.0.3` limita profundidade de parsing e percursos da AST para mitigar GHSA-vfj7-8cjw-p6xm, ainda sem correção publicada. Exceção específica no audit acompanha o patch, testes e instalação Docker; deve ser removida quando houver correção upstream.
- **CI:** auditoria de dependências agora executa nas PRs para main/develop, verificando instalação congelada e patch efetivo no workspace/gateway. Deploys usam a versão pnpm declarada no `packageManager`, sem pin divergente.
- **Segurança (avatar/logo):** URLs exibidas e abertas no navegador são validadas como http(s) ou caminho local; HTML, esquemas executáveis e caminhos ambíguos usam fallback. CodeQL da configuração de produção também roda nas PRs, com build/deploy explicitamente bloqueados nesse evento.
- **Limites:** 5.2 segue pendente, sem novas migrations de revisão documental; esta entrega não inclui validação em produção ou deploy.

## [1.9.1] — 2026-10-01
- **Segurança (dependências):** Next.js 16.3.5 → 16.3.6 corrige GHSA-vcvr-r3jv-pc5j (execução remota de código no `ImageResponse` de `next/og`), que bloqueava o `pnpm audit --audit-level=high`. Lockfile e exceções de idade mínima da atualização de segurança acompanham a versão corrigida.

## [1.9.0] — 2026-10-01
- **Planilha de custos (SDD 5.3):** permissões independentes para orçado, realizado próprio e realizado de todos. A validação usa o responsável persistido, bloqueia a linha durante a gravação e salva a auditoria na mesma transação. Interface distingue campos editáveis/bloqueados; exportação exige leitura autorizada.
- **Isolamento:** administrador também precisa de projeto ativo da instituição atual para receber permissões.
- **Validação:** item 5.3 verificado localmente; autorização geral e revisão documental da fase 5 continuam em desenvolvimento. Sem validação em produção.

## [1.8.0] — 2026-09-30
- **Permissões (SDD 5.1, configuração):** administrador configura a matriz por função, restaura padrões e concede/nega permissões por usuário, globalmente ou no projeto. Editores disponíveis em Cadastros → Funções, Usuários → Permissões e Stakeholders → Permissões neste projeto, com feedback de gravação e preservação do estado em falhas.
- **Modelo de autorização:** catálogo e resolução por base de membro, união de funções e ajustes globais/de projeto; tabelas e migration do núcleo incluídas nesta branch. Tech Lead e PO seguem a base do membro até configuração explícita.
- **Isolamento:** leitura de ajustes por usuário também exige projeto da instituição atual.
- **Limite desta entrega:** a adoção do resolvedor nas operações existentes é incremental e permanece pendente; documentos com aprovação (5.2) e realizado da planilha por responsável (5.3) ainda não estão concluídos.
- **Planejamento:** SDD inclui os 23 novos cards da avaliação geral, com IDs, evidências, critérios de aceite e dependências, nas fases 9–11.

## [1.7.1] — 2026-09-30
- **Segurança (dependências):** o deploy da 1.7.0 parou no `pnpm audit` por dois alertas publicados no mesmo dia.
  - `brace-expansion` (GHSA-qhr7-859c-m2p7, DoS com chaves aninhadas): overrides para 1.1.20+, 2.1.6+ e 5.0.11+, sem trocar de versão principal, na raiz e nos lockfiles dos cinco serviços.
  - `nodemailer` 9 → 10 no auth-service (GHSA-v53p-9fqp-m79j, ReDoS no parser de endereços): a única quebra da 10 é exigir Node 20, e as imagens usam Node 22.

## [1.7.0] — 2026-09-30

### Fase 4 do backlog
- **Segurança:** o file-service passa a conferir a instituição (tenant) do card antes de anexar, listar, renomear, trocar a capa, abrir ou excluir anexos. Antes, com o id de um card ou anexo de outra instituição, dava para mexer nele pelo gateway. As rotas `/files/avatar` e `/files/logo`, expostas e sem uso, foram removidas. Marcar a capa pelo app passou a conferir o card.
- **Anexos:** o arquivo abre no primeiro clique. A URL assinada usava o host interno do storage (`minio:9000`); agora usa o público. Imagem abre num lightbox no card, e `/arquivos` baixa pela mesma rota. O `operum_get_task` do MCP devolve `download_url`.
- **Busca:** clicar num card abre o card mesmo com a sprint já aberta.
- **Stakeholders:** o cadastro novo já abre em edição. A criação de membro traz cargos, departamento, remuneração, horas e gerente, e o externo criado pelo "Adicionar ao projeto" já fica no projeto. Horas por dia aceitam "8,5", "8.5" e "8:30", entre 0 e 24, e o servidor recusa valor inválido.
- **Senhas:** botão para mostrar e ocultar a senha em todos os campos de senha.
- **Planilha de custos:** sub-total e TOTAL GERAL alinhados à direita no `.xlsx`.
- **Interface:** campos sem `type` (como o de renomear anexo) ficavam ilegíveis com o sistema em modo escuro. Foi removido o modo escuro do template.

### Já em produção antes desta versão, sem registro (28 e 29/09; registro retroativo)
- **MCP:**
  - um servidor para todos os tenants do usuário (`X-Operum-Tokens`), com saída JSON, CRUD de projetos, sprints, colunas, tarefas, etiquetas e comentários, e migração de projetos entre tenants (`operum_copy_project`);
  - erros do Operum chegam ao agente com status e tool;
  - anexar arquivo ou link e excluir anexo (PR #27);
  - iniciar, parar e lançar o tempo das tarefas (PR #29).
- **Segurança:** escopo de tenant em todas as rotas do sprint-service. PAT restrito a leituras de identidade em `/auth/*`. Rotas de papéis, stakeholders e membros do project-service validadas por tenant.
- **Deploy:** por SSH, sincronizando os `docker-compose*.yml`, rodando as migrations do app antes de subir e esperando o health dos serviços.
- **Anexos:** corrigida a "Falha ao registrar o anexo" (colunas de `files.Attachment`). Aceita vídeos, PowerPoint, OpenDocument, TXT, CSV e ZIP, até 50 MB (PR #26). Anexo do tipo link, com miniatura do YouTube (PR #27).
- **Card:** a descrição salva sozinha, e o prazo (início e entrega) pode ser editado e removido, com selo colorido no quadro. Há filtros "vence esta semana" e "atrasados".
- **Kanban:**
  - prioridade sempre visível no minicard;
  - posições renumeradas ao arrastar;
  - busca unificada (sprint atual, outras sprints, backlog, projetos e pessoas);
  - dashboard da sprint com o menu do projeto.
- **Cadastros:**
  - funções sem duplicata e catálogo global nos stakeholders;
  - ranking com a função no projeto;
  - "Tenants" passa a se chamar "Instituições";
  - stakeholders adicionados pela barra de pesquisa;
  - o documento EAP explica a falha em vez de "Erro interno".
- **Sessão:** expira após 30 min sem uso e ao fechar o navegador; o login volta para a página de origem.

## [1.6.2] — 2026-09-29
- Corrige a inicialização dos serviços em imagens de produção: `dotenv`, importado em runtime, passa de dependência de desenvolvimento para dependência de execução nos cinco serviços NestJS. Evita `Cannot find module 'dotenv/config'` após instalação com `--prod`.

## [1.6.1] — 2026-09-27
- MCP exposto também em `https://api.operum.adm.br/mcp` (fallback enquanto `mcp.operum.adm.br` não tem DNS).
- Versão do sistema exibida no rodapé da sidebar e na página Sobre.

## [1.6.0] — 2026-09-26 — Integração MCP com Claude
- Personal Access Tokens (auth-service, validação no api-gateway, página `/perfil/tokens`).
- Servidor MCP remoto (`mcp-server`) com `operum_whoami` e `operum_list_projects`.
- Migrations do auth-service automatizadas no deploy.
- Correção de IDOR em `GET /projects/user/:userId`.

## [1.5.0] — 2026-09-21 — Documentos da EAP
- Geração de documentos da EAP e sistema de templates.
- Stakeholders, menubar da WBS e biblioteca de equipe.

## [1.4.0] — 2026-08-12 a 2026-09-02 — Sprint board e ajustes de spec
- Sprint board revisado (backlog no modal, concluído somente leitura, timer real, drag otimista).
- Cadastros globais, Atas em Documentos, planilha de custos por salário, página `/equipe`.
- Sessão inválida redireciona ao login em qualquer tela.
- Migração de domínio para `operum.adm.br`.

## [1.3.0] — 2026-06-14 — EAP/WBS
- Módulo EAP/WBS com canvas interativo.

## [1.2.0] — 2026-06-01 a 2026-06-09 — Multi-tenant
- Troca de tenant, gerenciador de tenants, provisionamento sem senha.
- Detalhe do card: histórico de movimentação, tempo com motivo obrigatório, anexos.
- Responsáveis e edição/exclusão de comentários.

## [1.1.0] — 2026-04-25 a 2026-05-09 — Documentação do projeto
- Stakeholders unificados, documentação versionada com aprovação, assinatura do gerente.
- Termo de Abertura de Projeto, rascunhos com autosave, backlog e custo por card.

## [1.0.0] — 2026-04-21 — Produção em microsserviços
- auth-service, api-gateway, file-service, project-service, sprint-service e notification-service.
- Pipeline DevSecOps com deploy via GHCR e webhook.
