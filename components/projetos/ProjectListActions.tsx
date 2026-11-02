'use client'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import AnimatedEditButton from '@/components/ui/AnimatedEditButton'
export function NewProjectButton() {
  const router = useRouter()
  return <GlassButton variant="primary" onClick={() => router.push('/projetos/novo')}><Plus size={17} aria-hidden="true" />Novo projeto</GlassButton>
}
export function EditProjectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  return <AnimatedEditButton label={`Editar projeto ${name}`} onClick={() => router.push(`/projetos/${id}/configuracoes`)} />
}
