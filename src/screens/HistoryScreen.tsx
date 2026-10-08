import { useMemo } from 'react'
import { useApp } from '../ctx'
import type { Status, Verdict } from '../types'
import { stLabel, type T } from '../i18n'
import { computeScore, r0, r1 } from '../lib/scoring'
import { fmtDate, fmtDateTime } from '../lib/text'
import { Card, Empty, PageHeader, VerdictBadge } from '../components/ui'
import { ParticipantPicker } from '../components/Common'

interface Point { at: string; label: string; score: number; scoreMin: number; scoreMax: number; product: number; participant: number; verdict: Verdict; changes: string[]; live?: boolean }

/** «U-003: fail → ok» → «U-003: Не соответствует → Соответствует» */
const humanize = (t: T, s: string) => s.replace(/\b(ok|partial|unconfirmed|fail|review)\b/g, (x) => stLabel(t, x as Status))

function Chart({ pts, t }: { pts: Point[]; t: T }) {
  const W = 640
  const H = 220
  const L = 36
  const R = 20
  const TOP = 20
  const B = 32
  const x = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1))
  const y = (v: number) => TOP + ((100 - v) / 100) * (H - TOP - B)
  const line = pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')
  const band = [...pts.map((p, i) => `${x(i)},${y(p.scoreMax)}`), ...pts.map((p, i) => `${x(i)},${y(p.scoreMin)}`).reverse()].join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('dynamics')}>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-200" strokeDasharray={v ? '3 3' : undefined} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{v}</text>
        </g>
      ))}
      {pts.length > 1 && <polygon points={band} className="fill-blue-100/70" />}
      {pts.length > 1 && <polyline points={line} fill="none" className="stroke-blue-600" strokeWidth={2.5} strokeLinejoin="round" />}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.score)} r={5} className={p.live ? 'fill-white stroke-blue-600' : 'fill-blue-600 stroke-white'} strokeWidth={2} />
          <text x={x(i)} y={y(p.score) - 10} textAnchor="middle" className="fill-slate-800 text-[12px] font-bold">{r0(p.score)}%</text>
          <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-slate-500 text-[10px]">{fmtDate(p.at)}</text>
        </g>
      ))}
    </svg>
  )
}

export function HistoryScreen() {
  const { t, project, participant, settings } = useApp()

  const pts = useMemo<Point[]>(() => {
    if (!participant) return []
    const list: Point[] = participant.versions.map((v) => ({ ...v }))
    if (!Object.keys(participant.matches).length) return list
    const sc = computeScore(project, participant, settings)
    const last = list[list.length - 1]
    if (!last || Math.abs(last.score - sc.score) > 0.05 || last.verdict !== sc.verdict)
      list.push({ at: project.updatedAt, label: t('current'), score: sc.score, scoreMin: sc.scoreMin, scoreMax: sc.scoreMax, product: sc.product, participant: sc.participant, verdict: sc.verdict, changes: [], live: true })
    return list
  }, [project, participant, settings, t])

  const first = pts[0]
  const last = pts[pts.length - 1]
  const delta = first && last ? last.score - first.score : 0

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <PageHeader title={t('historyTitle')} actions={<ParticipantPicker />} />

      {!participant ? (
        <Empty icon="users">{t('noParticipants')}</Empty>
      ) : !pts.length ? (
        <Empty icon="history">{t('noVersions')}</Empty>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="p-4">
              <h2 className="mb-2 font-semibold">{t('dynamics')}</h2>
              <Chart pts={pts} t={t} />
            </Card>
            <Card className="flex flex-col justify-center gap-2 p-5">
              <div className="text-sm text-slate-500">{participant.name}</div>
              {pts.length > 1 ? (
                <div className="text-3xl font-bold">
                  <span className="text-base font-normal text-slate-500">{t('was')} </span>{r0(first.score)}%
                  <span className="mx-2 text-slate-400">→</span>
                  <span className="text-base font-normal text-slate-500">{t('now')} </span>{r0(last.score)}%
                </div>
              ) : (
                <div className="text-3xl font-bold">{r0(last.score)}%</div>
              )}
              {pts.length > 1 && (
                <div className={`text-sm font-semibold ${delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>{delta >= 0 ? '+' : ''}{r1(delta)}%</div>
              )}
              <div><VerdictBadge v={last.verdict} t={t} /></div>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('date')}</th>
                  <th className="px-3 py-2">{t('version')}</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">{t('product')}</th>
                  <th className="px-3 py-2 text-right">{t('participant')}</th>
                  <th className="px-3 py-2">{t('verdict')}</th>
                  <th className="px-3 py-2">{t('changes')}</th>
                </tr>
              </thead>
              <tbody>
                {[...pts].reverse().map((p, i) => (
                  <tr key={i} className={`border-b border-slate-100 align-top ${p.live ? 'bg-blue-50/50' : ''}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{fmtDateTime(p.at)}</td>
                    <td className="px-3 py-2">{p.label}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {r1(p.score)}%
                      {p.scoreMin !== p.scoreMax && <div className="text-[11px] font-normal text-slate-400">{r0(p.scoreMin)}–{r0(p.scoreMax)}%</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{r1(p.product)}%</td>
                    <td className="px-3 py-2 text-right">{r1(p.participant)}%</td>
                    <td className="px-3 py-2"><VerdictBadge v={p.verdict} t={t} /></td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {p.changes.length ? <ul className="space-y-0.5">{p.changes.map((c, j) => <li key={j}>{humanize(t, c)}</li>)}</ul> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">{t('log')}</h2>
        {project.log.length ? (
          <ul className="space-y-1.5 text-sm">
            {[...project.log].reverse().map((l, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-32 shrink-0 text-xs text-slate-500">{fmtDateTime(l.at)}</span>
                <span className="text-slate-800">{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t('noLog')}</p>
        )}
      </Card>
    </div>
  )
}
