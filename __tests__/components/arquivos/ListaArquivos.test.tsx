import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ListaArquivos, { type ItemArquivo } from '@/components/arquivos/ListaArquivos'

const base = { tamanho: '2 KB', enviadoPor: null, data: '2026-11-19T12:00:00.000Z', acoes: null }
const itens: ItemArquivo[] = [
  { ...base, id: 'f1', nome: 'fachada.png', subtitulo: 'image/png', categoria: 'imagem', previa: '/api/x/f1', abrir: '/api/x/f1' },
  { ...base, id: 'v1', nome: 'obra.mp4', subtitulo: 'video/mp4', categoria: 'video', previa: '/api/x/v1', abrir: '/api/x/v1' },
]

describe('ListaArquivos — modos de visualização', () => {
  beforeEach(() => window.localStorage.clear())

  it('sem chave de visualização mantém só a tabela', () => {
    render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} />)
    expect(screen.queryByRole('radiogroup', { name: 'Modo de visualização' })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('blocos mostram a arte, o tamanho é ajustável e a escolha fica guardada', () => {
    const { container, unmount } = render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} visualizacao="teste" />)
    expect(screen.queryByRole('slider', { name: 'Tamanho dos blocos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Blocos' }))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir fachada.png' })).toHaveAttribute('href', '/api/x/f1')
    expect(container.querySelector('img[src="/api/x/f1"]')).toBeInTheDocument()
    expect(container.querySelector('video[src="/api/x/v1#t=0.1"]')).toBeInTheDocument()

    const slider = screen.getByRole('slider', { name: 'Tamanho dos blocos' })
    fireEvent.change(slider, { target: { value: '300' } })
    expect(screen.getByRole('list', { name: 'Arquivos em blocos' }).style.gridTemplateColumns).toContain('300px')
    unmount()

    render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} visualizacao="teste" />)
    expect(screen.getByRole('radio', { name: 'Blocos' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('slider', { name: 'Tamanho dos blocos' })).toHaveValue('300')
  })
})

describe('ListaArquivos — círculos de seleção', () => {
  it('sem `selecao` não há coluna de círculos', () => {
    render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('com `selecao`: círculo por linha e selecionar tudo; no modo Blocos o círculo fica no canto', () => {
    window.localStorage.clear()
    const mudou = vi.fn()
    render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} visualizacao="circ" selecao={{ selecionados: ['f1'], onChange: mudou, acoes: () => null }} />)
    expect(screen.getByRole('checkbox', { name: 'Selecionar fachada.png' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Selecionar obra.mp4' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Selecionar todos os arquivos' })).toHaveAttribute('aria-checked', 'mixed')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar obra.mp4' }))
    expect(mudou).toHaveBeenLastCalledWith(['f1', 'v1'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos os arquivos' }))
    expect(mudou).toHaveBeenLastCalledWith(['f1', 'v1'])

    fireEvent.click(screen.getByRole('radio', { name: 'Blocos' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar obra.mp4' }))
    expect(mudou).toHaveBeenLastCalledWith(['f1', 'v1'])
  })
})

describe('ListaArquivos — ordenação pelos títulos', () => {
  const lista: ItemArquivo[] = [
    { id: 'b', nome: 'b10.png', subtitulo: 'Imagem PNG', categoria: 'imagem', tamanho: '2 MB', tamanhoBytes: 2_000_000, enviadoPor: 'Caio', data: '2026-11-10T12:00:00.000Z' },
    { id: 'a', nome: 'B2.png', subtitulo: 'Imagem PNG', categoria: 'imagem', tamanho: '900 KB', tamanhoBytes: 900_000, enviadoPor: 'Ana', data: '2026-11-18T12:00:00.000Z' },
    { id: 'c', nome: 'a.mp4', subtitulo: 'Vídeo MP4', categoria: 'video', tamanho: '10 MB', tamanhoBytes: 10_000_000, enviadoPor: null, data: '2026-11-01T12:00:00.000Z' },
  ]
  const nomes = () => screen.getAllByRole('row').slice(1).map(r => r.querySelector('td')?.textContent)

  it('clique ordena crescente, de novo decrescente; tamanho pelos bytes e nomes com número natural', () => {
    render(<ListaArquivos itens={lista} tipos={['imagem', 'video']} />)
    expect(nomes()).toEqual(['b10.png', 'B2.png', 'a.mp4'])
    const nome = screen.getByRole('button', { name: /^Ordenar por Nome/ })
    fireEvent.click(nome)
    expect(nomes()).toEqual(['a.mp4', 'B2.png', 'b10.png'])
    expect(nome.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(nome)
    expect(nomes()).toEqual(['b10.png', 'B2.png', 'a.mp4'])
    expect(nome.closest('th')).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Tamanho/ }))
    expect(nomes()).toEqual(['B2.png', 'b10.png', 'a.mp4'])
    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Data/ }))
    expect(nomes()).toEqual(['a.mp4', 'b10.png', 'B2.png'])
    expect(nome.closest('th')).not.toHaveAttribute('aria-sort')
  })
})

