import Link from 'next/link'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import GlassCard from '@/components/ui/GlassCard'
import './legal.css'

export interface LegalSection { id: string; title: string; paragraphs: string[] }

export default function LegalDocument({ title, summary, sections }: { title: string; summary: string; sections: LegalSection[] }) {
  return <ProjectAppearance enabled><main className="legal-document mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-8">
    <nav aria-label="Documentos do Operum" className="mb-6 flex flex-wrap gap-4 text-sm"><Link href="/sobre">Sobre o Operum</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link></nav>
    <GlassCard className="p-5 sm:p-8">
      <header className="mb-6"><p className="mb-2 text-xs text-gray-500">Atualizado em 2 de novembro de 2026</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm leading-6 text-gray-600">{summary}</p></header>
      <nav aria-label="Nesta página" className="legal-index mb-7 flex flex-wrap gap-x-4 gap-y-2 border-y py-4">{sections.map(section => <a key={section.id} href={`#${section.id}`} className="text-xs">{section.title}</a>)}</nav>
      <div className="space-y-7">{sections.map(section => <section key={section.id} id={section.id} className="scroll-mt-6"><h2 className="mb-2 text-base font-semibold">{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph} className="mt-2 text-sm leading-7 text-gray-600">{paragraph}</p>)}</section>)}</div>
      <footer className="legal-index mt-8 border-t pt-5 text-sm"><p>Responsável pelo Operum: Vinícius Tavares Mota.</p><a href="mailto:vinicius.mota2@aluno.cps.sp.gov.br" className="mt-2 inline-block break-all">vinicius.mota2@aluno.cps.sp.gov.br</a></footer>
    </GlassCard>
  </main></ProjectAppearance>
}
