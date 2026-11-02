import type { ReactNode } from 'react'
import { Landmark } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import './InstitutionCard.css'

export function InstitutionIcon() {
  return <span className="institution-item-icon" aria-hidden="true"><Landmark size={23} strokeWidth={1.5} /></span>
}
export default function InstitutionCard({ children, current = false, suspended = false }: { children: ReactNode; current?: boolean; suspended?: boolean }) {
  return <GlassCard interactive as="div" className="institution-item p-4 sm:p-5" data-current={current} data-suspended={suspended || undefined}>{children}</GlassCard>
}
