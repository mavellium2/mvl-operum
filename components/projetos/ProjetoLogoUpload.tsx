'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { uploadAvatarAction } from '@/app/actions/profile'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'

/**
 * Logo do projeto no cartão do Editar projeto: quadrado (56 ou 80 px) que vira
 * "Trocar" ao passar o mouse e abre o seletor de arquivo. Sem logo, mostra a
 * inicial do nome.
 */
export default function ProjetoLogoUpload({ nome, url, onChange, disabled = false, tamanho = 'lg' }: {
  /** `md`: 56 px (coluna lateral); `lg`: 80 px. */
  tamanho?: 'md' | 'lg'
  nome: string
  url: string
  onChange: (url: string) => void
  disabled?: boolean
}) {
  const arquivo = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const imagem = safeAvatarUrl(url)
  const inicial = nome.trim().charAt(0).toUpperCase() || 'P'

  async function enviar(file: File | undefined) {
    if (!file) return
    setEnviando(true)
    setErro(null)
    const fd = new FormData()
    fd.append('file', file)
    const r = await uploadAvatarAction(fd)
    if ('avatarUrl' in r && r.avatarUrl) onChange(r.avatarUrl)
    else setErro(('error' in r && r.error) || 'Não foi possível enviar a logo.')
    setEnviando(false)
    if (arquivo.current) arquivo.current.value = ''
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={disabled || enviando}
        onClick={() => arquivo.current?.click()}
        aria-label={imagem ? 'Trocar logo do projeto' : 'Enviar logo do projeto'}
        className={`group relative flex ${tamanho === 'md' ? 'h-14 w-14 rounded-xl text-2xl' : 'h-20 w-20 rounded-2xl text-3xl'} items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-400 to-blue-600 font-extrabold text-white shadow-sm ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed`}
      >
        {imagem
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imagem} alt="" className="h-full w-full bg-white object-contain" />
          : inicial}
        {!disabled && (
          <span className={`absolute inset-0 flex-col items-center justify-center gap-0.5 bg-slate-900/50 text-[11px] font-semibold text-white ${enviando ? 'flex' : 'hidden group-hover:flex group-focus-visible:flex'}`}>
            {enviando
              ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <><Camera className="h-4 w-4" />{imagem ? 'Trocar' : 'Enviar'}</>}
          </span>
        )}
      </button>
      <input ref={arquivo} type="file" accept="image/*" className="hidden" onChange={e => void enviar(e.target.files?.[0])} />
      {erro && <p role="alert" className="mt-1 max-w-20 text-[11px] text-red-600">{erro}</p>}
    </div>
  )
}
