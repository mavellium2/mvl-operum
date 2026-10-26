/** Manual dates take precedence; automatic dates follow the actual completion movement. */
export function dataRealizacaoEfetiva(p: { dataRealizacao?: string | null; dataRealizacaoCard?: string | null }): string | null {
  return p.dataRealizacao ?? p.dataRealizacaoCard ?? null
}
export function diaConclusaoCard(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
