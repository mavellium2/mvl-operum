'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { UserRound, ShieldCheck, Landmark, Plug, PenLine, Palette } from 'lucide-react'

const GROUPS = [
  {
    label: 'Conta',
    items: [
      { href: '/configuracoes/aparencia', label: 'Aparência', Icon: Palette },
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
  const router = useRouter()
  const leaving = useRef(false)
  const animations = useRef<Animation[]>([])
  useEffect(() => {
    leaving.current = false
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
    return () => { leaving.current = false; animations.current.forEach(animation => animation.cancel()) }
  }, [pathname])

  async function navigate(href: string, event: { preventDefault(): void }) {
    if (href === pathname) return
    const cards = document.querySelectorAll<HTMLElement>('#settings-content .settings-appearance-option')
    if (!cards.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    event.preventDefault()
    if (leaving.current) return
    leaving.current = true
    router.prefetch(href)
    animations.current = Array.from(cards, (card, index) => card.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(-8px) scale(.985)' },
    ], { duration: 210, delay: (cards.length - 1 - index) * 18, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }))
    await Promise.allSettled(animations.current.map(animation => animation.finished))
    if (leaving.current) router.push(href)
  }

  return (
    <nav aria-label="Seções das configurações" className="settings-nav vidro w-full rounded-[22px] p-3 md:sticky md:top-6 md:w-52 md:shrink-0">
      <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
        {GROUPS.map(group => (
          <div key={group.label} className="flex gap-1 md:flex-col">
            <p className="settings-nav-group hidden md:block px-3 pb-2 text-xs font-medium text-gray-400">{group.label}</p>
            {group.items.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  onNavigate={event => { void navigate(href, event) }}
                  aria-current={active ? 'page' : undefined}
                  className={`settings-nav-link flex items-center gap-2.5 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="settings-nav-icon"><Icon aria-hidden="true" className="w-4 h-4 shrink-0" /></span>
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
