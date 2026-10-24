import { permanentRedirect } from 'next/navigation'

/** Endereço antigo do perfil, que agora fica em Configurações. */
export default function PerfilPage() {
  permanentRedirect('/configuracoes/perfil')
}
