/**
 * Equipe de Desenvolvimento — cadastro editável em código.
 *
 * ESTE ARQUIVO É O LUGAR-FONTE DA VERDADE PARA A EQUIPE EXIBIDA EM /sobre.
 * Para alterar os integrantes, edite o array `DESENVOLVEDORES` abaixo
 * (nome, papel, email e rede) e faça commit.
 */

export interface Desenvolvedor {
  nome: string
  area: 'desenvolvimento' | 'orientacao'
  papel: string
  instituicao?: string
  curso?: string
  email: string
  rede?: string
}

/** Instituição/curso origem da equipe (placeholders ajustáveis). */
export const EQUIPE_INFO = {
  instituicao: 'Fatec Garça',
  curso: 'Tecnologia em Gestão Empresarial',
}

export const DESENVOLVEDORES: Desenvolvedor[] = [
  {
    nome: 'Fábio Rodrigues Gonçalves',
    area: 'orientacao',
    papel: 'Professor especialista',
    email: 'fabio.goncalves01@cps.sp.gov.br',
  },
  {
    nome: 'Vinícius Tavares Mota',
    area: 'desenvolvimento',
    papel: 'Desenvolvimento · ADS-AMS',
    instituicao: 'Fatec Garça',
    curso: 'ADS-AMS',
    email: 'vinicius.mota2@aluno.cps.sp.gov.br',
    rede: 'https://www.linkedin.com/in/viniciustmota/',
  },
]
