'use client'

import GlassButton from '@/components/ui/GlassButton'

import { useEffect, useRef, useState } from 'react'

export default function AnimatedTrashButton({ label, disabled, onDelete }: {
  label: string; disabled?: boolean; onDelete: () => void
}) {
  const [opening, setOpening] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const suction = useRef<Animation | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); suction.current?.cancel() }, [])
  function activate() {
    if (disabled || opening) return
    setOpening(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timer.current = setTimeout(() => {
      const row = button.current?.closest('tr')
      const position = button.current?.getBoundingClientRect()
      let distortionSvg: SVGSVGElement | null = null
      let floatingIcon: HTMLDivElement | null = null
      let floatingLid: SVGGElement | null = null
      if (!reduced && position && row) {
        const svg = button.current?.querySelector('svg')?.cloneNode(true) as SVGSVGElement | undefined
        if (svg) {
          floatingIcon = document.createElement('div')
          floatingIcon.setAttribute('aria-hidden', 'true')
          Object.assign(floatingIcon.style, {
            position: 'fixed', left: `${position.left}px`, top: `${position.top}px`,
            width: `${position.width}px`, height: `${position.height}px`, padding: '8px',
            color: '#f3bdcf', filter: 'drop-shadow(0 0 5px #e5b4f2)',
            pointerEvents: 'none', zIndex: '10000',
          })
          floatingIcon.append(svg)
          document.body.append(floatingIcon)
          floatingLid = svg.querySelector('.trash-lid')
          if (floatingLid) {
            floatingLid.style.transformOrigin = '18px 6px'
            floatingLid.style.transform = 'translateY(-7px) rotate(0deg)'
          }
          const bounds = row.getBoundingClientRect()
          row.style.transformOrigin = `${position.left + position.width / 2 - bounds.left}px ${position.top + 10 - bounds.top}px`
        }
      }
      const flash = () => {
        if (reduced || !position) return
        const star = document.createElement('span')
        star.setAttribute('aria-hidden', 'true')
        Object.assign(star.style, {
          position: 'fixed', left: `${position.left + position.width / 2 - 10}px`, top: `${position.top + position.height / 2 - 10}px`,
          width: '20px', height: '20px', pointerEvents: 'none', zIndex: '10000',
          background: 'radial-gradient(circle, #fff 0%, #e9d5ff 20%, #b998f8 48%, transparent 72%)',
          clipPath: 'polygon(50% 0%, 60% 38%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0% 50%, 40% 38%)',
          filter: 'drop-shadow(0 0 5px #c4a2ff)',
        })
        document.body.append(star)
        const glint = star.animate([
          { opacity: 0, transform: 'scale(.2) rotate(0deg)' },
          { opacity: 1, transform: 'scale(1.3) rotate(30deg)', offset: .25 },
          { opacity: 0, transform: 'scale(.1) rotate(80deg)' },
        ], { duration: 500, easing: 'ease-out' })
        glint.onfinish = () => star.remove()
        glint.oncancel = () => star.remove()
      }
      const finish = () => {
        distortionSvg?.remove()
        floatingIcon?.remove()
        flash()
        onDelete()
        if (row) row.style.transformOrigin = ''
        suction.current?.cancel()
        suction.current = null
        setOpening(false)
        timer.current = null
      }
      if (!reduced && row) {
        const ns = 'http://www.w3.org/2000/svg'
        distortionSvg = document.createElementNS(ns, 'svg')
        distortionSvg.setAttribute('width', '0')
        distortionSvg.setAttribute('height', '0')
        distortionSvg.setAttribute('aria-hidden', 'true')
        distortionSvg.style.position = 'absolute'
        const filter = document.createElementNS(ns, 'filter')
        const filterId = `phase-suction-${Math.random().toString(36).slice(2)}`
        filter.id = filterId
        filter.setAttribute('x', '-30%'); filter.setAttribute('y', '-100%')
        filter.setAttribute('width', '160%'); filter.setAttribute('height', '300%')
        const wave = document.createElementNS(ns, 'feTurbulence')
        wave.setAttribute('type', 'fractalNoise'); wave.setAttribute('baseFrequency', '.008 .035')
        wave.setAttribute('numOctaves', '1'); wave.setAttribute('seed', '4'); wave.setAttribute('result', 'wave')
        const bend = document.createElementNS(ns, 'feDisplacementMap')
        bend.setAttribute('in', 'SourceGraphic'); bend.setAttribute('in2', 'wave')
        bend.setAttribute('scale', '0'); bend.setAttribute('xChannelSelector', 'R'); bend.setAttribute('yChannelSelector', 'G')
        const deform = document.createElementNS(ns, 'animate')
        deform.setAttribute('attributeName', 'scale'); deform.setAttribute('values', '0;12;55;100;30')
        deform.setAttribute('dur', '.58s'); deform.setAttribute('fill', 'freeze')
        bend.append(deform); filter.append(wave, bend); distortionSvg.append(filter)
        document.body.append(distortionSvg)
        // Traços convergem para a abertura e desaparecem junto da sucção.
        const bounds = row.getBoundingClientRect()
        if (position) {
          const targetX = position.left + position.width / 2
          const targetY = position.top + 10
          for (let index = 0; index < 7; index++) {
            const trail = document.createElement('span')
            trail.setAttribute('aria-hidden', 'true')
            const startX = bounds.left + bounds.width * (.18 + index * .09)
            const startY = bounds.top + bounds.height * (index % 2 ? .25 : .8)
            const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI
            Object.assign(trail.style, {
              position: 'fixed', left: `${startX}px`, top: `${startY}px`,
              width: `${18 + index % 3 * 9}px`, height: '1px', borderRadius: '999px',
              background: 'linear-gradient(90deg, transparent, #cfbcff99)',
              pointerEvents: 'none', zIndex: '9999', opacity: '0', transformOrigin: 'right center',
            })
            document.body.append(trail)
            const motion = trail.animate([
              { transform: `rotate(${angle}deg) scaleX(.4)`, opacity: 0 },
              { transform: `translate(${(targetX - startX) * .3}px, ${(targetY - startY) * .3}px) rotate(${angle}deg) scaleX(1.4)`, opacity: .7, offset: .4 },
              { transform: `translate(${targetX - startX}px, ${targetY - startY}px) rotate(${angle}deg) scaleX(.1)`, opacity: 0 },
            ], { duration: 330, delay: 70 + index * 25, easing: 'cubic-bezier(.55, 0, .85, .4)' })
            motion.onfinish = () => trail.remove()
            motion.oncancel = () => trail.remove()
          }
        }
        const animation = row.animate([
          { transform: 'scale(1, 1)', opacity: 1, filter: `url(#${filterId})`, offset: 0 },
          { transform: 'scale(.9, .92)', opacity: 1, filter: `url(#${filterId})`, offset: .22 },
          { transform: 'scale(.5, .65)', opacity: 1, filter: `url(#${filterId})`, offset: .55 },
          { transform: 'scale(.09, .2)', opacity: .8, filter: `url(#${filterId})`, offset: .85 },
          { transform: 'scale(0, 0)', opacity: 0, filter: `url(#${filterId})`, offset: 1 },
        ], { duration: 580, easing: 'cubic-bezier(.45, 0, .8, .35)', fill: 'forwards' })
        suction.current = animation
        animation.oncancel = () => { floatingIcon?.remove(); distortionSvg?.remove() }
        animation.onfinish = () => {
          if (!floatingLid) { finish(); return }
          const close = floatingLid.animate([
            { transform: 'translateY(-7px) rotate(0deg)' },
            { transform: 'translateY(0) rotate(0deg)' },
          ], { duration: 160, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' })
          close.onfinish = finish
          close.oncancel = () => floatingIcon?.remove()
        }
      } else finish()
    }, reduced ? 0 : 140)
  }
  return <GlassButton variant="custom" ref={button} type="button" aria-label={label} disabled={disabled} aria-busy={opening} onClick={activate}
    data-opening={opening} className="animated-trash mt-0.5 rounded-lg p-2 text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-30">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <g className="trash-lid"><path d="M3 6h18" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></g>
      <path d="m5 6 1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7" />
    </svg>
  </GlassButton>
}
