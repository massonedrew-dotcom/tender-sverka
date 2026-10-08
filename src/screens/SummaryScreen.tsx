import { useMemo, useState } from 'react'
import { useApp } from '../ctx'
import type { Participant, Status } from '../types'
import { atLabel, critLabel, scopeLabel, stLabel } from '../i18n'
import { activeReqs, computeScore, impactOf, r0, r1 } from '../lib/scoring'
import { reqCondition } from '../lib/units'
import { makeAnalysis, makeClarification } from '../lib/pipeline'
import { exportDocx } from '../lib/export'
import { hasAI } from '../lib/settings'
import { fmtDate, fmtDateTime } from '../lib/text'
import { Bar, Btn, Card, Empty, Icon, PageHeader, ST_DOT, ST_HEX, StatusBadge, VerdictBadge, scoreColor } from '../components/ui'
import { ParticipantPicker, SourceLink } from '../components/Common'

const STATUSES: Status[] = ['ok', 'partial', 'unconfirmed', 'fail', 'review']
const CRIT_CLS = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-100 text-slate-700' }
const CRIT_ORDER = { high: 0, medium: 1, low: 2 }

function Clarification() {
  const { t, project, settings, update, run, job } = useApp()
  const [draft, setDraft] = useState(project.clarificationDraft ?? '')
  const busy = !!job && !job.error
  const ai = hasAI(settings)
  const generate = () =>
    run(async (progress) => {
      progress('stage_analysis', t('clarification'))
      const text = await makeClarification(project, settings)
      setDraft(text)
      update((p) => ({ ...p, clarificationDraft: text }), `${t('clarification')}: ${t('generate').toLowerCase()}`)
    })
  const persist = () => {
    if (draft !== (project.clarificationDraft ?? '')) update((p) => ({ ...p, clarificationDraft: draft }))
  }
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold"><Icon name="message" className="h-4 w-4 text-slate-500" /> {t('clarification')}</h2>
        <span className="text-xs text-slate-500">{t('questionsToCustomer')}: {project.questions.length}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn icon="sparkles" disabled={busy || !ai} onClick={generate} title={ai ? undefined : t('needKey')}>{draft ? t('regenerate') : t('generate')}</Btn>
          <Btn kind="primary" icon="download" disabled={!draft.trim()} onClick={() => exportDocx(project, draft)}>{t('exportDocx')}</Btn>
        </div>
      </div>
      {!draft && <p className="mb-2 text-xs text-slate-500">{t('clarificationEmpty')}</p>}
      <textarea
        className="h-72 w-full rounded-lg border border-slate-300 p-3 font-serif text-sm leading-relaxed"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={persist}
      />
    </Card>
  )
}

