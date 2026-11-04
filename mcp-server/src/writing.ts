/**
 * Regra de escrita para agentes que usam o MCP do Operum. Descrições e
 * comentários são lidos por pessoas na tela do card, que interpreta Markdown.
 * Fonte única: entra nas instruções do servidor e na descrição dos campos.
 */
export const WRITING_RULES = [
  'Como escrever descrições de cards e comentários (são lidos por pessoas na tela do Operum, que mostra Markdown):',
  '- Português simples e direto. Escreva para quem não acompanhou o trabalho.',
  '- Comece pelo resultado ou pelo pedido em uma frase. Detalhes vêm depois.',
  '- Use quebras de linha reais (\\n). Deixe uma linha em branco entre parágrafos, listas, tabelas e títulos. Nunca escreva tudo em uma linha.',
  '- Parágrafos curtos, uma ideia cada. Para vários itens, use lista com "- ", um item por linha.',
  '- Títulos "### " só em textos longos, para separar seções. Negrito só no essencial.',
  '- Tabela só para comparar poucas colunas (até 4) com células curtas. Se não couber, use lista.',
  '- Datas em dd/mm/aaaa; horários com fuso (ex.: 14:30 BRT). Nomes de arquivo, rota ou código entre `crases`.',
  '- Não repita a descrição do card no comentário. Num comentário, diga o que mudou, a evidência e o próximo passo.',
].join('\n')

/** Versão curta para a descrição dos campos de texto das tools. */
export const WRITING_FIELD_HINT =
  'Markdown lido por pessoas: comece pelo resultado, parágrafos curtos, listas com "- ", linha em branco entre blocos. Siga a regra de escrita das instruções do servidor.'
