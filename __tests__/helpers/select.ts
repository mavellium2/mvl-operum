import { fireEvent, screen, within } from '@testing-library/react'

/**
 * Escolhe uma opção no Select do sistema (components/ui/Select): abre pelo
 * combobox e clica na opção pelo texto. Substitui o `selectOptions` do
 * <select> nativo nos testes.
 */
export function escolherOpcao(combobox: HTMLElement, opcao: string | RegExp) {
  fireEvent.click(combobox)
  const lista = screen.getByRole('listbox')
  fireEvent.click(within(lista).getByRole('option', { name: opcao }))
}

/** Rótulos das opções do Select (abre e fecha a lista). */
export function opcoesDo(combobox: HTMLElement): string[] {
  fireEvent.click(combobox)
  const nomes = within(screen.getByRole('listbox')).queryAllByRole('option').map(o => o.textContent ?? '')
  fireEvent.click(combobox)
  return nomes
}
