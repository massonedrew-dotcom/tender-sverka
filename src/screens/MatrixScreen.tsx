import { useMemo, useState } from 'react'
import { useApp } from '../ctx'
import { stLabel, typeLabel } from '../i18n'
import { activeReqs, computeScore, r0 } from '../lib/scoring'
import { reqCondition } from '../lib/units'
import { fmtDate } from '../lib/text'
import { Btn, Card, Chip, Empty, PageHeader, ST_CLS, ST_DOT, VerdictBadge, scoreColor } from '../components/ui'

export function MatrixScreen() {
  const { t, project, settings, setParticipant, go } = useApp()
  const [onlyDiffs, setOnlyDiffs] = useState(false)
  const parts = project.participants
  const reqs = useMemo(() => activeReqs(project), [project])
  const scores = useMemo(() => parts.map((x) => (Object.keys(x.matches).length ? computeScore(project, x, settings) : null)), [project, parts, settings])

  if (!parts.length)
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Empty icon="users" action={<Btn kind="primary" icon="upload" onClick={() => go('upload')}>{t('tab_upload')}</Btn>}>{t('noParticipants')}</Empty>
      </div>
    )

  const rows = onlyDiffs ? reqs.filter((r) => parts.some((x, i) => scores[i] && x.matches[r.id]?.status !== 'ok')) : reqs
  const open = (partId: string, reqId: string) => {
    setParticipant(partId)
    window.location.assign(`#/p/${encodeURIComponent(project.id)}/compare?r=${encodeURIComponent(reqId)}`)
  }
  const sticky = 'sticky left-0 z-[1] bg-white'

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <PageHeader
        title={t('matrixTitle')}
        subtitle={<>{t('lot')} {project.lotNumber} «{project.name}»{project.deadline && ` · ${t('deadline').toLowerCase()} ${fmtDate(project.deadline)}`}</>}
        actions={
          <>
            <Chip active={!onlyDiffs} onClick={() => setOnlyDiffs(false)} count={reqs.length}>{t('all')}</Chip>
            <Chip active={onlyDiffs} onClick={() => setOnlyDiffs(true)}>{t('onlyDiffs')}</Chip>
          </>
        }
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 320 + parts.length * 200 }}>
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className={`${sticky} w-72 px-3 py-2`}>{t('requirement')}</th>
              {parts.map((x, i) => (
                <th key={x.id} className="px-3 py-2 align-bottom">
                  <div className="font-semibold text-slate-800">{x.name}</div>
                  {scores[i] && <div className="font-normal">{t('compliance')}: <b>{r0(scores[i].score)}%</b></div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top">
                <td className={`${sticky} px-3 py-2`}>
                  <div><span className="font-mono text-xs text-slate-500">{r.id}</span> {r.parameter} <span className="whitespace-nowrap font-medium">{reqCondition(r)}</span></div>
                  <div className="text-[11px] text-slate-400">{typeLabel(t, r.type)}</div>
                </td>
                {parts.map((x) => {
                  const m = x.matches[r.id]
                  if (!m) return <td key={x.id} className="px-3 py-2 text-xs text-slate-400">{t('notChecked')}</td>
                  return (
                    <td key={x.id} className="px-2 py-1.5">
                      <button
                        className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition hover:shadow ${ST_CLS[m.status]}`}
                        title={`${stLabel(t, m.status)}: ${m.rationale}`}
                        onClick={() => open(x.id, r.id)}
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ST_DOT[m.status]}`} />
                        <span className="line-clamp-2">{m.claimed || t('notFound')}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm">
            <tr>
              <td className={`${sticky} bg-slate-50 px-3 py-2 font-semibold`}>{t('compliance')}</td>
              {scores.map((s, i) => (
                <td key={parts[i].id} className="px-3 py-2">
                  {s ? (
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${scoreColor(s.score)}`} />
                      <b>{r0(s.score)}%</b>
                      {s.counts.review > 0 && <span className="text-xs text-slate-500">({r0(s.scoreMin)}–{r0(s.scoreMax)}%)</span>}
                    </div>
                  ) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className={`${sticky} bg-slate-50 px-3 py-2 font-semibold`}>{t('mandatory')}</td>
              {scores.map((s, i) => <td key={parts[i].id} className="px-3 py-2">{s ? `${s.mandatoryOk} ${t('of')} ${s.mandatoryTotal}` : '—'}</td>)}
            </tr>
            <tr>
              <td className={`${sticky} bg-slate-50 px-3 py-2 font-semibold`}>{t('verdict')}</td>
              {scores.map((s, i) => <td key={parts[i].id} className="px-3 py-2">{s ? <VerdictBadge v={s.verdict} t={t} /> : '—'}</td>)}
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  )
}
