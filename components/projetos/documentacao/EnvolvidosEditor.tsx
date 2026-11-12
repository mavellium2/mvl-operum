'use client'

import GrupoEnvolvidos, { EnvolvidosLayout } from './GrupoEnvolvidos'
import { useState } from 'react'
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import { Input } from '@/components/ui/Field'
import { lerEnvolvidos, gravarEnvolvidos, type BlocoEnvolvidos } from '@/lib/charterEnvolvidos'

export default function EnvolvidosEditor({ value, membros, onChange }: { value: string; membros: string[]; onChange: (value: string) => void }) {
  const blocks = lerEnvolvidos(value)
  const [personFocus, setPersonFocus] = useState<string | null>(null)
  const [newIndex, setNewIndex] = useState<number | null>(null)
  const update = (index: number, patch: Partial<BlocoEnvolvidos>) => onChange(gravarEnvolvidos(blocks.map((block, i) => i === index ? { ...block, ...patch } : block)))
  const move = (index: number, delta: number) => {
    const next = [...blocks]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    setNewIndex(null)
    onChange(gravarEnvolvidos(next))
  }
  const removeBlock = (index: number) => {
    setNewIndex(null)
    setPersonFocus(null)
    onChange(gravarEnvolvidos(blocks.filter((_, i) => i !== index)))
  }
  const removePerson = (index: number, personIndex: number) => {
    const people = blocks[index].texto.split('\n')
    people.splice(personIndex, 1)
    const focus = `${index}:${Math.max(0, personIndex - 1)}`
    setPersonFocus(focus)
    update(index, { texto: people.join('\n') })
    requestAnimationFrame(() => Array.from(document.querySelectorAll<HTMLInputElement>(`[data-envolvido="${focus}"]`)).find(input => !input.closest('[data-medicao]'))?.focus())
  }
  return <EnvolvidosLayout>
    {blocks.map((block, index) => <GrupoEnvolvidos key={index} titulo={block.equipe ? <strong >Integrantes do Grupo:</strong> : <>
        <strong className="hidden print:block" >{block.titulo}:</strong>
        <Input autoFocus={newIndex === index} aria-label={`Título do grupo ${index + 1}`} value={block.titulo} placeholder="Digite o título" maxLength={200}
          onChange={event => update(index, { titulo: event.target.value })}
          onKeyDown={event => { if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) { event.preventDefault(); event.stopPropagation(); setPersonFocus(`${index}:0`); Array.from(document.querySelectorAll<HTMLInputElement>(`[data-envolvido="${index}:0"]`)).find(input => !input.closest('[data-medicao]'))?.focus() } }}
          className="w-full min-w-0 border-0 bg-transparent px-0 py-0 font-bold print:hidden" style={{ font: 'inherit', fontWeight: 'bold', height: '1.25em', minHeight: 0, lineHeight: 1.25, padding: 0 }} />
      </>} controles={<span className="inline-flex print:hidden">
        <GlassButton variant="custom" type="button" disabled={index === 0} aria-label={`Mover ${block.titulo || 'título'} para cima`} onClick={() => move(index, -1)} className="rounded p-1 disabled:opacity-30"><ArrowUp size={14} /></GlassButton>
        <GlassButton variant="custom" type="button" disabled={index === blocks.length - 1} aria-label={`Mover ${block.titulo || 'título'} para baixo`} onClick={() => move(index, 1)} className="rounded p-1 disabled:opacity-30"><ArrowDown size={14} /></GlassButton>
        {/* "Integrantes do Grupo" vem da equipe do projeto e não sai; os títulos criados podem ser excluídos (com as pessoas deles). */}
        {!block.equipe && <GlassButton variant="custom" type="button" aria-label={`Excluir o título ${block.titulo || 'sem nome'} e as pessoas dele`} title="Excluir título"
          onClick={() => removeBlock(index)} className="rounded p-1 text-[var(--ap-muted)]"><Trash2 size={14} aria-hidden="true" /></GlassButton>}
      </span>}>
      <div className="min-w-0">
        {block.equipe ? membros.map((member, i) => <p key={i} className="flex gap-1" style={{ margin: 0 }}><span aria-hidden="true">-</span><span>{member}</span></p>) :
          (block.texto.split('\n')).map((person, personIndex, people) => <div key={personIndex} className="flex items-start gap-1">
            <span aria-hidden="true">-</span>
            <Input data-envolvido={`${index}:${personIndex}`} autoFocus={personFocus === `${index}:${personIndex}`}
              aria-label={`Pessoa ${personIndex + 1} de ${block.titulo || 'novo título'}`} value={person.replace(/^\s*-\s?/, '')} placeholder="Digite uma pessoa" maxLength={2000}
              onChange={event => update(index, { texto: people.map((p, i) => i === personIndex ? event.target.value : p).join('\n') })}
              onKeyDown={event => { if (event.key === 'Backspace' && !person.trim() && people.length > 1) { event.preventDefault(); removePerson(index, personIndex); return } if (event.key === 'Enter') { event.preventDefault(); const next = [...people]; next.splice(personIndex + 1, 0, ''); setPersonFocus(`${index}:${personIndex + 1}`); update(index, { texto: next.join('\n') }); requestAnimationFrame(() => Array.from(document.querySelectorAll<HTMLInputElement>(`[data-envolvido="${index}:${personIndex + 1}"]`)).find(input => !input.closest('[data-medicao]'))?.focus()) } }}
              className="w-full min-w-0 border-0 bg-transparent px-0 py-0 print:hidden" style={{ font: 'inherit', height: '1.25em', minHeight: 0, lineHeight: 1.25, padding: 0, margin: 0 }} />
            <GlassButton variant="custom" type="button" onClick={() => removePerson(index, personIndex)}
              aria-label={`Remover pessoa ${personIndex + 1} de ${block.titulo || 'novo título'}`} title="Remover pessoa"
              className="shrink-0 rounded p-0.5 text-[var(--ap-muted)] print:hidden"><Trash2 size={13} aria-hidden="true" /></GlassButton>
            <span className="hidden print:block">{person.replace(/^\s*-\s?/, '')}</span>
          </div>)}
      </div>

    </GrupoEnvolvidos>)}
    <GlassButton variant="ghost" type="button" onClick={() => { setNewIndex(blocks.length); onChange(gravarEnvolvidos([...blocks, { titulo: '', texto: '' }])) }} className="glass-button--small print:hidden"><Plus size={14} strokeWidth={1.75} aria-hidden="true" />Adicionar título</GlassButton>
  </EnvolvidosLayout>
}