describe('ListaArquivos — teclado e ordem do Tab', () => {
  const base2 = { tamanho: '1 KB', enviadoPor: null, data: '2026-11-19T12:00:00.000Z' }
  const lista: ItemArquivo[] = ['alfa.png', 'beta.png', 'carta.png', 'delta.png'].map((nome, i) => ({
    ...base2, id: `i${i}`, nome, subtitulo: 'image/png', categoria: 'imagem' as const, abrir: `/x/${i}`,
    acoes: <button type="button">Ação de {nome}</button>,
  }))
  function Controlada({ onExcluir, onRenomear, onAbrir }: { onExcluir?: (ids: string[]) => void; onRenomear?: (id: string) => void; onAbrir?: () => void }) {
    const [sel, setSel] = useState<string[]>([])
    return <>
      <p data-testid="sel">{sel.join(',')}</p>
      <ListaArquivos itens={lista} tipos={['imagem']} onAbrir={onAbrir} selecao={{ selecionados: sel, onChange: setSel, acoes: () => null, onExcluir, onRenomear }} />
    </>
  }
  const linha = (nome: string) => screen.getByRole('row', { name: new RegExp(nome) })
  const sel = () => screen.getByTestId('sel').textContent

  it('Tab: só a primeira linha e as ações dela entram na ordem; círculos das linhas ficam de fora', () => {
    render(<Controlada />)
    const linhas = screen.getAllByRole('row').filter(r => r.hasAttribute('data-arq-id'))
    expect(linhas.map(r => r.tabIndex)).toEqual([0, -1, -1, -1])
    expect(screen.getByRole('button', { name: 'Ação de alfa.png' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Ação de beta.png' }).tabIndex).toBe(-1)
    expect(screen.getByRole('checkbox', { name: 'Selecionar alfa.png' }).tabIndex).toBe(-1)
    // O círculo de "selecionar todos" continua na sequência do Tab.
    expect(screen.getByRole('checkbox', { name: 'Selecionar todos os arquivos' }).tabIndex).toBe(0)
  })

  it('setas movem o foco e selecionam; o ponto de Tab acompanha o foco', () => {
    render(<Controlada />)
    linha('alfa').focus()
    fireEvent.keyDown(linha('alfa'), { key: 'ArrowDown' })
    expect(sel()).toBe('i1')
    expect(linha('beta')).toHaveFocus()
    expect(linha('beta').tabIndex).toBe(0)
    expect(linha('alfa').tabIndex).toBe(-1)
    expect(screen.getByRole('button', { name: 'Ação de beta.png' }).tabIndex).toBe(0)
    fireEvent.keyDown(linha('beta'), { key: 'ArrowUp' })
    expect(sel()).toBe('i0')
    fireEvent.keyDown(linha('alfa'), { key: 'End' })
    expect(sel()).toBe('i3')
    fireEvent.keyDown(linha('delta'), { key: 'Home' })
    expect(sel()).toBe('i0')
  })

  it('Shift+seta estende a seleção; Ctrl+seta só move o foco; Espaço marca e desmarca', () => {
    render(<Controlada />)
    linha('alfa').focus()
    fireEvent.keyDown(linha('alfa'), { key: 'ArrowDown' })
    fireEvent.keyDown(linha('beta'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(linha('carta'), { key: 'ArrowDown', shiftKey: true })
    expect(sel()).toBe('i1,i2,i3')
    fireEvent.keyDown(linha('delta'), { key: 'ArrowUp', ctrlKey: true })
    expect(sel()).toBe('i1,i2,i3')
    expect(linha('carta')).toHaveFocus()
    fireEvent.keyDown(linha('carta'), { key: ' ' })
    expect(sel()).toBe('i1,i3')
    fireEvent.keyDown(linha('carta'), { key: ' ' })
    expect(sel()).toBe('i1,i3,i2')
  })

  it('Ctrl+A e ⌘+A selecionam tudo; Esc limpa', () => {
    render(<Controlada />)
    linha('alfa').focus()
    fireEvent.keyDown(linha('alfa'), { key: 'a', ctrlKey: true })
    expect(sel()).toBe('i0,i1,i2,i3')
    fireEvent.keyDown(linha('alfa'), { key: 'Escape' })
    expect(sel()).toBe('')
    fireEvent.keyDown(linha('alfa'), { key: 'a', metaKey: true })
    expect(sel()).toBe('i0,i1,i2,i3')
  })

  it('Ctrl+A com o foco solto na página seleciona tudo, mas não dentro da busca', () => {
    render(<Controlada />)
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })
    expect(sel()).toBe('i0,i1,i2,i3')
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    fireEvent.keyDown(linha('alfa'), { key: 'Escape' })
    const busca = screen.getByRole('searchbox')
    busca.focus()
    fireEvent.keyDown(busca, { key: 'a', ctrlKey: true })
    expect(sel()).toBe('')
  })

  it('Enter abre, Delete pede a exclusão da seleção (ou da linha), F2 renomeia; sem os callbacks, nada acontece', () => {
    const onExcluir = vi.fn(); const onRenomear = vi.fn(); const onAbrir = vi.fn()
    const { unmount } = render(<Controlada onExcluir={onExcluir} onRenomear={onRenomear} onAbrir={onAbrir} />)
    linha('alfa').focus()
    fireEvent.keyDown(linha('alfa'), { key: 'Enter' })
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'i0' }), expect.any(Array))
    fireEvent.keyDown(linha('alfa'), { key: 'Delete' })
    expect(onExcluir).toHaveBeenLastCalledWith(['i0'])
    fireEvent.keyDown(linha('alfa'), { key: 'a', ctrlKey: true })
    fireEvent.keyDown(linha('alfa'), { key: 'Backspace' })
    expect(onExcluir).toHaveBeenLastCalledWith(['i0', 'i1', 'i2', 'i3'])
    fireEvent.keyDown(linha('beta'), { key: 'F2' })
    expect(onRenomear).toHaveBeenCalledWith('i1')
    unmount()
    render(<Controlada />)
    fireEvent.keyDown(linha('alfa'), { key: 'Delete' })
    fireEvent.keyDown(linha('alfa'), { key: 'F2' })
    expect(sel()).toBe('')
  })

  it('digitar o começo do nome vai até o arquivo', () => {
    render(<Controlada />)
    linha('alfa').focus()
    fireEvent.keyDown(linha('alfa'), { key: 'd', timeStamp: 1000 })
    expect(sel()).toBe('i3')
    expect(linha('delta')).toHaveFocus()
  })

  it('teclas na própria linha não valem para botões dentro dela (Espaço no botão não seleciona a linha)', () => {
    render(<Controlada />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ação de alfa.png' }), { key: ' ' })
    expect(sel()).toBe('')
  })
})

describe('ListaArquivos — cabeçalho fixo', () => {
  const um: ItemArquivo[] = [{ id: 'f1', nome: 'fachada.png', subtitulo: 'image/png', categoria: 'imagem', tamanho: '2 KB', enviadoPor: null, data: '2026-11-19T12:00:00.000Z', acoes: null }]
  beforeEach(() => window.localStorage.clear())

  it('com `cabecalhoFixo`, só a tabela rola (barra de ferramentas e contador ficam fora da área de rolagem)', () => {
    const { container } = render(<ListaArquivos itens={um} tipos={['imagem']} cabecalhoFixo />)
    expect(container.firstElementChild).toHaveClass('arq-fixa')
    const rolagem = container.querySelector('.arq-rolagem') as HTMLElement
    expect(rolagem).toContainElement(screen.getByRole('table'))
    expect(rolagem).not.toContainElement(screen.getByRole('searchbox'))
    expect(rolagem).not.toContainElement(screen.getByText('1 arquivo'))
  })

  it('no modo Blocos, a grade é que rola', () => {
    const { container } = render(<ListaArquivos itens={um} tipos={['imagem']} visualizacao="fixa" cabecalhoFixo />)
    fireEvent.click(screen.getByRole('radio', { name: 'Blocos' }))
    expect(container.querySelector('.arq-rolagem')).toContainElement(screen.getByRole('list', { name: 'Arquivos em blocos' }))
  })

  it('sem a opção, o comportamento é o de sempre (a página rola)', () => {
    const { container } = render(<ListaArquivos itens={um} tipos={['imagem']} />)
    expect(container.firstElementChild).not.toHaveClass('arq-fixa')
    expect(container.querySelector('.arq-rolagem')).toBeNull()
  })
})

describe('ListaArquivos — botão de filtros', () => {
  const MB = 1024 * 1024
  const f = (id: string, nome: string, categoria: ItemArquivo['categoria'], enviadoPor: string | null, tamanhoBytes: number | undefined, favorito?: boolean): ItemArquivo =>
    ({ id, nome, subtitulo: categoria, categoria, tamanho: '1 MB', tamanhoBytes, enviadoPor, data: new Date().toISOString(), acoes: null, favorito })
  const arquivos: ItemArquivo[] = [
    f('a', 'foto-ana.png', 'imagem', 'Ana', 2 * MB, true),
    f('b', 'video-ana.mp4', 'video', 'Ana', 200 * MB, false),
    f('c', 'foto-enzo.png', 'imagem', 'Enzo', 500 * 1024, false),
    f('d', 'laudo-bia.pdf', 'pdf', 'Bia', 3 * MB, false),
  ]
  const abrir = () => { fireEvent.click(screen.getByRole('button', { name: /^Filtros/ })); return screen.getByRole('dialog', { name: 'Filtrar arquivos' }) }
  const opcao = (painel: HTMLElement, nome: string) => fireEvent.click(within(painel).getByRole('button', { name: nome }))
  const nomes = () => screen.queryAllByRole('row').filter(r => r.hasAttribute('data-arq-id')).map(r => r.getAttribute('aria-label')?.replace(/ \(Enter abre\)$/, ''))
  const mostra = (...n: string[]) => n.forEach(x => expect(screen.getByText(x)).toBeInTheDocument())

  function Tela({ lista = arquivos, comSelecao = true }: { lista?: ItemArquivo[]; comSelecao?: boolean }) {
    const [sel, setSel] = useState<string[]>([])
    return <ListaArquivos itens={lista} tipos={['imagem', 'video', 'pdf']} selecao={comSelecao ? { selecionados: sel, onChange: setSel, acoes: () => null } : undefined} />
  }

  it('o seletor "Todos os tipos" virou um botão "Filtros" que abre um painel', () => {
    render(<Tela />)
    expect(screen.queryByRole('combobox', { name: 'Filtrar por tipo' })).toBeNull()
    const painel = abrir()
    for (const legenda of ['Tipo', 'Enviado em', 'Enviado por', 'Tamanho', 'Estrela']) expect(within(painel).getByText(legenda)).toBeInTheDocument()
  })

  it('filtra na hora, soma opções do mesmo filtro e combina filtros diferentes; o botão mostra quantos estão ativos', () => {
    render(<Tela />)
    const painel = abrir()
    opcao(painel, 'Imagens'); opcao(painel, 'PDFs')
    mostra('foto-ana.png', 'foto-enzo.png', 'laudo-bia.pdf')
    expect(screen.queryByText('video-ana.mp4')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toBeInTheDocument()
    opcao(painel, 'Ana')
    mostra('foto-ana.png')
    expect(screen.queryByText('foto-enzo.png')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filtros (2 ativos)' })).toBeInTheDocument()
    opcao(painel, 'Até 1 MB')
    expect(screen.queryByText('foto-ana.png')).toBeNull()
    expect(screen.getByText('0 arquivos (filtrado)')).toBeInTheDocument()
  })

  it('período, tamanho e estrela filtram; período personalizado mostra os campos de data', () => {
    render(<Tela />)
    const painel = abrir()
    opcao(painel, 'Mais de 100 MB')
    mostra('video-ana.mp4'); expect(screen.queryByText('foto-ana.png')).toBeNull()
    opcao(painel, 'Mais de 100 MB')
    opcao(painel, 'Só com estrela')
    mostra('foto-ana.png'); expect(screen.queryByText('video-ana.mp4')).toBeNull()
    opcao(painel, 'Só com estrela')
    opcao(painel, 'Hoje'); mostra('foto-ana.png', 'laudo-bia.pdf')
    opcao(painel, 'Escolher datas')
    expect(within(painel).getByLabelText('Enviado a partir de')).toBeInTheDocument()
    expect(within(painel).getByLabelText('Enviado até')).toBeInTheDocument()
  })

  it('etiquetas dos filtros ativos: cada uma remove o seu; "Limpar" tira todos', () => {
    render(<Tela />)
    const painel = abrir()
    opcao(painel, 'Vídeos'); opcao(painel, 'Ana')
    const etiquetas = screen.getByRole('list', { name: 'Filtros ativos' })
    expect(within(etiquetas).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Remover filtro: Vídeos', 'Remover filtro: Ana'])
    fireEvent.click(within(etiquetas).getByRole('button', { name: 'Remover filtro: Ana' }))
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toBeInTheDocument()
    fireEvent.click(within(painel).getByRole('button', { name: 'Limpar' }))
    expect(screen.queryByRole('list', { name: 'Filtros ativos' })).toBeNull()
    expect(nomes()).toHaveLength(4)
    expect(within(painel).getByRole('button', { name: 'Limpar' })).toBeDisabled()
  })

  it('só oferece os filtros que fazem sentido para a lista (sem tamanho, sem estrela, sem remetente)', () => {
    const semDados = arquivos.map(a => ({ ...a, tamanhoBytes: undefined, favorito: undefined, enviadoPor: null }))
    render(<Tela lista={semDados} comSelecao={false} />)
    const painel = abrir()
    expect(within(painel).getByText('Tipo')).toBeInTheDocument()
    for (const legenda of ['Tamanho', 'Estrela', 'Enviado por']) expect(within(painel).queryByText(legenda)).toBeNull()
  })

  it('Esc fecha o painel e Ctrl+A dentro dele não seleciona os arquivos', () => {
    render(<Tela />)
    const painel = abrir()
    fireEvent.keyDown(within(painel).getByRole('button', { name: 'Imagens' }), { key: 'a', ctrlKey: true })
    expect(screen.queryByText(/itens? selecionados?/)).toBeNull()
    fireEvent.keyDown(painel, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Filtrar arquivos' })).toBeNull()
  })
})
