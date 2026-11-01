'use client'

import { forwardRef, type ComponentPropsWithoutRef } from 'react'

/** Base visual única. Campos especializados mantêm máscaras e validação sobre esta base. */
export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(function Input({ className = '', ...props }, ref) {
  return <input {...props} ref={ref} className={`operum-field ${className}`} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(function Textarea({ className = '', ...props }, ref) {
  return <textarea {...props} ref={ref} className={`operum-field ${className}`} />
})
/** Para seletores nativos existentes. Novos seletores usam o componente Select. */
export const NativeSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(function NativeSelect({ className = '', ...props }, ref) {
  return <select {...props} ref={ref} className={`operum-field ${className}`} />
})

/** Campos compostos (ex.: múltiplas escolhas) compartilham o mesmo foco externo. */
export const FieldGroup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function FieldGroup({ className = '', ...props }, ref) {
  return <div {...props} ref={ref} className={`operum-field-group ${className}`} />
})
