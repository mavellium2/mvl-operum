import { describe, it, expect } from 'vitest'
import { CATEGORIAS_ARQUIVO, categoriaDoSlug, erroDoArquivo, SECOES_ARQUIVOS, tipoDoArquivo, tipoLegivel, visualDoTipo } from '@/lib/arquivosProjeto'

describe('seções de arquivos declaradas pelos formatos', () => {
  it('cada seção deriva tipos, accept, filtro e mensagem só da lista de formatos', () => {
    expect(SECOES_ARQUIVOS.FOTOS_VIDEOS.mensagemTipo).toBe('Envie fotos (JPG, PNG, WEBP, GIF, SVG) ou vídeos (MP4, WEBM, MOV).')
    expect(SECOES_ARQUIVOS.APRESENTACAO.mensagemTipo).toBe('Envie apresentações (PPTX, PPT, ODP), PDF ou vídeos (MP4, WEBM, MOV).')
    expect(SECOES_ARQUIVOS.DESENHOS_TECNICOS.mensagemTipo).toBe('Envie fotos (JPG, PNG, WEBP, GIF, SVG), PDF ou arquivos de CAD (DWG, DXF, STEP, STL).')
    expect(SECOES_ARQUIVOS.PESQUISAS.mensagemTipo).toBe('Envie PDF, documentos (DOCX, DOC, ODT, RTF), planilhas (XLSX, XLS, ODS, CSV) ou fotos (JPG, PNG, WEBP, GIF, SVG).')
    expect(SECOES_ARQUIVOS.PESQUISAS.tiposVisuais).toEqual(['pdf', 'documento', 'planilha', 'imagem'])
    expect(SECOES_ARQUIVOS.PESQUISAS.aceita).toContain('.xlsx')
    expect(SECOES_ARQUIVOS.DESENHOS_TECNICOS.blocos).toBe(true)
    expect(SECOES_ARQUIVOS.PESQUISAS.blocos).toBe(false)
  })
  it('categorias e endereços', () => {
    expect(CATEGORIAS_ARQUIVO).toEqual(['FOTOS_VIDEOS', 'APRESENTACAO', 'DESENHOS_TECNICOS', 'PESQUISAS'])
    expect(categoriaDoSlug('desenhos-tecnicos')).toBe('DESENHOS_TECNICOS')
    expect(categoriaDoSlug('pesquisas')).toBe('PESQUISAS')
    expect(categoriaDoSlug('outra')).toBeNull()
  })
  it('aceita só os formatos da seção', () => {
    const xlsx = tipoDoArquivo('resultados.xlsx', '')
    expect(erroDoArquivo('PESQUISAS', xlsx, 1000)).toBeNull()
    expect(erroDoArquivo('FOTOS_VIDEOS', xlsx, 1000)).toMatch(/^Envie fotos/)
    expect(erroDoArquivo('DESENHOS_TECNICOS', tipoDoArquivo('planta.dwg', 'application/octet-stream'), 1000)).toBeNull()
    expect(erroDoArquivo('PESQUISAS', 'text/html', 1000)).toMatch(/^Envie PDF/)
  })
  it('tipo pela extensão conhecida; senão, o do navegador', () => {
    expect(tipoDoArquivo('peça.STP', '')).toBe('model/step')
    expect(tipoDoArquivo('dados.csv', 'application/vnd.ms-excel')).toBe('text/csv')
    expect(tipoDoArquivo('pagina.html', 'text/html')).toBe('text/html')
  })
  it('ícone e nome legível de cada tipo', () => {
    expect(visualDoTipo('model/stl')).toBe('desenho')
    expect(visualDoTipo('application/x-desconhecido')).toBe('outro')
    expect(tipoLegivel('video/mp4')).toBe('Vídeo MP4')
    expect(tipoLegivel('application/pdf')).toBe('PDF')
    expect(tipoLegivel(tipoDoArquivo('a.xlsx', ''))).toBe('Planilha XLSX')
    expect(tipoLegivel('image/jpeg')).toBe('Imagem JPG')
  })
})
