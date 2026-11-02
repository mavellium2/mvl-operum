'use client'

import GlassButton from './GlassButton'
import './Switch.css'

export default function Switch({ label, checked, onCheckedChange, disabled = false, compact = false }: {
  label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; compact?: boolean
}) {
  return <GlassButton variant="custom" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)} className={`glass-switch ${compact ? 'glass-switch--compact' : ''}`}>
    {!compact && <span className="glass-switch-label">{label}</span>}
    <span className="glass-switch-track" aria-hidden="true"><span className="glass-switch-thumb" /></span>
  </GlassButton>
}
