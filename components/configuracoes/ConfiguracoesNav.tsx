'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserRound, ShieldCheck, Landmark, Plug, PenLine } from 'lucide-react'

const GROUPS = [
  {
    label: 'Conta',
    items: [
      { href: '/configuracoes/perfil', label: 'Perfil', Icon: UserRound },
      { href: '/configuracoes/assinatura', label: 'Assinatura', Icon: PenLine },
      { href: '/configuracoes/seguranca', label: 'Segurança', Icon: ShieldCheck },
      { href: '/configuracoes/instituicoes', label: 'Instituições', Icon: Landmark },
    ],
  },
  {
    label: 'Conexões',
    items: [
      { href: '/configuracoes/integracoes', label: 'Integrações', Icon: Plug },
    ],
  },
]

/** Navegação por seções da tela de Configurações: coluna no desktop, abas roláveis no celular. */
export default function ConfiguracoesNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Seções das configurações" className="md:w-52 md:shrink-0">
      <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
        {GROUPS.map(group => (
          <div key={group.label} className="flex gap-1 md:flex-col">
            <p className="hidden md:block px-3 pb-1 text-xs font-medium text-gray-400">{group.label}</p>
            {group.items.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
