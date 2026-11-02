'use client'

import { usePathname, useRouter } from 'next/navigation'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import { hrefCadastros, SECOES_CADASTROS, type SecaoCadastros } from '@/lib/cadastrosSecoes'

/** Permanece montado no layout para a lente animar entre as rotas. */
export default function CadastrosNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const section: SecaoCadastros = pathname.endsWith('/funcoes') ? 'funcoes' : 'departamentos'
  return <GlassSegmentedControl<SecaoCadastros> label="Seções de cadastros" value={section} onChange={value => router.push(hrefCadastros(value))} options={SECOES_CADASTROS.map(value => ({ value, label: value === 'departamentos' ? 'Departamentos' : 'Funções' }))} className="catalog-nav" />
}
