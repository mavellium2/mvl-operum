/**
 * Motivo gravado nos projetos quando a conta é desativada no sistema. O prefixo
 * identifica esses vínculos: ao reativar a conta, só eles voltam (inativações
 * feitas no projeto, com outro motivo, continuam como estão).
 */
export const CONTA_INATIVADA = 'Conta inativada no sistema'

export const motivoDaContaInativada = (motivo?: string | null) =>
  motivo?.trim() ? `${CONTA_INATIVADA}: ${motivo.trim()}`.slice(0, 500) : CONTA_INATIVADA

export const foiPelaConta = (motivo?: string | null) => !!motivo && motivo.startsWith(CONTA_INATIVADA)
