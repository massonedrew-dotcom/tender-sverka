import { useState, type ReactNode } from 'react'
import JSZip from 'jszip'
import type { Project, Settings, Status, Verdict } from '../types'
import type { T } from '../i18n'
import { computeScore } from '../lib/scoring'
import { fmtDate } from '../lib/text'
import { download } from '../lib/export'
import { demoSampleFiles } from '../demo/demoProject'
import { Btn, Card, Empty, Icon, Modal, Notice, StatusBadge, VerdictBadge, Bar, scoreColor, ST_HEX, type IconName } from '../components/ui'

const STATUSES: Status[] = ['ok', 'partial', 'unconfirmed', 'fail', 'review']
const VERDICTS: Verdict[] = ['ready', 'needs_work', 'risk']

/** Иллюстрация в hero: фрагмент таблицы сверки (декоративная, как на макете экрана «Сравнение»). */
function HeroPreview({ t }: { t: T }) {
  const rows: [string, Status, string][] = [
    ['T-012', 'ok', 'w-24'],
    ['T-014', 'fail', 'w-28'],
    ['T-019', 'unconfirmed', 'w-20'],
    ['U-003', 'partial', 'w-24'],
    ['U-007', 'review', 'w-16'],
  ]
  const mix = [56, 14, 10, 12, 8]
  return (
    <div aria-hidden="true" className="rounded-2xl bg-white p-5 text-slate-900 shadow-2xl ring-1 ring-white/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-slate-500">{t('compliance')}</div>
          <div className="tabular text-3xl font-extrabold tracking-tight">78%</div>
        </div>
        <VerdictBadge v="risk" t={t} />
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full">
        {STATUSES.map((s, i) => <div key={s} style={{ width: `${mix[i]}%`, background: ST_HEX[s] }} />)}
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {rows.map(([id, s, w]) => (
          <li key={id} className="flex items-center gap-3 py-2">
            <span className="w-12 font-mono text-xs text-slate-500">{id}</span>
            <span className={`h-2 rounded-full bg-slate-200 ${w}`} />
            <span className="ml-auto"><StatusBadge s={s} t={t} small /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Конвейер обработки (ТЗ, схема «Оба пакета проходят один конвейер»): 5 этапов. */
function Pipeline({ t }: { t: T }) {
  const tag = 'rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600'
  const stages: { icon: IconName; title: string; body: ReactNode; accent?: boolean }[] = [
    {
      icon: 'scan',
      title: t('stage_read'),
      body: (
        <div className="flex flex-wrap gap-1">
          {['PDF', 'DOCX', 'XLSX', 'JPG · OCR', 'ZIP'].map((x) => <span key={x} className={tag}>{x}</span>)}
          <span className={tag}>RU · UZ · EN</span>
        </div>
      ),
    },
    {
      icon: 'clipboard',
      title: t('tab_checklist'),
      body: (
        <div className="space-y-1.5 text-xs text-slate-600">
          <div className="flex items-start gap-1.5"><Icon name="file" className="mt-px h-3.5 w-3.5 text-slate-400" />{t('stage_extract')}</div>
          <div className="flex items-start gap-1.5"><Icon name="users" className="mt-px h-3.5 w-3.5 text-slate-400" />{t('stage_facts')}</div>
          <div className="flex items-start gap-1.5 font-medium text-green-700"><Icon name="check" className="mt-px h-3.5 w-3.5" />{t('approve')}</div>
        </div>
      ),
    },
    {
      icon: 'compare',
      title: t('stage_match'),
      body: (
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => <StatusBadge key={s} s={s} t={t} small />)}
        </div>
      ),
    },
    {
      icon: 'gauge',
      title: t('stage_score'),
      body: (
        <div className="flex flex-wrap gap-1">
          {VERDICTS.map((v) => <VerdictBadge key={v} v={v} t={t} />)}
        </div>
      ),
    },
    {
      icon: 'report',
      title: t('stage_analysis'),
      accent: true,
      body: (
        <div className="flex flex-wrap gap-1">
          {[t('exportPdf'), t('exportXlsx'), t('exportDocx')].map((x) => <span key={x} className="rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-blue-800">{x}</span>)}
        </div>
      ),
    },
  ]
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700"><Icon name="file" className="h-4 w-4 text-slate-500" />{t('customerDocs')}</span>
        <Icon name="plus" className="h-4 w-4 text-slate-400" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700"><Icon name="users" className="h-4 w-4 text-slate-500" />{t('participantDocs')}</span>
      </div>
      <ol className="flex flex-col gap-1 lg:flex-row lg:items-stretch">
        {stages.map((s, i) => (
          <li key={i} className="flex flex-col lg:min-w-0 lg:flex-1 lg:basis-0 lg:flex-row">
            {i > 0 && (
              <span className="flex justify-center py-0.5 text-slate-300 lg:items-center lg:px-0.5 lg:py-0" aria-hidden="true">
                <Icon name="chevronDown" className="h-5 w-5 lg:-rotate-90" />
              </span>
            )}
            <div className={`flex-1 rounded-xl border p-4 ${s.accent ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]'}`}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.accent ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>
                  <Icon name={s.icon} className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold text-slate-400">0{i + 1}</span>
              </div>
              <div className="mb-2 text-sm font-semibold leading-snug text-slate-900">{s.title}</div>
              {s.body}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ProjectsScreen({
  t, projects, settings, onOpen, onCreate, onDelete, onDemo, aiReady, openSettings,
}: {
  t: T; projects: Project[]; settings: Settings; onOpen: (id: string) => void; onCreate: (p: { name: string; lotNumber: string; customer: string; deadline: string }) => void
  onDelete: (id: string) => void; onDemo: () => void; aiReady: boolean; openSettings: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', lotNumber: '', customer: '', deadline: '' })
  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600'

  const samples = async () => {
    const zip = new JSZip()
    for (const f of demoSampleFiles()) zip.file(f.path, f.text)
    download(await zip.generateAsync({ type: 'blob' }), 'Тендер-Сверка_примеры_документов.zip')
  }

  const del = (p: Project) => {
    if (confirm(`${t('delete')}: «${p.name}»?`)) onDelete(p.id)
  }

  const rows = projects.map((p) => {
    const scores = p.participants.filter((x) => Object.keys(x.matches).length).map((x) => ({ x, s: computeScore(p, x, settings) }))
    scores.sort((a, b) => b.s.score - a.s.score)
    return { p, scores, best: scores[0] }
  })

  const stateCell = (r: (typeof rows)[number]) =>
    r.best ? (
      <VerdictBadge v={r.best.s.verdict} t={t} />
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
        <Icon name={r.p.checklistApproved ? 'check' : 'upload'} className="h-3.5 w-3.5" />
        {r.p.checklistApproved ? t('approved') : t('tab_upload')}
      </span>
    )

  const scoreCell = (r: (typeof rows)[number]) =>
    r.best ? (
      <div className="space-y-1.5">
        {r.scores.slice(0, 3).map(({ x, s }) => (
          <div key={x.id} className="flex items-center gap-2 text-xs" title={x.name}>
            <span className="tabular w-9 shrink-0 font-semibold">{Math.round(s.score)}%</span>
            <Bar value={s.score} cls={scoreColor(s.score)} label={`${x.name}: ${t('compliance')}`} />
          </div>
        ))}
      </div>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    )

  const title = (p: Project) => (
    <>
      {p.lotNumber && <span className="font-normal text-slate-500">{p.lotNumber} · </span>}«{p.name}»
      {p.isDemo && <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide text-blue-700">{t('demoBadge')}</span>}
    </>
  )
  const meta = (p: Project) => `${p.requirements.length} ${t('requirement').toLowerCase()} · ${p.participants.length} ${t('participant').toLowerCase()} · ${t('created')} ${fmtDate(p.createdAt)}`

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:py-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 text-white shadow-lg">
        <div className="bg-grid-faint absolute inset-0" aria-hidden="true" />
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-500/30 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-10 px-5 py-9 sm:px-10 sm:py-12 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-blue-100">
              <Icon name="sparkles" className="h-3.5 w-3.5" /> AI · RU / UZ / EN
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{t('appName')}</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-blue-100 sm:text-lg">{t('tagline')}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onDemo}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-blue-900 shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-50 focus-visible:outline-white"
              >
                <Icon name="play" className="h-4 w-4" /> {t('openDemo')}
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/5 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-white"
              >
                <Icon name="plus" className="h-5 w-5" /> {t('newProject')}
              </button>
            </div>
            <button type="button" onClick={samples} className="mt-5 inline-flex items-center gap-1.5 text-sm text-blue-200 underline-offset-4 hover:text-white hover:underline focus-visible:outline-white">
              <Icon name="download" className="h-4 w-4" /> {t('downloadSamples')} (.zip)
            </button>
          </div>
          <div className="hidden lg:block">
            <HeroPreview t={t} />
          </div>
        </div>
      </section>

      {!aiReady && (
        <Notice tone="warn" icon="key" action={<Btn onClick={openSettings} icon="settings">{t('settings')}</Btn>}>
          {t('needKey')}
        </Notice>
      )}

      {/* Список проверок */}
      <section aria-labelledby="projects-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="projects-h" className="text-lg font-semibold">
            {t('tab_projects')} {projects.length > 0 && <span className="ml-1 font-normal text-slate-400">{projects.length}</span>}
          </h2>
          {projects.length > 0 && <Btn kind="primary" icon="plus" onClick={() => setCreating(true)}>{t('newProject')}</Btn>}
        </div>

        {projects.length === 0 ? (
          <Empty icon="clipboard">{t('noProjects')}</Empty>
        ) : (
          <>
            {/* Телефон: карточки */}
            <ul className="space-y-3 sm:hidden">
              {rows.map((r) => (
                <li key={r.p.id}>
                  <Card className="p-4">
                    <div className="flex items-start gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left text-sm font-semibold text-slate-900" onClick={() => onOpen(r.p.id)}>
                        {title(r.p)}
                      </button>
                      <button type="button" className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => del(r.p)} aria-label={t('delete')} title={t('delete')}>
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{meta(r.p)}</div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-slate-500">{t('customer')}</dt>
                      <dd className="truncate text-right text-slate-700">{r.p.customer || '—'}</dd>
                      <dt className="text-slate-500">{t('deadline')}</dt>
                      <dd className="text-right font-medium text-slate-700">{fmtDate(r.p.deadline)}</dd>
                    </dl>
                    {r.best && <div className="mt-3">{scoreCell(r)}</div>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {stateCell(r)}
                      <Btn size="sm" onClick={() => onOpen(r.p.id)}>{t('open')} <Icon name="arrowRight" className="h-3.5 w-3.5" /></Btn>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            {/* Планшет и десктоп: таблица */}
            <Card className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t('lot')}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t('customer')}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t('deadline')}</th>
                    <th scope="col" className="w-48 px-4 py-2.5 font-medium">{t('compliance')}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t('status')}</th>
                    <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">{t('delete')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr
                      key={r.p.id}
                      tabIndex={0}
                      className="group cursor-pointer align-top transition-colors hover:bg-blue-50/40 focus-visible:bg-blue-50/40"
                      onClick={() => onOpen(r.p.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onOpen(r.p.id)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-800">{title(r.p)}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{meta(r.p)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{r.p.customer || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-700">{fmtDate(r.p.deadline)}</td>
                      <td className="px-4 py-3.5">{scoreCell(r)}</td>
                      <td className="px-4 py-3.5">{stateCell(r)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-400 opacity-60 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            del(r.p)
                          }}
                          aria-label={`${t('delete')}: ${r.p.name}`}
                          title={t('delete')}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </section>

      {/* Как это работает */}
      <section aria-labelledby="pipeline-h" className="space-y-5">
        <h2 id="pipeline-h" className="text-lg font-semibold">{t('pipeline')}</h2>
        <Pipeline t={t} />
        <ol className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {[t('pipe1'), t('pipe2'), t('pipe3'), t('pipe4')].map((x, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
              <p className="text-sm leading-relaxed text-slate-600">{x}</p>
            </li>
          ))}
        </ol>
      </section>

      {creating && (
        <Modal title={t('newProject')} onClose={() => setCreating(false)} closeLabel={t('close')}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              onCreate({ ...form, name: form.name || 'Без названия' })
              setCreating(false)
            }}
          >
            <div>
              <label htmlFor="np-name" className={lbl}>{t('projectName')}</label>
              <input id="np-name" autoFocus className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('projectNamePh')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="np-lot" className={lbl}>{t('lotNumber')}</label>
                <input id="np-lot" className={inp} value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} />
              </div>
              <div>
                <label htmlFor="np-deadline" className={lbl}>{t('deadline')}</label>
                <input id="np-deadline" type="date" className={inp} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="np-customer" className={lbl}>{t('customer')}</label>
              <input id="np-customer" className={inp} value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            </div>
            <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <Icon name="sparkles" className="mt-0.5 h-3.5 w-3.5 text-blue-600" />
              {t('autoMetaHint')}
            </p>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Btn onClick={() => setCreating(false)}>{t('cancel')}</Btn>
              <Btn kind="primary" type="submit" icon="plus">{t('create')}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
