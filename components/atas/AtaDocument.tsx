'use client'

import { forwardRef } from 'react'
import {
  ATA_ASSINATURAS_POR_LINHA, ATA_ESPACO_MM, ATA_LOGO_MM, ATA_RODAPE, ataAssinantes, ataComUmaLinhaVazia, ataCopias, ataData, ataNumero, ataPessoa,
  type AtaExportData,
} from '@/lib/exports/ataDocx'

/**
 * Prévia/PDF da Ata no layout do modelo "01_Form Ata de Reunião" (mesmas regras
 * do Word em lib/exports/ataDocx.ts).
 */

const BORDA = '1px solid #000'
const CINZA = '#bfbfbf'
const CINZA_CLARO = '#e7e6e6'
const td: React.CSSProperties = { border: BORDA, padding: '2px 5px', verticalAlign: 'top', fontSize: '9pt', lineHeight: 1.3, whiteSpace: 'pre-wrap' }
const tabela: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }
const B = ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>

export default forwardRef<HTMLDivElement, { data: AtaExportData }>(function AtaDocument({ data: d }, ref) {
  const presentes = ataComUmaLinhaVazia(d.presentes, p => !!p.nome?.trim(), { nome: '', setorEmpresa: null })
  const acoes = ataComUmaLinhaVazia(d.acoes, a => !!a.acao?.trim(), { acao: '', prazo: null, responsavel: null })
  const caixas = ataCopias(d.copiasPara)
  const assinantes = ataAssinantes(d.presentes)
  const espaco = `${ATA_ESPACO_MM}mm`
  return (
    <div
      ref={ref}
      data-print-sheet
      style={{ width: '210mm', minHeight: '297mm', padding: '12mm 15mm', boxSizing: 'border-box', background: 'white', color: 'black', fontFamily: 'Calibri, Carlito, Arial, sans-serif', fontSize: '9pt', position: 'relative' }}
    >
      {/* Logo + título */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: espaco }}>
        <div style={{ width: `${ATA_LOGO_MM}mm`, height: '19mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: d.logoUrl ? 'none' : '1px solid #4a6fa5', background: d.logoUrl ? 'transparent' : '#9db7e0' }}>
          {d.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={d.logoUrl} alt="Logo" style={{ maxHeight: '19mm', maxWidth: '33mm', objectFit: 'contain' }} />
            : <span style={{ fontSize: '12pt', textAlign: 'center', lineHeight: 1.15 }}>Logo do<br />Projeto</span>}
        </div>
        <h1 data-testid="ata-titulo" style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: '14pt', fontWeight: 'bold' }}>
          Ata de Reunião Nº {ataNumero(d.numero)}
        </h1>
        {/* Mesma largura da logo do outro lado: o nº fica no centro da página. */}
        <div aria-hidden="true" style={{ width: `${ATA_LOGO_MM}mm`, flexShrink: 0 }} />
      </div>

      {/* Quadro: identificação, presentes, assuntos, decisões */}
      <table style={tabela}>
        <colgroup><col style={{ width: '75%' }} /><col style={{ width: '25%' }} /></colgroup>
        <tbody>
          <tr><td colSpan={2} style={{ ...td, background: CINZA, fontWeight: 'bold' }}>{d.instituicao}</td></tr>
          <tr><td colSpan={2} style={td}><B>Nome do projeto:</B> {d.nomeProjeto}</td></tr>
          <tr><td style={td}><B>Local:</B> {d.local}</td><td style={td}><B>Data:</B> {ataData(d.data)}</td></tr>
          <tr><td colSpan={2} style={td}><B>Elaborado por:</B> {ataPessoa(d.elaboradoPor, d.elaboradoPorFuncao)}</td></tr>
          <tr><td colSpan={2} style={td}><B>Aprovado por:</B> {ataPessoa(d.aprovadoPor, d.aprovadoPorFuncao)}</td></tr>
          <tr><td colSpan={2} style={{ ...td, background: CINZA, fontWeight: 'bold' }}>I. Relação dos presentes</td></tr>
          <tr><td style={{ ...td, fontWeight: 'bold' }}>Nome:</td><td style={{ ...td, fontWeight: 'bold' }}>Setor/Empresa:</td></tr>
          {presentes.map((p, i) => <tr key={i}><td style={{ ...td, height: '1.4em' }}>{p.nome}</td><td style={td}>{p.setorEmpresa}</td></tr>)}
          <tr><td colSpan={2} style={{ ...td, background: CINZA, fontWeight: 'bold' }}>II. Assuntos tratados</td></tr>
          <tr><td colSpan={2} style={{ ...td, height: '22mm' }}>{d.assuntosTratados}</td></tr>
          <tr><td colSpan={2} style={{ ...td, background: CINZA, fontWeight: 'bold' }}>III. Decisões tomadas</td></tr>
          <tr><td colSpan={2} style={{ ...td, height: '22mm' }}>{d.decisoesTomadas}</td></tr>
        </tbody>
      </table>

      {/* IV. Ações */}
      <table style={{ ...tabela, marginTop: -1 }}>
        <colgroup><col style={{ width: '57%' }} /><col style={{ width: '19%' }} /><col style={{ width: '24%' }} /></colgroup>
        <tbody>
          <tr>
            <td style={{ ...td, background: CINZA, fontWeight: 'bold' }}>IV. Ações a serem empreendidas</td>
            <td style={{ ...td, background: CINZA, fontWeight: 'bold' }}>Prazo</td>
            <td style={{ ...td, background: CINZA, fontWeight: 'bold' }}>Responsável</td>
          </tr>
          {acoes.map((a, i) => <tr key={i}><td style={{ ...td, height: '1.4em' }}>{a.acao}</td><td style={td}>{a.prazo ? ataData(a.prazo) : ''}</td><td style={td}>{a.responsavel}</td></tr>)}
        </tbody>
      </table>

      {/* Documentos anexos */}
      <div style={{ ...td, display: 'block', background: CINZA_CLARO, marginTop: espaco, minHeight: '10mm' }}>
        <B>Documentos anexos:</B>
        {d.anexos.length > 0 && <div>{d.anexos.map(a => `${a.nome}${a.url ? ` — ${a.url}` : ''}`).join('\n')}</div>}
      </div>

      {/* Enviar cópias para */}
      <div style={{ ...td, display: 'block', background: CINZA_CLARO, marginTop: espaco }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: 8 }}>
          <div><B>Enviar cópias para:</B></div>
          {caixas.map((c, i) => <div key={i}>{c.marcado ? '☒' : '☐'} {c.texto}</div>)}
        </div>
      </div>

      {/* Assinaturas + Obs */}
      <table style={{ ...tabela, marginTop: espaco }}>
        <tbody>
          <tr><td style={{ ...td, background: CINZA }}><B>Assinaturas</B> &lt;principais envolvidos&gt;</td></tr>
          <tr>
            <td style={{ ...td, background: CINZA_CLARO, height: '21mm' }}>
              {/* Mesma grade do Word: assinatura cadastrada (ou espaço para assinar), linha e nome. */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ATA_ASSINATURAS_POR_LINHA}, 1fr)`, gap: '4mm 8mm', paddingTop: '2mm' }}>
                {assinantes.map((p, i) => (
                  <div key={i} data-testid="ata-assinatura" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <div style={{ height: '12mm', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {p.assinaturaUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.assinaturaUrl} alt={`Assinatura de ${p.nome}`} style={{ maxHeight: '12mm', maxWidth: '40mm', objectFit: 'contain' }} />
                        : null}
                    </div>
                    <div style={{ borderTop: BORDA, paddingTop: 2, textAlign: 'center', width: '100%' }}>{p.nome}</div>
                  </div>
                ))}
              </div>
            </td>
          </tr>
          <tr><td style={{ ...td, height: '16mm' }}><B>Obs:</B> {d.observacoes}</td></tr>
        </tbody>
      </table>
      <div style={{ fontSize: '7pt', marginTop: 4, marginLeft: '10mm' }}>{ATA_RODAPE}</div>
    </div>
  )
})
