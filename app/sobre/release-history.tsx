import ReleaseHistoryBrowser from './release-history-browser'
import GlassCard from '@/components/ui/GlassCard'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compareVersions, parseReleaseNotes, type ReleaseItem, type ReleaseNotes } from '@/lib/release-notes'

function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="break-words rounded bg-gray-100 px-1 text-xs">{part.slice(1, -1)}</code>
    return part
  })
}

function Items({ items }: { items: ReleaseItem[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-600">
      {items.map((item, index) => (
        <li key={index}>
          <InlineText text={item.text} />
          {item.children.length > 0 && <div className="mt-2"><Items items={item.children} /></div>}
        </li>
      ))}
    </ul>
  )
}

function ReleaseContent({ release }: { release: ReleaseNotes }) {
  return (
    <div className="space-y-4">
      {release.sections.map((section, index) => (
        <div key={index}>
          {section.title && <h4 className="mb-2 text-sm font-semibold text-gray-900">{section.title}</h4>}
          <Items items={section.items} />
        </div>
      ))}
    </div>
  )
}

function ReleaseLabel({ label }: { label: string }) {
  return <span>{label.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')}</span>
}

export function ReleaseHistory({ version }: { version: string }) {
  const releases = parseReleaseNotes(readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8'))
  const current = releases.find(release => release.version === version)
  if (!current) throw new Error(`CHANGELOG.md não contém a versão atual ${version}`)
  const previous = releases.filter(release => compareVersions(release.version, version) < 0)
    .sort((a, b) => compareVersions(b.version, a.version))

  const entries = [current, ...previous].map(release => {
    const dates = release.label.match(/\d{4}-\d{2}-\d{2}/g) ?? []
    const flatten = (items: ReleaseItem[]): string => items.map(item => `${item.text} ${flatten(item.children)}`).join(' ')
    const search = `${release.version} ${release.label} ${release.sections.map(section => `${section.title ?? ''} ${flatten(section.items)}`).join(' ')}`
    return {
      version: release.version, start: dates[0] ?? '', end: dates.at(-1) ?? '', search, current: release.version === version,
      content: release.version === version ? <GlassCard as="article" interactive className="about-card p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-gray-900">Versão {release.version}</h3><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Versão atual</span><p className="w-full text-sm text-gray-500"><ReleaseLabel label={release.label} /></p></div>
        <ReleaseContent release={release} />
      </GlassCard> : <details className="about-release group rounded-2xl border">
        <summary className="cursor-pointer rounded-2xl px-4 py-3.5 text-sm font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-blue-600">Versão {release.version}<span className="ml-2 font-normal text-gray-500"><ReleaseLabel label={release.label} /></span></summary>
        <div className="border-t border-gray-100 px-5 pb-5 pt-4"><ReleaseContent release={release} /></div>
      </details>,
    }
  })
  return <ReleaseHistoryBrowser entries={entries} />
}
