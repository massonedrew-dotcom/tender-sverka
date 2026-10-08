import { useApp } from '../ctx'
import type { SourceRef } from '../types'
import { highlightRange } from '../lib/text'
import { Highlighted } from './ui'

export function ParticipantPicker() {
  const { project, participant, setParticipant } = useApp()
  if (project.participants.length < 2) return participant ? <span className="text-sm font-medium text-slate-700">{participant.name}</span> : null
  return (
    <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium" value={participant?.id} onChange={(e) => setParticipant(e.target.value)}>
      {project.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

export function SourceLink({ src }: { src?: SourceRef }) {
  const { openDoc, t } = useApp()
  if (!src) return <span className="text-slate-400">—</span>
  return (
    <button className="text-left text-xs text-blue-700 hover:underline" onClick={() => openDoc(src.fileId, src.fileName, src.page, src.quote)}>
      {src.fileName}, {t('pages')} {src.page}
      {src.clause ? `, ${src.clause}` : ''}
    </button>
  )
}

/** Карточка цитаты из источника с контекстом страницы (как на макете экрана «Сравнение»). */
export function QuoteCard({ title, src, tone }: { title: string; src?: SourceRef; tone: 'blue' | 'red' | 'green' | 'amber' | 'slate' }) {
  const { project, participant, openDoc, t } = useApp()
  const toneCls = { blue: 'bg-blue-100', red: 'bg-red-100', green: 'bg-green-100', amber: 'bg-amber-100', slate: 'bg-slate-100' }[tone]
  if (!src)
    return (
      <div>
        <div className="mb-1 text-xs text-slate-500">{title}</div>
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">{t('notFound')}</div>
      </div>
    )
  // сначала текущий участник (для поиска по имени файла), затем остальные — цитаты работают в матрице и отчёте
  const files = [...project.customerFiles, ...(participant?.files ?? []), ...project.participants.filter((x) => x.id !== participant?.id).flatMap((x) => x.files)]
  const file = files.find((f) => f.id === src.fileId) ?? files.find((f) => f.name === src.fileName)
  const page = file?.pages.find((p) => p.n === src.page)
  let snippet: { text: string; range: [number, number] | null } | null = null
  if (page) {
    const r = highlightRange(page.text, src.quote)
    if (r) {
      const a = Math.max(0, r[0] - 140)
      const b = Math.min(page.text.length, r[1] + 140)
      snippet = { text: (a > 0 ? '…' : '') + page.text.slice(a, b) + (b < page.text.length ? '…' : ''), range: [r[0] - a + (a > 0 ? 1 : 0), r[1] - a + (a > 0 ? 1 : 0)] }
    }
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        <span>{title} ·</span>
        <button className="text-blue-700 hover:underline" onClick={() => openDoc(src.fileId, src.fileName, src.page, src.quote)}>
          {src.fileName}, {t('pages')} {src.page}{src.clause ? `, ${src.clause}` : ''}
        </button>
      </div>
      <div className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-[13px] leading-relaxed hover:border-blue-300" onClick={() => openDoc(src.fileId, src.fileName, src.page, src.quote)}>
        {snippet ? (
          <div className="whitespace-pre-wrap text-slate-500 [&_mark]:text-slate-900">
            <Highlighted text={snippet.text} range={snippet.range} />
          </div>
        ) : (
          <div className={`rounded px-2 py-1 ${toneCls}`}>«{src.quote}»</div>
        )}
        {src.translation && <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">↳ {src.translation}</div>}
      </div>
    </div>
  )
}
