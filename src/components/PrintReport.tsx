import { useState } from 'react'
import { useApp } from '../ctx'
import type { SourceRef, Status } from '../types'
import { atLabel, critLabel, makeT, scopeLabel, stLabel, typeLabel, vLabel } from '../i18n'
import { activeReqs, computeScore, impactOf, r0, r1 } from '../lib/scoring'
import { reqCondition } from '../lib/units'
import { fmtDate, fmtDateTime } from '../lib/text'
import { ST_HEX } from './ui'

const STATUSES: Status[] = ['ok', 'partial', 'unconfirmed', 'fail', 'review']
const V_COLOR = { ready: '#15803d', needs_work: '#b45309', risk: '#b91c1c' }

/** Печатный отчёт (PDF через window.print). Язык — «язык отчёта» из настроек. */
export function PrintReport() {
  const { project, participant, settings } = useApp()
  const [printedAt] = useState(() => new Date().toISOString())
  const t = makeT(settings.reportLang)
  const part = participant && Object.keys(participant.matches).length ? participant : undefined
  const sc = part ? computeScore(project, part, settings) : null
  const reqs = activeReqs(project)
  const ref = (s?: SourceRef) => (s ? `${s.fileName}, ${t('pages')} ${s.page}${s.clause ? ', ' + s.clause : ''}` : '—')
  const plan = part
    ? reqs
        .map((r) => ({ r, m: part.matches[r.id] }))
        .filter(({ m }) => m && m.status !== 'ok' && m.recommendation)
        .map(({ r, m }) => ({ r, m: m!, rec: m!.recommendation!, impact: impactOf(project, part, r.id, settings) }))
        .sort((a, b) => Number(!(a.r.type === 'mandatory' && a.rec.criticality === 'high')) - Number(!(b.r.type === 'mandatory' && b.rec.criticality === 'high')) || b.impact - a.impact)
    : []
  const th = 'border border-slate-300 bg-slate-100 px-1.5 py-1 text-left font-semibold'
  const td = 'border border-slate-300 px-1.5 py-1 align-top'
  const h2 = 'mb-2 mt-5 border-b border-slate-300 pb-1 text-[14px] font-bold'

  return (
    <div className="print-report bg-white p-6 text-[11px] leading-snug text-black" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-2">
        <div>
          <div className="text-[18px] font-bold">{t('reportTitle')}</div>
          <div className="text-[12px]">{t('appName')} — {t('tagline')}</div>
        </div>
        <div className="text-right text-[10px] text-slate-600">
          {t('generatedAt')}: {fmtDateTime(printedAt)}
          {project.isDemo && <div className="font-bold">{t('demoBadge')}</div>}
        </div>
      </div>

      <table className="mt-3 w-full">
        <tbody>
          <tr><td className="w-40 py-0.5 text-slate-600">{t('lot')}</td><td className="py-0.5 font-semibold">{project.lotNumber} «{project.name}»</td></tr>
          <tr><td className="py-0.5 text-slate-600">{t('customer')}</td><td className="py-0.5">{project.customer || '—'}</td></tr>
          <tr><td className="py-0.5 text-slate-600">{t('deadline')}</td><td className="py-0.5">{fmtDate(project.deadline)}</td></tr>
          {part && <tr><td className="py-0.5 text-slate-600">{t('participant')}</td><td className="py-0.5 font-semibold">{part.name}{part.inn ? ` (${t('inn')} ${part.inn})` : ''}</td></tr>}
        </tbody>
      </table>

      {sc && part && (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="rounded border-2 border-slate-800 px-4 py-2">
              <div className="text-[10px] text-slate-600">{t('compliance')}</div>
              <div className="text-[24px] font-bold leading-tight">{r1(sc.score)}%</div>
              {sc.counts.review > 0 && <div className="text-[9px] text-slate-600">{r0(sc.scoreMin)}–{r0(sc.scoreMax)}%</div>}
            </div>
            <div className="rounded border-2 px-4 py-2" style={{ borderColor: V_COLOR[sc.verdict], color: V_COLOR[sc.verdict] }}>
              <div className="text-[10px]">{t('verdict')}</div>
              <div className="text-[16px] font-bold leading-tight">{vLabel(t, sc.verdict)}</div>
            </div>
            <div className="rounded border border-slate-300 px-4 py-2">
              <div>{t('scope_product')}: <b>{r1(sc.product)}%</b> · {t('scope_participant')}: <b>{r1(sc.participant)}%</b></div>
              <div>{t('mandatory')}: <b>{sc.mandatoryOk} {t('of')} {sc.mandatoryTotal}</b> · {t('problemItems')}: <b>{sc.problems}</b></div>
              <div className="mt-0.5 flex flex-wrap gap-x-3">
                {STATUSES.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: ST_HEX[s] }} />
                    {stLabel(t, s)}: {sc.counts[s]}
                  </span>
                ))}
              </div>
              {sc.forecast > sc.score && <div className="mt-0.5">{t('forecast')} — {t('willBe')} <b>{r1(sc.forecast)}%</b></div>}
            </div>
          </div>

          {part.analysis && (
            <>
              <h2 className={h2}>{t('analysis')}</h2>
              <p className="whitespace-pre-wrap">{part.analysis.summary}</p>
              <div className="mt-2 grid grid-cols-2 gap-4">
                {part.analysis.strengths.length > 0 && (
                  <div>
                    <div className="font-semibold">{t('strengths')}</div>
                    <ul className="list-disc pl-4">{part.analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {part.analysis.risks.length > 0 && (
                  <div>
                    <div className="font-semibold">{t('risks')}</div>
                    <ul className="list-disc pl-4">{part.analysis.risks.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
              </div>
            </>
          )}

          <h2 className={h2}>{t('requirement')} ↔ {t('application')}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('id')}</th>
                <th className={th}>{t('requirement')}</th>
                <th className={th}>{t('type')}</th>
                <th className={th}>{t('application')}</th>
                <th className={th}>{t('status')}</th>
                <th className={th}>{t('source')}</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => {
                const m = part.matches[r.id]
                const st = m?.status ?? 'fail'
                return (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className={`${td} whitespace-nowrap font-mono`}>{r.id}</td>
                    <td className={td}>
                      {r.parameter} {reqCondition(r)}
                      <div className="text-[9px] text-slate-500">{scopeLabel(t, r.scope)} · {r.category}</div>
                    </td>
                    <td className={td}>{typeLabel(t, r.type)}</td>
                    <td className={td}>{m?.claimed || t('notFound')}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ST_HEX[st] }} />
                      {stLabel(t, st)}
                      {m?.method === 'manual' && <div className="text-[9px] text-slate-500">✎ {t('method_manual')}</div>}
                    </td>
                    <td className={`${td} text-[9px]`}>
                      <div>{t('docsSide')}: {ref(r.source)}</div>
                      <div>{t('appSide')}: {ref(m?.source)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h2 className={h2}>{t('actionPlan')}</h2>
          {plan.length ? (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('id')}</th>
                  <th className={th}>{t('whatsWrong')}</th>
                  <th className={th}>{t('action')}</th>
                  <th className={th}>{t('actionType')}</th>
                  <th className={th}>{t('criticality')}</th>
                  <th className={th}>{t('impact')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(({ r, rec, impact }) => (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className={`${td} whitespace-nowrap font-mono`}>{rec.done ? '☑' : '☐'} {r.id}</td>
                    <td className={td}>{rec.problem}</td>
                    <td className={`${td} font-semibold`}>{rec.action}</td>
                    <td className={td}>{atLabel(t, rec.actionType)}</td>
                    <td className={td}>{critLabel(t, rec.criticality)}</td>
                    <td className={`${td} whitespace-nowrap font-semibold`}>{impact > 0 ? `+${impact}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{t('noPlan')}</p>
          )}

          {part.contradictions.length > 0 && (
            <>
              <h2 className={h2}>{t('contradictions')}</h2>
              <ul className="list-disc space-y-1 pl-4">
                {part.contradictions.map((c, i) => (
                  <li key={i}>
                    {c.text}
                    <div className="text-[9px] text-slate-600">{c.sources.map(ref).join('; ')}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {project.questions.length > 0 && (
        <>
          <h2 className={h2}>{t('questionsToCustomer')}</h2>
          <ol className="list-decimal space-y-1 pl-5">
            {project.questions.map((q) => (
              <li key={q.id}>
                {q.text}
                {q.sources.map((s, i) => (
                  <div key={i} className="text-[9px] text-slate-600">{ref(s)}: «{s.quote}»</div>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="mt-6 border-t border-slate-300 pt-2 text-[10px] italic text-slate-600">{t('disclaimer')}</p>
    </div>
  )
}
