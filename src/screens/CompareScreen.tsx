import { useMemo, useState } from 'react'
import { useApp } from '../ctx'
import type { Match, Requirement, Scope, Status } from '../types'
import { atLabel, critLabel, scopeLabel, stLabel, typeLabel } from '../i18n'
import { activeReqs, computeScore, impactOf, r0 } from '../lib/scoring'
import { reqCondition } from '../lib/units'
import { askChat } from '../lib/pipeline'
import { exportJson, exportXlsx } from '../lib/export'
import { hasAI } from '../lib/settings'
import { fmtDate, fmtDateTime } from '../lib/text'
import { Btn, Card, Chip, Empty, Icon, Modal, Stat, StatusBadge, ST_DOT, V_CLS } from '../components/ui'
import { ParticipantPicker, QuoteCard } from '../components/Common'

const STATUSES: Status[] = ['ok', 'partial', 'unconfirmed', 'fail', 'review']
const TONE: Record<Status, 'green' | 'amber' | 'red' | 'slate'> = { ok: 'green', partial: 'amber', unconfirmed: 'amber', fail: 'red', review: 'slate' }
const CRIT_CLS = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-100 text-slate-700' }

/** Пункт, выбранный по ссылке #/p/<id>/compare?r=<reqId> (из матрицы участников) */
const reqFromHash = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('r')

function EditMatch({ r, m, mode, onClose }: { r: Requirement; m: Match; mode: 'status' | 'comment'; onClose: () => void }) {
  const { t, update, participant } = useApp()
  const [status, setStatus] = useState<Status>(m.status)
  const [comment, setComment] = useState(mode === 'comment' ? (m.manualComment ?? '') : '')
  const save = () => {
    if (!participant) return
    const pid = participant.id
    const text = comment.trim()
    const patch: Partial<Match> = mode === 'status' ? { status, method: 'manual', manualComment: text || m.manualComment } : { manualComment: text || undefined }
    const log =
      mode === 'status'
        ? `${participant.name}: ${r.id} ${stLabel(t, m.status)} → ${stLabel(t, status)} (${t('manualChange').toLowerCase()})${text ? `: ${text}` : ''}`
        : `${participant.name}: ${r.id} — ${t('comment').toLowerCase()}: ${text || '—'}`
    update((p) => ({ ...p, participants: p.participants.map((x) => (x.id === pid ? { ...x, matches: { ...x.matches, [r.id]: { ...x.matches[r.id], ...patch } } } : x)) }), log)
    onClose()
  }
  return (
    <Modal title={`${mode === 'status' ? t('changeStatus') : t('comment')} · ${r.id}`} onClose={onClose} closeLabel={t('close')}>
      <div className="space-y-3">
        <div className="text-sm text-slate-700">{r.parameter} {reqCondition(r)}</div>
        {mode === 'status' && (
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`rounded-full ring-offset-1 ${status === s ? 'ring-2 ring-blue-500' : ''}`}>
                <StatusBadge s={s} t={t} />
              </button>
            ))}
          </div>
        )}
        <textarea autoFocus className="h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder={t('commentPlaceholder')} value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>{t('cancel')}</Btn>
          <Btn kind="primary" onClick={save} disabled={mode === 'status' && status === m.status && !comment.trim()}>{t('save')}</Btn>
        </div>
      </div>
    </Modal>
  )
}

