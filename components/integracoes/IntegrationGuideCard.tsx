'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { ArrowRight, BookOpen } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import Modal from '@/components/ui/Modal'

type GuideSummary = { id: string; name: string; logo: string; surface: string; description: string; method: string }

/** Card compacto e guia ampliado: leitura e ações não disputam espaço na grade. */
export default function IntegrationGuideCard({ guide, children }: { guide: GuideSummary; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <>
    <GlassCard as="article" interactive className="integration-app-card flex h-full flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="integration-app-logo"><Image src={`/integrations/${guide.logo}.svg`} alt="" width={26} height={26} /></span>
        <div className="min-w-0"><h3 className="text-base font-semibold text-gray-900">{guide.name}</h3><p className="mt-0.5 text-xs text-gray-500">{guide.surface}</p></div>
      </div>
      <p className="mb-5 mt-4 text-sm leading-6 text-gray-600">{guide.description}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <span className="integration-method text-[11px] text-gray-500">{guide.method}</span>
        <GlassButton variant="primary" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Como conectar ${guide.name}`}><BookOpen size={15} aria-hidden="true" />Como conectar<ArrowRight size={14} aria-hidden="true" /></GlassButton>
      </div>
    </GlassCard>
    {open && <Modal isOpen onClose={() => setOpen(false)} title={`Conectar ${guide.name}`} closeButton={<GlassCloseButton label="Fechar guia" onClick={() => setOpen(false)} />} maxWidth="max-w-3xl" className="phase-delete-dialog integration-guide-dialog">
      {children}
      <div className="mt-6 flex justify-end border-t border-gray-200/50 pt-4"><GlassButton onClick={() => setOpen(false)}>Fechar guia</GlassButton></div>
    </Modal>}
  </>
}