function ParticipantSummary({ part }: { part: Participant }) {
  const { t, project, settings, update, run, job, openSettings } = useApp()
  const busy = !!job && !job.error
  const ai = hasAI(settings)
  const score = useMemo(() => computeScore(project, part, settings), [project, part, settings])

  const plan = useMemo(() => {
    return activeReqs(project)
      .map((r) => ({ r, m: part.matches[r.id] }))
      .filter(({ m }) => m && m.status !== 'ok' && m.recommendation)
      .map(({ r, m }) => ({ r, m: m!, rec: m!.recommendation!, impact: impactOf(project, part, r.id, settings) }))
      .sort((a, b) => {
        const ca = a.r.type === 'mandatory' && a.rec.criticality === 'high' ? 0 : 1
        const cb = b.r.type === 'mandatory' && b.rec.criticality === 'high' ? 0 : 1
        return ca - cb || b.impact - a.impact || CRIT_ORDER[a.rec.criticality] - CRIT_ORDER[b.rec.criticality]
      })
  }, [project, part, settings])

  const strengths = part.analysis?.strengths.length
    ? part.analysis.strengths
    : activeReqs(project).filter((r) => part.matches[r.id]?.exceeds).map((r) => `${r.id}: ${r.parameter} — ${part.matches[r.id].claimed}`)
  const risks = part.analysis?.risks.length ? part.analysis.risks : [...part.contradictions.map((c) => c.text), ...project.questions.map((q) => q.text)]
  const doneCount = plan.filter((x) => x.rec.done).length

  const analyze = () =>
    run(async (progress) => {
      progress('stage_analysis', part.name)
      const analysis = await makeAnalysis(project, part, settings)
      update((p) => ({ ...p, participants: p.participants.map((x) => (x.id === part.id ? { ...x, analysis } : x)) }), `${part.name}: ${t('analysis').toLowerCase()}`)
    })

  const toggle = (reqId: string, done: boolean) =>
    update(
      (p) => ({
        ...p,
        participants: p.participants.map((x) => {
          if (x.id !== part.id) return x
          const m = x.matches[reqId]
          if (!m?.recommendation) return x
          return { ...x, matches: { ...x.matches, [reqId]: { ...m, recommendation: { ...m.recommendation, done } } } }
        }),
      }),
      `${part.name}: ${reqId} — ${t('done').toLowerCase()} ${done ? '✓' : '✗'}`,
    )

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs text-slate-500">{t('overall')}</div>
          <div className="mt-1 text-5xl font-bold leading-none">{r1(score.score)}%</div>
          {score.counts.review > 0 && <div className="mt-1 text-xs text-slate-500">{r0(score.scoreMin)}–{r0(score.scoreMax)}% · {t('rangeReview')}</div>}
          <div className="mt-4 space-y-2 text-sm">
            {([['scope_product', score.product], ['scope_participant', score.participant]] as const).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between"><span>{t(k)}</span><b>{r1(v)}%</b></div>
                <Bar value={v} cls={scoreColor(v)} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <VerdictBadge v={score.verdict} t={t} large />
            <span className="text-xs text-slate-500">{t('mandatory')}: <b className="text-slate-800">{score.mandatoryOk} {t('of')} {score.mandatoryTotal}</b></span>
          </div>
          {score.forecast > score.score && (
            <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-900">
              {t('forecast')} — {t('willBe')} <b>{r1(score.forecast)}%</b>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('byCategory')}</h2>
          <div className="space-y-2.5">
            {score.byCategory.map((c) => (
              <div key={c.category} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate" title={c.category}>{c.category} <span className="text-xs text-slate-400">({c.total})</span></span>
                  <b>{r0(c.score)}%</b>
                </div>
                <Bar value={c.score} cls={scoreColor(c.score)} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('byStatus')}</h2>
          <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t('byStatus')}>
            {STATUSES.map((s) => score.counts[s] > 0 && (
              <div key={s} title={`${stLabel(t, s)}: ${score.counts[s]}`} style={{ width: `${(score.counts[s] / score.total) * 100}%`, background: ST_HEX[s] }} />
            ))}
          </div>
          <ul className="space-y-2 text-sm">
            {STATUSES.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${ST_DOT[s]}`} />
                <span className="flex-1">{stLabel(t, s)}</span>
                <b>{score.counts[s]}</b>
              </li>
            ))}
            <li className="flex items-center gap-2 border-t border-slate-100 pt-2 text-slate-500">
              <span className="flex-1">{t('all')}</span>
              <b>{score.total}</b>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{t('analysis')}</h2>
          {part.analysis && <span className="text-xs text-slate-400">{t('generatedAt')} {fmtDateTime(part.analysis.generatedAt)}</span>}
          <div className="ml-auto flex items-center gap-2">
            {!ai && <button className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline" onClick={openSettings}><Icon name="key" className="h-3.5 w-3.5" /> {t('needKey')}</button>}
            <Btn icon="sparkles" disabled={busy || !ai} onClick={analyze}>{part.analysis ? t('regenerate') : t('generate')}</Btn>
          </div>
        </div>
        {part.analysis ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{part.analysis.summary}</p> : <p className="text-sm text-slate-500">—</p>}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-green-800"><Icon name="check" /> {t('strengths')}</h2>
          {strengths.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p className="text-sm text-slate-500">—</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-red-800"><Icon name="alert" /> {t('risks')}</h2>
          {risks.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">{risks.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p className="text-sm text-slate-500">—</p>}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h2 className="font-semibold">{t('actionPlan')}</h2>
          <span className="text-xs text-slate-500">{t('todo')}: {doneCount} / {plan.length} {t('done').toLowerCase()}</span>
        </div>
        {!plan.length && <p className="text-sm text-slate-500">{t('noPlan')}</p>}
        <ul className="divide-y divide-slate-100">
          {plan.map(({ r, m, rec, impact }) => (
            <li key={r.id} className={`flex gap-3 py-3 ${rec.done ? 'opacity-55' : ''}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-blue-600" checked={!!rec.done} onChange={(e) => toggle(r.id, e.target.checked)} title={t('done')} />
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{r.id}</span>
                  <span className={`font-medium ${rec.done ? 'line-through' : ''}`}>{r.parameter} {reqCondition(r)}</span>
                  <StatusBadge s={m.status} t={t} small />
                </div>
                {rec.problem && <div className="text-slate-600"><span className="text-xs text-slate-400">{t('whatsWrong')}: </span>{rec.problem}</div>}
                <div className="font-semibold text-slate-900">→ {rec.action}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">{atLabel(t, rec.actionType)}</span>
                  <span className={`rounded px-1.5 py-0.5 ${CRIT_CLS[rec.criticality]}`}>{critLabel(t, rec.criticality)}</span>
                  {r.type === 'mandatory' && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{t('type_mandatory')}</span>}
                  <span className="mx-1 text-slate-300">|</span>
                  <SourceLink src={r.source} />
                  {m.source && <><span className="text-slate-300">·</span><SourceLink src={m.source} /></>}
                </div>
              </div>
              <div className={`shrink-0 text-right text-sm font-bold ${impact > 0 ? 'text-green-700' : 'text-slate-400'}`} title={t('impact')}>{impact > 0 ? `+${impact}%` : '—'}</div>
            </li>
          ))}
        </ul>
      </Card>

      {part.contradictions.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-1.5 font-semibold"><Icon name="compare" className="h-4 w-4 text-orange-600" /> {t('contradictions')} ({part.contradictions.length})</h2>
          <ul className="space-y-3">
            {part.contradictions.map((c, i) => (
              <li key={i} className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 text-sm">
                {c.text}
                <div className="mt-1 space-y-0.5">
                  {c.sources.map((s, j) => (
                    <div key={j} className="text-xs text-slate-600"><SourceLink src={s} />: «{s.quote}»</div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {part.facts.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer px-5 py-4 font-semibold">{t('facts')} ({part.facts.length})</summary>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2">{t('category')}</th>
                    <th className="px-4 py-2">{t('parameter')}</th>
                    <th className="px-4 py-2">{t('application')}</th>
                    <th className="px-4 py-2">{t('source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {part.facts.map((f, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-2 text-xs text-slate-500">{scopeLabel(t, f.scope)} · {f.category}</td>
                      <td className="px-4 py-2">{f.parameter}</td>
                      <td className="px-4 py-2 font-medium">{f.value}</td>
                      <td className="px-4 py-2"><SourceLink src={f.source} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}
    </>
  )
}

export function SummaryScreen() {
  const { t, project, participant, go, printReport } = useApp()
  const hasMatches = !!participant && Object.keys(participant.matches).length > 0
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <PageHeader
        title={t('tab_summary')}
        subtitle={<>{t('lot')} {project.lotNumber} «{project.name}»{project.deadline && ` · ${t('deadline').toLowerCase()} ${fmtDate(project.deadline)}`}</>}
        actions={<><ParticipantPicker />{hasMatches && <Btn icon="printer" onClick={printReport}>{t('exportPdf')}</Btn>}</>}
      />

      {participant && hasMatches ? (
        <ParticipantSummary key={participant.id} part={participant} />
      ) : (
        <Empty icon="gauge" action={<Btn kind="primary" icon="upload" onClick={() => go('upload')}>{t('tab_upload')}</Btn>}>{t('noMatches')}</Empty>
      )}

      <Clarification />

      <p className="text-center text-xs text-slate-500">{t('disclaimer')}</p>
    </div>
  )
}
