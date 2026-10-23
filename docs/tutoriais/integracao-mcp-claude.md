# Como conectar o Claude ao Operum (MCP)

Este guia mostra como ligar o Claude ao seu Operum. Depois de conectado, você pede em português e o Claude consulta e atualiza o Operum por você: lista as tarefas da sprint, cria cards, move para "Em andamento", liga o timer, comenta e anexa arquivos.

O fim deste documento traz o **roteiro do vídeo tutorial**, com as cenas na ordem.

---

## O que você precisa

- Uma conta no Operum, com acesso aos projetos que quer usar.
- O **Claude Code** instalado: no terminal ou na extensão do VS Code. As instruções de instalação estão em https://claude.com/claude-code.

> **Onde funciona:** no **Claude Code** (terminal e VS Code), com o token pessoal dos Passos 1 a 3. No **app do Claude** (claude.ai, Desktop e celular), com login, sem token: veja [No app do Claude](#no-app-do-claude-web-desktop-e-celular). Para programar pelo celular, veja [Claude Code na nuvem](#pelo-celular-claude-code-na-nuvem).

---

## Passo 1 — Gerar o seu token no Operum

1. Entre no Operum.
2. Clique na **sua foto**, no topo da barra lateral, para abrir **Meu perfil**.
3. No quadro **Personal Access Tokens**, clique em **Gerenciar tokens →**.
4. Preencha:
   - **Nome:** algo que identifique onde você vai usar, por exemplo `Claude Code - notebook`.
   - **Permitir escrita:** marque se quer que o Claude crie e altere coisas (cards, comentários, timer). Sem essa opção, ele só consulta.
   - **Validade:** 30, 90 ou 180 dias.
5. Clique em **Gerar token**.

O token aparece **uma única vez**. Logo abaixo dele, em **Conectar no Claude Code**, já vem o comando pronto. Clique em **Copiar** ao lado do comando.

> Trate o token como uma senha: não mande por chat, não cole em documentos e não suba para o Git. Se ele vazar, volte em **Gerenciar tokens** e clique em **Revogar**. O token para de funcionar na hora.

---

## Passo 2 — Conectar no Claude Code

Abra o terminal (ou o terminal do VS Code), cole o comando que você copiou e aperte Enter. Ele tem este formato:

```bash
claude mcp add --transport http operum https://api.operum.adm.br/mcp --header "Authorization: Bearer opr_pat_..."
```

Para conferir, rode `claude mcp list`. O `operum` deve aparecer como conectado.

---

## Passo 3 — Testar

Abra o Claude Code (`claude`) e peça:

> Liste os meus projetos no Operum.

Na primeira vez, o Claude pede autorização para usar a ferramenta do Operum. Autorize. Ele deve responder com os seus projetos.

---

## O que pedir ao Claude

Alguns exemplos que funcionam bem:

- "Quais tarefas estão em **A Fazer** na sprint atual do projeto Operum?"
- "Crie um card **Revisar o Termo de Abertura** na sprint 1, com prioridade alta e eu como responsável."
- "Mova o card **Revisar o Termo de Abertura** para **Em andamento** e inicie o timer."
- "Comente no card que a revisão terminou e pare o timer."
- "Anexe o arquivo `relatorio.pdf` que está na minha pasta Downloads ao card **Relatório mensal**."
- "Resuma o que foi feito nesta semana no projeto, pelas movimentações dos cards."

O Claude respeita as suas permissões no Operum: ele só vê e altera o que você mesmo poderia ver e alterar.

---

## Se você participa de mais de uma instituição

Cada token vale para uma instituição. Para usar várias com a mesma conexão:

1. Gere um token em cada instituição (troque de instituição no topo do Operum e repita o Passo 1).
2. Conecte com o primeiro token no `Authorization` e os demais, separados por vírgula, no `X-Operum-Tokens`:

```bash
claude mcp add --transport http operum https://api.operum.adm.br/mcp \
  --header "Authorization: Bearer opr_pat_PRIMEIRA" \
  --header "X-Operum-Tokens: opr_pat_SEGUNDA,opr_pat_TERCEIRA"
```

A primeira instituição é a padrão. Para falar de outra, cite o nome dela no pedido: "No Fábio, liste...".

Se você já tinha conectado antes, remova a conexão antiga com `claude mcp remove operum` e rode o comando novo.

---

## No app do Claude (web, Desktop e celular)

> Disponível a partir da versão 1.36.0, depois que o login OAuth for ligado no servidor.

1. No claude.ai (no computador ou no navegador do celular), abra **Configurações → Conectores** e clique em **Adicionar conector personalizado**.
2. **Nome:** `Operum`. **URL:** `https://api.operum.adm.br/mcp`. Deixe os campos de OAuth em branco.
3. Clique em **Conectar**. Abre a tela de login do Operum. Entre com o seu usuário.
4. Na tela de autorização, confira se o retorno é para **claude.ai**, marque os workspaces que quer usar e deixe "Permitir criar e alterar" marcado se quiser que o Claude crie e mova cards.
5. Clique em **Permitir**. Pronto: no app do celular, o conector já aparece na conversa. Peça, por exemplo: "Crie no Operum um card *Revisar contrato* na sprint atual do projeto Operum".

Para desconectar, vá em **Meu perfil → Personal Access Tokens → Apps conectados** e clique em **Desconectar**. O acesso acaba na hora.

O conector também funciona nas sessões do Claude Code na nuvem: com ele ligado na sessão, não precisa do segredo de rede da seção abaixo.

---

## Pelo celular: Claude Code na nuvem

Na aba **Code** do app Claude (ou em [claude.ai/code](https://claude.ai/code)), o Claude Code roda num servidor da Anthropic. Ele clona o repositório do Operum, mexe no código, roda os testes e abre a PR, mesmo com o seu computador desligado. Com a configuração abaixo, ele também lê e atualiza os cards pelo MCP.

O repositório já traz um `.mcp.json` com o servidor `operum-nuvem`, sem token. O token fica guardado no ambiente da nuvem como **segredo de rede**: o proxy da Anthropic coloca o token na requisição só depois que ela sai da máquina da sessão, então ele não aparece nas variáveis nem nos arquivos que o Claude vê.

1. Gere um token no Operum (Passo 1), com **Permitir escrita**, na instituição em que estão os seus projetos.
2. Em [claude.ai/code](https://claude.ai/code), conecte o GitHub e escolha o repositório `mavellium/mvl-operum`.
3. Abra o ambiente da nuvem para editar e, em **Network secrets**, clique em **Add secret**:
   - **Secret type:** Bearer
   - **Name:** `Operum MCP`
   - **Allowed websites:** `api.operum.adm.br`
   - **Custom headers:** `Authorization`, prefixo `Bearer`, e o token como **Value**
   - Para outras instituições, adicione uma segunda linha: nome `X-Operum-Tokens`, sem prefixo, com os demais tokens separados por vírgula.
4. Abra uma sessão e peça, por exemplo: "Liste as tarefas em A Fazer da sprint ativa do projeto Operum, implemente a primeira e abra a PR".

Não coloque o token em **Environment variables**: qualquer pessoa que use o ambiente consegue ler esses valores.

No seu computador, o Claude Code também vai encontrar o `operum-nuvem` no `.mcp.json` e pedir aprovação. Se você já conectou o Operum pelo Passo 2, recuse: sem token, esse servidor responde "não autorizado".

> Com o conector do app do Claude (seção acima) ligado na sessão, o segredo de rede não é necessário.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| `operum` não aparece em `claude mcp list` | Rode o comando do Passo 2 de novo, no mesmo terminal em que você usa o Claude. |
| O Claude diz que não tem permissão para criar ou alterar | O token foi gerado sem **Permitir escrita**. Gere outro com a opção marcada. |
| "Token inválido" ou "não autorizado" | O token venceu ou foi revogado. Gere outro e conecte de novo (`claude mcp remove operum` e o comando novo). |
| O Claude não encontra um projeto | Confira se você é membro do projeto no Operum e se ele é da instituição do token. |
| Cópias ou importações grandes param no meio | Aumente o tempo limite das ferramentas: `MCP_TOOL_TIMEOUT=600000 claude`. |

---

## Roteiro do vídeo tutorial

**Duração estimada:** de 5 a 6 minutos. **Para quem:** quem usa o Operum e nunca conectou o Claude.

Antes de gravar:
- Use uma conta de teste, ou **revogue o token logo depois de gravar**, porque ele aparece na tela.
- Deixe aberto um projeto com uma sprint e alguns cards, para a demonstração.
- Aumente a fonte do terminal para o texto ficar legível no vídeo.

| # | Tempo | O que mostrar na tela | O que falar |
|---|---|---|---|
| 1 | 0:00–0:30 | Quadro de uma sprint no Operum. | "Neste vídeo você vai conectar o Claude ao Operum. Depois disso, dá para pedir em português: criar cards, mover, iniciar o timer, comentar e anexar arquivos, sem sair do editor." |
| 2 | 0:30–0:50 | Página do Claude Code e o terminal com `claude --version`. | "Você precisa do Claude Code instalado, no terminal ou no VS Code. O link de instalação está na descrição. Pelo site claude.ai ainda não funciona." |
| 3 | 0:50–1:40 | Clicar na foto → **Meu perfil** → **Gerenciar tokens →**. Preencher **Nome**, marcar **Permitir escrita**, escolher **Validade** e clicar em **Gerar token**. | "O Claude acessa o Operum com um token pessoal. Dê um nome que lembre onde você vai usar. Marque Permitir escrita se quiser que ele crie e altere coisas. O token aparece uma única vez, então guarde como se fosse uma senha." |
| 4 | 1:40–2:10 | Em **Conectar no Claude Code**, clicar em **Copiar**. Colar no terminal, apertar Enter e rodar `claude mcp list`. | "O Operum já monta o comando. É só copiar, colar no terminal e conferir com `claude mcp list`: o operum aparece conectado." |
| 5 | 2:10–2:50 | Abrir `claude` e pedir "Liste os meus projetos no Operum". Autorizar a ferramenta. | "Na primeira vez, ele pede autorização para usar o Operum. Autorize, e pronto: ele já lê os seus projetos." |
| 6 | 2:50–4:10 | Pedir: "Crie um card 'Gravar tutorial' na sprint 1 com prioridade alta e eu como responsável", e depois "Mova para Em andamento e inicie o timer". Mostrar o quadro do Operum atualizando (recarregar a página). | "Agora uma tarefa de verdade. Ele cria o card, coloca você como responsável, move para Em andamento e liga o timer. Repare que no Operum o card já aparece em Em andamento com o tempo correndo." |
| 7 | 4:10–4:40 | Pedir "Comente no card que terminei e pare o timer". Mostrar o comentário e o tempo registrado no card. | "Para fechar: um comentário e o timer parado. O tempo fica registrado no card, como se você tivesse feito pela tela." |
| 8 | 4:40–5:10 | Voltar em **Gerenciar tokens** e mostrar a lista de tokens ativos e o botão **Revogar**. | "Se o token vazar ou você trocar de computador, revogue aqui. Ele para de funcionar na hora. Se você participa de mais de uma instituição, o guia escrito mostra como usar vários tokens." |
| 9 | 5:10–5:30 | Tela final com o link do guia. | "O passo a passo completo e os problemas mais comuns estão no guia. Até a próxima." |

Depois de gravar: **revogue o token mostrado no vídeo** e anexe o vídeo, ou o link dele, ao card do tutorial no Operum.