function Chat() {
  const { t, project, participant, settings, update, openSettings } = useApp()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ai = hasAI(settings)
  const send = async () => {
    const question = q.trim()
    if (!question || busy) return
    const history = project.chat
    setQ('')
    setErr('')
    setBusy(true)
    update((p) => ({ ...p, chat: [...p.chat, { role: 'user', text: question, at: new Date().toISOString() }] }))
    try {
      const answer = await askChat(project, participant, question, history, settings)
      update((p) => ({ ...p, chat: [...p.chat, { role: 'assistant', text: answer, at: new Date().toISOString() }] }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm text-slate-600"><Icon name="message" /> {t('askAi')}</div>
      {project.chat.length > 0 ? (
        <div className="mb-2 max-h-72 space-y-2 overflow-y-auto">
          {project.chat.map((c, i) => (
            <div key={i} className={`flex ${c.role === 'user' ? 'justify-end' : ''}`}>
              <div className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${c.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`} title={fmtDateTime(c.at)}>
                {c.text}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-slate-500">{t('working')}</div>}
        </div>
      ) : (
        <div className="mb-2 text-xs text-slate-500">{t('chatEmpty')}</div>
      )}
      {err && <div className="mb-2 flex items-center gap-1 text-xs text-red-700"><Icon name="alert" className="h-3.5 w-3.5" /> {t('error')}: {err}</div>}
      {ai ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder={t('askPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} />
          <Btn kind="primary" type="submit" disabled={busy || !q.trim()}>{t('send')}</Btn>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Icon name="key" className="h-4 w-4 text-amber-600" /> {t('needKey')}
          <Btn onClick={openSettings} icon="settings" className="ml-auto">{t('settings')}</Btn>
        </div>
      )}
    </div>
  )
}

function ExportMenu() {
  const { t, project, participant, settings, printReport } = useApp()
  const [open, setOpen] = useState(false)
  const item = 'flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50'
  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="relative">
      <Btn icon="download" onClick={() => setOpen(!open)}>{t('exportReport')}</Btn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <button className={item} onClick={pick(printReport)}><Icon name="printer" /> {t('exportPdf')}</button>
            <button className={item} onClick={pick(() => exportXlsx(project, t, settings))}><Icon name="file" /> {t('exportXlsx')}</button>
            <button className={item} onClick={pick(() => exportJson(project, participant))}><Icon name="file" /> {t('exportJson')}</button>
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ r, m }: { r: Requirement; m: Match }) {
  const { t, project, participant, settings, update } = useApp()
  const [edit, setEdit] = useState<'status' | 'comment' | null>(null)
  const rec = m.recommendation
  const impact = participant && m.status !== 'ok' ? impactOf(project, participant, r.id, settings) : 0
  const restore = () => {
    if (!participant) return
    const pid = participant.id
    update(
      (p) => ({
        ...p,
        participants: p.participants.map((x) => (x.id === pid ? { ...x, matches: { ...x.matches, [r.id]: { ...x.matches[r.id], status: m.aiStatus, method: m.ruleNote ? 'rule' : 'llm' } } } : x)),
      }),
      `${participant.name}: ${r.id} ${stLabel(t, m.status)} → ${stLabel(t, m.aiStatus)} (${t('restoreAi').toLowerCase()})`,
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-slate-500">{r.id} · {scopeLabel(t, r.scope)} · {r.category}{r.lotItem ? ` · ${r.lotItem}` : ''}</div>
          <div className="font-semibold">{r.parameter} {reqCondition(r)}</div>
          <div className="text-xs text-slate-500">
            {typeLabel(t, r.type)}{r.points ? ` · ${r.points}` : ''}
            {r.proof && ` · ${t('proof')}: ${r.proof}`}
          </div>
        </div>
        <StatusBadge s={m.status} t={t} />
      </div>
      {(r.changeNote || r.restrictive) && (
        <div className="space-y-1 text-xs">
          {r.changeNote && <div className="flex gap-1.5 rounded bg-sky-50 px-2 py-1 text-sky-800"><Icon name="edit" className="mt-px h-3.5 w-3.5 shrink-0" /> {t('changedByAmendment')}: {r.changeNote}</div>}
          {r.restrictive && <div className="flex gap-1.5 rounded bg-violet-50 px-2 py-1 text-violet-800"><Icon name="flag" className="mt-px h-3.5 w-3.5 shrink-0" /> {t('restrictive')}: {r.restrictive}</div>}
        </div>
      )}

      <QuoteCard title={t('docsSide')} src={r.source} tone="blue" />
      <QuoteCard title={t('appSide')} src={m.source} tone={TONE[m.status]} />

      <div>
        <div className="mb-1 text-xs text-slate-500">{t('rationale')} · {t('recommendation')}</div>
        <Card className="space-y-3 p-3 text-sm">
          <p className="whitespace-pre-wrap text-slate-800">{m.rationale || '—'}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{t('method')}: <b className="font-medium text-slate-700">{t(`method_${m.method}`)}</b></span>
            {m.ruleNote && <span className="font-mono text-slate-700">{m.ruleNote}</span>}
            <span className={m.confidence < settings.reviewThreshold ? 'text-orange-700' : ''}>{t('confidence')}: {m.confidence}%</span>
            <span className={m.confirmedByDoc ? 'text-green-700' : 'text-orange-700'}>{m.confirmedByDoc ? `✓ ${t('confirmedDoc')}` : `○ ${t('claimedOnly')}`}</span>
            {m.validUntil && <span>{t('validUntil')} {fmtDate(m.validUntil)}</span>}
            {m.exceeds && <span className="text-green-700">↑ {t('exceeds')}</span>}
            {m.method === 'manual' && m.aiStatus !== m.status && (
              <span>
                {t('aiStatus')}: {stLabel(t, m.aiStatus)} ·{' '}
                <button className="text-blue-700 hover:underline" onClick={restore}>{t('restoreAi')}</button>
              </span>
            )}
          </div>
          {m.manualComment && <div className="flex gap-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700"><Icon name="edit" className="mt-px h-3.5 w-3.5 shrink-0" /> {m.manualComment}</div>}
          {rec && m.status !== 'ok' && (
            <div className={`space-y-1.5 border-t border-slate-100 pt-3 ${rec.done ? 'opacity-60' : ''}`}>
              {rec.problem && <div className="text-slate-700"><span className="text-xs text-slate-500">{t('whatsWrong')}: </span>{rec.problem}</div>}
              <div className="font-semibold text-slate-900">→ {rec.action}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">{atLabel(t, rec.actionType)}</span>
                <span className={`rounded px-1.5 py-0.5 ${CRIT_CLS[rec.criticality]}`}>{t('criticality')}: {critLabel(t, rec.criticality)}</span>
                {impact > 0 && <span className="rounded bg-green-50 px-1.5 py-0.5 font-semibold text-green-800">{t('impact')}: +{impact}%</span>}
                {rec.done && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">{t('done')}</span>}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Btn icon="edit" onClick={() => setEdit('status')}>{t('changeStatus')}</Btn>
        <Btn icon="message" onClick={() => setEdit('comment')}>{t('comment')}</Btn>
      </div>
      {edit && <EditMatch key={edit} r={r} m={m} mode={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

export function CompareScreen() {
  const { t, project, participant, settings, go } = useApp()
  const [scope, setScope] = useState<'all' | Scope>('all')
  const [problems, setProblems] = useState(false)
  const [status, setStatus] = useState<'all' | Status>('all')
  const [sel, setSel] = useState<string | null>(reqFromHash)
  /** На телефоне детали пункта открываются в модальном окне */
  const [sheet, setSheet] = useState(false)

  const hasMatches = !!participant && Object.keys(participant.matches).length > 0
  const rows = useMemo(() => (participant ? activeReqs(project).map((r) => ({ r, m: participant.matches[r.id] as Match | undefined })) : []), [project, participant])
  const score = useMemo(() => (participant && hasMatches ? computeScore(project, participant, settings) : null), [project, participant, settings, hasMatches])

  const lotLine = (
    <div className="text-sm text-slate-600">
      {t('lot')} {project.lotNumber} «{project.name}»{project.deadline && ` · ${t('deadline').toLowerCase()} ${fmtDate(project.deadline)}`}
    </div>
  )

  if (!participant || !hasMatches || !score)
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">{lotLine}<ParticipantPicker /></div>
        <Empty icon="compare" action={<Btn kind="primary" icon="upload" onClick={() => go('upload')}>{t('tab_upload')}</Btn>}>{t('noMatches')}</Empty>
      </div>
    )

  const list = rows.filter(
    ({ r, m }) =>
      (scope === 'all' || r.scope === scope) &&
      (!problems || m?.status !== 'ok') &&
      (status === 'all' || (m?.status ?? 'fail') === status),
  )
  const cur = list.find((x) => x.r.id === sel) ?? list[0]
  const select = (id: string) => {
    setSel(id)
    setSheet(window.matchMedia('(max-width: 1023px)').matches)
  }
  const allActive = scope === 'all' && !problems && status === 'all'
  const range = score.counts.review > 0 && r0(score.scoreMin) !== r0(score.scoreMax)

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lotLine}
        <ParticipantPicker />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('compliance')}
          value={`${r0(score.score)}%`}
          sub={range ? <span title={t('rangeReview')}>{r0(score.scoreMin)}–{r0(score.scoreMax)}% · {t('rangeReview')}</span> : undefined}
          cls="border-blue-500 bg-blue-50"
        />
        <Stat label={t('mandatory')} value={`${score.mandatoryOk} ${t('of')} ${score.mandatoryTotal}`} />
        <Stat
          label={t('problemItems')}
          value={score.problems}
          sub={
            <span className="flex flex-wrap gap-2">
              {STATUSES.filter((s) => s !== 'ok' && score.counts[s]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1" title={stLabel(t, s)}>
                  <span className={`h-2 w-2 rounded-full ${ST_DOT[s]}`} />
                  {score.counts[s]}
                </span>
              ))}
            </span>
          }
        />
        <Stat label={t('verdict')} value={<span className="text-lg">{t(`v_${score.verdict}`)}</span>} cls={V_CLS[score.verdict]} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip
          count={rows.length}
          active={allActive}
          onClick={() => {
            setScope('all')
            setProblems(false)
            setStatus('all')
          }}
        >
          {t('all')}
        </Chip>
        <Chip active={problems} onClick={() => setProblems(!problems)} count={score.problems}>{t('onlyProblems')}</Chip>
        <Chip active={scope === 'product'} onClick={() => setScope(scope === 'product' ? 'all' : 'product')}>{t('scope_product')}</Chip>
        <Chip active={scope === 'participant'} onClick={() => setScope(scope === 'participant' ? 'all' : 'participant')}>{t('scope_participant')}</Chip>
        <select className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')}>
          <option value="all">{t('status')}: {t('all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{stLabel(t, s)} ({score.counts[s]})</option>)}
        </select>
        <div className="ml-auto"><ExportMenu /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('id')}</th>
                  <th className="px-3 py-2">{t('requirement')}</th>
                  <th className="px-3 py-2">{t('application')}</th>
                  <th className="px-3 py-2 text-center">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ r, m }) => {
                  const on = cur?.r.id === r.id
                  return (
                    <tr
                      key={r.id}
                      onClick={() => select(r.id)}
                      className={`cursor-pointer border-b border-slate-100 align-top ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className={`whitespace-nowrap border-l-4 px-3 py-2.5 font-mono text-xs text-slate-500 ${on ? 'border-l-blue-600' : 'border-l-transparent'}`}>{r.id}</td>
                      <td className="px-3 py-2.5">
                        <div className={on ? 'font-semibold' : ''}>
                          {r.parameter} <span className="whitespace-nowrap">{reqCondition(r)}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {typeLabel(t, r.type)}{r.lotItem ? ` · ${r.lotItem}` : ''}
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 ${on ? 'font-semibold' : ''} ${m?.claimed ? '' : 'text-slate-400'}`}>{m?.claimed || t('notFound')}</td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge s={m?.status ?? 'fail'} t={t} small />
                        {m?.method === 'manual' && <div className="mt-0.5 text-[10px] text-slate-500">{t('method_manual')}</div>}
                      </td>
                    </tr>
                  )
                })}
                {!list.length && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">—</td></tr>
                )}
              </tbody>
            </table>
          </Card>
          <div className="text-sm text-slate-500">{t('shown')} {list.length} {t('of')} {rows.length}</div>
          <Chat />
        </div>

        <div className="hidden min-w-0 lg:sticky lg:top-4 lg:block lg:self-start">
          {cur?.m ? (
            <Detail key={cur.r.id} r={cur.r} m={cur.m} />
          ) : cur ? (
            <div className="space-y-4">
              <QuoteCard title={t('docsSide')} src={cur.r.source} tone="blue" />
              <QuoteCard title={t('appSide')} tone="red" />
            </div>
          ) : (
            <Empty>{t('selectItem')}</Empty>
          )}
        </div>
      </div>
      {sheet && cur?.m && (
        <Modal title={`${cur.r.id} · ${stLabel(t, cur.m.status)}`} onClose={() => setSheet(false)} closeLabel={t('close')} wide>
          <Detail key={cur.r.id} r={cur.r} m={cur.m} />
        </Modal>
      )}
    </div>
  )
}
