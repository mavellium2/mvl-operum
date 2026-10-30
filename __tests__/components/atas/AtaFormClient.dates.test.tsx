import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AtaFormClient from '@/components/atas/AtaFormClient'
import { ToastProvider } from '@/components/ui/Toast'
import { atualizarAtaAction } from '@/app/actions/atas'
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}))
vi.mock('@/app/actions/atas',()=>({ atualizarAtaAction:vi.fn(async()=>({success:true})),criarAtaAction:vi.fn() }))
vi.mock('@/components/permissoes/ProjectPermissions',()=>({ useProjectPermissions:()=>new Set(['documentos:editar']) }))
vi.mock('@/components/projetos/documentacao/HistoricoDocumento',()=>({ default:()=>null }))
vi.mock('@/components/atas/MemberSelect',()=>({default:()=>null}))
vi.mock('react-to-print',()=>({useReactToPrint:()=>vi.fn()}))
afterEach(()=>vi.unstubAllEnvs())
it('editar e salvar datas ISO existentes preserva reunião e prazo sem RangeError ou mudança pelo fuso',async()=>{
  vi.stubEnv('TZ','America/Sao_Paulo')
  render(<ToastProvider><AtaFormClient projetoId="project1" ataId="ata1" mode="edit" members={[]} initial={{ data:'2026-10-05T00:00:00.000Z', elaboradoPor:'Autor', copiasPara:[], presentes:[], anexos:[], acoes:[{acao:'Entregar',prazo:'2026-10-10T00:00:00.000Z',responsavel:'Autor',responsavelUserId:''}] }} /></ToastProvider>)
  expect(screen.getByDisplayValue('05/10/2026')).toBeInTheDocument()
  expect(screen.getByDisplayValue('10/10/2026')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Salvar versão (Ctrl+S)'}))
  await waitFor(()=>expect(atualizarAtaAction).toHaveBeenCalledWith('ata1','project1',expect.objectContaining({data:'2026-10-05T00:00:00.000Z',acoes:[expect.objectContaining({prazo:'2026-10-10T00:00:00.000Z'})]})))
})
it('número da ata é automático: na ata nova mostra o próximo número, sem campo para digitar', () => {
  render(<ToastProvider><AtaFormClient projetoId="project1" mode="create" numero={4} members={[]} /></ToastProvider>)
  const titulo = screen.getAllByTestId('ata-titulo')[0]
  expect(titulo).toHaveTextContent('Ata de Reunião Nº 04')
  expect(titulo.querySelector('input, textarea')).toBeNull()
  expect(titulo.querySelector('[role="tooltip"], svg')).toBeNull()
  expect(titulo).not.toHaveTextContent('Automático:')
})
