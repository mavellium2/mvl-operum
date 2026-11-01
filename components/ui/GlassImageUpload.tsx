'use client'

import { useRef, useState } from 'react'
import GlassButton from '@/components/ui/GlassButton'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import Modal from '@/components/ui/Modal'
import ProjectImageCrop from '@/components/projetos/ProjectImageCrop'
import UserAvatar from '@/components/user/UserAvatar'
import { Camera } from 'lucide-react'
import { uploadAvatarAction } from '@/app/actions/profile'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'

/** Visualização, recorte e envio compartilhados entre logo e foto de perfil. */
export default function GlassImageUpload({ nome, url, onChange, disabled = false, tamanho = 'lg', context = 'project' }: {
  tamanho?: 'md' | 'lg'
  nome: string
  url: string
  onChange: (url: string) => void
  disabled?: boolean
  context?: 'project' | 'profile'
}) {
  const profile = context === 'profile'
  const arquivo = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [visualizando, setVisualizando] = useState(false)
  const [recorte, setRecorte] = useState<File | null>(null)
  const [sucesso, setSucesso] = useState(0)
  const imagem = safeAvatarUrl(url)
  const inicial = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(parte => parte[0]).join('').toUpperCase() || 'P'

  async function enviar(file: File | undefined) {
    if (!file) return
    setEnviando(true)
    setErro(null)
    const fd = new FormData()
    fd.append('file', file)
    const r = await uploadAvatarAction(fd).catch(() => ({ error: 'Não foi possível enviar a imagem. Tente novamente.' }))
    if ('avatarUrl' in r && r.avatarUrl) { onChange(r.avatarUrl); setSucesso(s => s + 1) }
    else setErro(('error' in r && r.error) || 'Não foi possível enviar a imagem.')
    setEnviando(false)
    if (arquivo.current) arquivo.current.value = ''
  }

  return (
    <div className="shrink-0">
      <GlassButton variant="custom"
        type="button"
        disabled={enviando}
        onClick={() => setVisualizando(true)}
        aria-label={profile ? 'Visualizar foto de perfil' : 'Visualizar logo do projeto'}
        className={`project-logo-glass group relative flex ${profile ? 'h-24 w-24 rounded-full text-3xl' : tamanho === 'md' ? 'h-14 w-14 rounded-xl text-2xl' : 'h-20 w-20 rounded-2xl text-3xl'} items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-400 to-blue-600 font-extrabold text-white shadow-sm ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed`}
      >
        {profile ? <UserAvatar key={url} name={nome} avatarUrl={url} size="xl" /> : imagem
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imagem} alt="" className="project-logo-image h-full w-full object-cover" />
          : inicial}
        {!disabled && (
          <span className={`project-logo-overlay absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-white ${enviando ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
            {enviando
              ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <><Camera className="h-4 w-4" />Visualizar</>}
          </span>
        )}
        {sucesso > 0 && <span key={sucesso} aria-hidden="true" className="project-logo-success pointer-events-none absolute inset-0" />}
      </GlassButton>
      {visualizando && <Modal isOpen onClose={() => setVisualizando(false)} title={profile ? 'Foto de perfil' : 'Logo do projeto'} closeButton={<GlassCloseButton label="Fechar modal" onClick={() => setVisualizando(false)} />} className="phase-delete-dialog project-logo-dialog" maxWidth="max-w-lg">
        <p className="phase-delete-muted mb-4 break-words text-sm">{nome}</p>
        <div className="project-logo-preview flex min-h-56 items-center justify-center rounded-2xl border p-5">
          {imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagem} alt={profile ? `Foto de ${nome || 'perfil'}` : `Logo de ${nome || 'projeto'}`} className="max-h-[55vh] max-w-full object-contain" />
          ) : <div className="flex flex-col items-center gap-4"><span className="flex h-32 w-32 items-center justify-center rounded-3xl border border-white/20 bg-violet-400/10 text-5xl font-semibold">{inicial}</span><p className="phase-delete-muted text-sm">{profile ? 'Você ainda não tem uma foto de perfil.' : 'Este projeto ainda não tem uma logo salva.'}</p></div>}
        </div>
        <div className="image-dialog-actions mt-5 flex flex-wrap justify-end gap-2.5 pb-2">
          <GlassButton onClick={() => setVisualizando(false)}>Fechar</GlassButton>
          {!disabled && <GlassButton variant="primary" onClick={() => { setVisualizando(false); arquivo.current?.click() }}><Camera aria-hidden="true" className="h-4 w-4" strokeWidth={1.7} />{imagem ? 'Alterar imagem' : 'Adicionar imagem'}</GlassButton>}
        </div>
      </Modal>}
      {recorte && <ProjectImageCrop title={profile ? 'Ajustar foto de perfil' : 'Ajustar imagem do projeto'} file={recorte} onCancel={() => setRecorte(null)} onConfirm={file => { setRecorte(null); void enviar(file) }} />}
      <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) setRecorte(file); e.target.value = '' }} />
      {erro && <p role="alert" className="mt-1 max-w-20 text-[11px] text-red-600">{erro}</p>}
    </div>
  )
}
