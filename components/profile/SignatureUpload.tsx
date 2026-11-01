'use client'

import GlassButton from '@/components/ui/GlassButton'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { uploadSignatureAction } from '@/app/actions/profile'

const SignatureEditor = dynamic(() => import('@/components/assinatura/SignatureEditor'), {
  ssr: false,
  loading: () => <p role="status">Carregando editor de assinatura…</p>,
})

export default function SignatureUpload({ signatureUrl: initial }: { signatureUrl?: string | null }) {
  const [signatureUrl, setSignatureUrl] = useState(initial)
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const [imageError, setImageError] = useState(false)

  async function save(file: File) {
    const form = new FormData()
    form.append('file', file)
    const result = await uploadSignatureAction(form)
    if (!('signatureUrl' in result) || !result.signatureUrl) throw new Error(result.error || 'Não foi possível salvar a assinatura.')
    setImageError(false)
    setSignatureUrl(result.signatureUrl)
    setSuccess(true)
    setOpen(false)
  }
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-gray-500">Desenhe sua assinatura ou envie PNG, JPG ou PDF e recorte a área desejada. Ela aparecerá nos documentos do projeto.</p>
    {signatureUrl ? (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="mb-3 text-sm font-medium text-gray-700">Sua assinatura atual</p>
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-gray-200 bg-white p-3">
          {imageError ? (
            <p role="alert" className="text-sm text-red-600">Não foi possível carregar a assinatura salva. Recarregue a página para tentar novamente.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureUrl} alt="Assinatura atual" onError={() => setImageError(true)} className="max-h-48 w-full object-contain" />
          )}
        </div>
      </div>
    ) : <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">Você ainda não cadastrou sua assinatura.</p>}
    <div className="flex flex-wrap gap-3">
      <GlassButton variant="primary" onClick={() => { setSuccess(false); setOpen(true) }}>{signatureUrl ? 'Alterar assinatura' : 'Criar assinatura'}</GlassButton>

    </div>
    {success && <p role="status" className="text-sm text-green-700">Assinatura salva com sucesso.</p>}
    {open && <SignatureEditor onSave={save} onClose={() => setOpen(false)} />}
  </div>
}
