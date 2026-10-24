import { permanentRedirect } from 'next/navigation'

/** Endereço antigo dos tokens, mantido para links em tutoriais e mensagens do MCP. */
export default function ApiTokensPage() {
  permanentRedirect('/configuracoes/integracoes')
}
