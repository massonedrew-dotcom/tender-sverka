import { useMemo, useState } from 'react'
import { useApp } from '../ctx'
import type { Operator, ReqType, Requirement, Scope } from '../types'
import { scopeLabel, typeLabel } from '../i18n'
import { reqCondition } from '../lib/units'
import { locateQuote } from '../lib/text'
import { assignIds, PARTICIPANT_CATS, PRODUCT_CATS } from '../lib/pipeline'
import { Btn, Card, Chip, Empty, FlowSteps, Icon, Modal, Notice, PageHeader } from '../components/ui'
import { SourceLink } from '../components/Common'

const TYPE_CLS: Record<ReqType, string> = {
  mandatory: 'bg-red-50 text-red-700',
  scored: 'bg-blue-50 text-blue-700',
  desired: 'bg-slate-100 text-slate-600',
}

function EditReq({ r, onSave, onClose }: { r: Requirement; onSave: (r: Requirement) => void; onClose: () => void }) {
  const { t, project } = useApp()
  const [x, setX] = useState<Requirement>(r)
  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-blue-500'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600'
  const files = project.customerFiles
  return (
    <Modal title={`${t('edit')} ${r.id || ''}`} onClose={onClose} closeLabel={t('close')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>{t('scope_product')} / {t('scope_participant')}</label>
          <select className={inp} value={x.scope} onChange={(e) => setX({ ...x, scope: e.target.value as Scope })}>
            <option value="product">{t('scope_product')}</option>
            <option value="participant">{t('scope_participant')}</option>
          </select>
        </div>
        <div>
          <label className={lbl}>{t('category')}</label>
          <input className={inp} list="cats" value={x.category} onChange={(e) => setX({ ...x, category: e.target.value })} />
          <datalist id="cats">{[...PRODUCT_CATS, ...PARTICIPANT_CATS].map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>{t('parameter')}</label>
          <input className={inp} value={x.parameter} onChange={(e) => setX({ ...x, parameter: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>{t('condition')}</label>
          <select className={inp} value={x.operator} onChange={(e) => setX({ ...x, operator: e.target.value as Operator })}>
            {(['>=', '<=', '=', 'range', 'tolerance', 'exists', 'text', 'date'] as Operator[]).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('type')}</label>
          <select className={inp} value={x.type} onChange={(e) => setX({ ...x, type: e.target.value as ReqType })}>
            {(['mandatory', 'scored', 'desired'] as ReqType[]).map((o) => <option key={o} value={o}>{typeLabel(t, o)}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('fieldValue')}</label>
          <input className={inp} value={x.value ?? ''} onChange={(e) => setX({ ...x, value: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>max / ±</label>
            <input className={inp} value={x.valueMax ?? ''} onChange={(e) => setX({ ...x, valueMax: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>{t('fieldUnit')}</label>
            <input className={inp} value={x.unit ?? ''} onChange={(e) => setX({ ...x, unit: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={lbl}>{t('lotItem')}</label>
          <input className={inp} value={x.lotItem ?? ''} onChange={(e) => setX({ ...x, lotItem: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>{t('fieldPoints')}</label>
          <input className={inp} type="number" value={x.points ?? ''} onChange={(e) => setX({ ...x, points: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>{t('proof')}</label>
          <input className={inp} value={x.proof ?? ''} onChange={(e) => setX({ ...x, proof: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>{t('source')}</label>
          <select className={inp} value={x.source.fileName} onChange={(e) => {
            const f = files.find((ff) => ff.name === e.target.value)
            setX({ ...x, source: { ...x.source, fileName: e.target.value, fileId: f?.id } })
          }}>
            <option value="">—</option>
            {files.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('pages')}</label>
          <input className={inp} type="number" min="1" value={x.source.page} onChange={(e) => setX({ ...x, source: { ...x.source, page: Number(e.target.value) } })} />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>{t('fieldQuote')}</label>
          <textarea className={inp} rows={3} value={x.source.quote} onChange={(e) => setX({ ...x, source: { ...x.source, quote: e.target.value } })} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>{t('cancel')}</Btn>
        <Btn kind="primary" onClick={() => onSave({ ...x, manual: true })}>{t('save')}</Btn>
      </div>
    </Modal>
  )
}

export function ChecklistScreen() {
  const { t, project, update, go, openDoc } = useApp()
  const [scope, setScope] = useState<'all' | Scope>('all')
  const [type, setType] = useState<'all' | ReqType>('all')
  const [cat, setCat] = useState('')
  const [item, setItem] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Requirement | null>(null)
  const reqs = project.requirements
  const cats = useMemo(() => [...new Set(reqs.map((r) => r.category))], [reqs])
  const items = useMemo(() => [...new Set(reqs.map((r) => r.lotItem).filter(Boolean))] as string[], [reqs])
  const list = reqs.filter(
    (r) =>
      (scope === 'all' || r.scope === scope) &&
      (type === 'all' || r.type === type) &&
      (!cat || r.category === cat) &&
      (!item || r.lotItem === item) &&
      (!q || `${r.id} ${r.parameter} ${r.value ?? ''} ${r.source.quote}`.toLowerCase().includes(q.toLowerCase())),
  )
  const docs = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of reqs.filter((x) => !x.excluded && x.proof)) {
      const k = r.proof!
      m.set(k, [...(m.get(k) ?? []), r.id])
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [reqs])

  if (!reqs.length)
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <Card className="px-3 py-2.5 sm:px-4">
          <FlowSteps project={project} t={t} go={go} />
        </Card>
        <Empty icon="clipboard" title={t('tab_checklist')} action={<Btn kind="primary" icon="upload" onClick={() => go('upload')}>{t('tab_upload')}</Btn>}>
          {t('noChecklist')}
        </Empty>
      </div>
    )

  const save = (edited: Requirement) => {
    // цитата проверяется по документации заказчика заново; при нахождении уточняются файл и страница
    const loc = locateQuote(project.customerFiles, edited.source)
    const r: Requirement = {
      ...edited,
      quoteVerified: !!loc,
      source: loc ? { ...edited.source, fileId: loc.fileId, fileName: loc.fileName, page: loc.page } : edited.source,
    }
    update((p) => {
      if (!r.id) {
        const [nr] = assignIds([{ ...r, confidence: 100 }], p.requirements)
        return { ...p, requirements: [...p.requirements, nr], checklistApproved: false }
      }
      return { ...p, requirements: p.requirements.map((x) => (x.id === r.id ? r : x)), checklistApproved: false }
    }, r.id ? `Чек-лист: изменён пункт ${r.id}` : 'Чек-лист: добавлен пункт вручную')
    setEditing(null)
  }
  const toggle = (r: Requirement) =>
    update((p) => ({ ...p, requirements: p.requirements.map((x) => (x.id === r.id ? { ...x, excluded: !x.excluded } : x)), checklistApproved: false }), `${r.id}: ${r.excluded ? t('include') : t('exclude')}`)
  const active = reqs.filter((r) => !r.excluded)
  const unverified = reqs.filter((r) => !r.quoteVerified).length
  const approve = () => {
    update((p) => ({ ...p, checklistApproved: true }), t('approved'))
    go('upload')
  }
  const sel = 'rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-slate-400'
  const pill = 'tabular inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600'
  const tag = 'inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-medium'

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <Card className="px-3 py-2.5 sm:px-4">
        <FlowSteps project={project} t={t} go={go} />
      </Card>

      <PageHeader
        title={t('tab_checklist')}
        subtitle={
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={pill}><b className="font-semibold text-slate-800">{active.length}</b> / {reqs.length}</span>
            <span className={pill}>{t('scope_product')}: <b className="font-semibold text-slate-800">{active.filter((r) => r.scope === 'product').length}</b></span>
            <span className={pill}>{t('scope_participant')}: <b className="font-semibold text-slate-800">{active.filter((r) => r.scope === 'participant').length}</b></span>
            <span className={pill}>{t('mandatory')}: <b className="font-semibold text-slate-800">{active.filter((r) => r.type === 'mandatory').length}</b></span>
            {unverified > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs text-orange-800 ring-1 ring-orange-200">
                <Icon name="alert" className="h-3.5 w-3.5" /> {unverified} — {t('quoteNotFound')}
              </span>
            )}
          </div>
        }
        actions={
          <>
            <Btn icon="plus" onClick={() => setEditing({ id: '', scope: 'product', category: PRODUCT_CATS[0], parameter: '', operator: 'exists', type: 'mandatory', source: { fileName: '', page: 1, quote: '' }, confidence: 100, quoteVerified: true })}>{t('addItem')}</Btn>
          </>
        }
      />

      {project.checklistApproved && (
        <Notice
          tone="success"
          action={
            <>
              <Btn size="sm" kind="ghost" onClick={() => update((p) => ({ ...p, checklistApproved: false }), t('unapprove'))}>{t('unapprove')}</Btn>
              <Btn size="sm" kind="primary" icon="upload" onClick={() => go('upload')}>{t('participantDocs')} <Icon name="arrowRight" className="h-3.5 w-3.5" /></Btn>
            </>
          }
        >
          <span className="font-semibold">{t('approved')}</span>
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={scope === 'all'} onClick={() => setScope('all')} count={reqs.length}>{t('all')}</Chip>
        <Chip active={scope === 'product'} onClick={() => setScope('product')} count={reqs.filter((r) => r.scope === 'product').length}>{t('scope_product')}</Chip>
        <Chip active={scope === 'participant'} onClick={() => setScope('participant')} count={reqs.filter((r) => r.scope === 'participant').length}>{t('scope_participant')}</Chip>
        <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block" aria-hidden="true" />
        <select className={sel} value={type} onChange={(e) => setType(e.target.value as ReqType | 'all')} aria-label={t('type')}>
          <option value="all">{t('type')}: {t('all')}</option>
          {(['mandatory', 'scored', 'desired'] as ReqType[]).map((x) => <option key={x} value={x}>{typeLabel(t, x)}</option>)}
        </select>
        <select className={`${sel} max-w-full`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('category')}>
          <option value="">{t('category')}: {t('all')}</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        {items.length > 0 && (
          <select className={`${sel} max-w-full`} value={item} onChange={(e) => setItem(e.target.value)} aria-label={t('lotItem')}>
            <option value="">{t('lotItem')}: {t('all')}</option>
            {items.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <label className="relative min-w-[12rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="w-full rounded-full border border-slate-300 bg-white py-1 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500"
            placeholder={`${t('id')} / ${t('parameter')}`}
            aria-label={`${t('id')} / ${t('parameter')}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('id')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('category')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('parameter')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('condition')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('type')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('proof')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('source')}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium" title={t('confidence')}>AI</th>
              <th scope="col" className="px-3 py-2.5"><span className="sr-only">{t('edit')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">{t('notFound')}</td>
              </tr>
            )}
            {list.map((r) => (
              <tr key={r.id} className={`group align-top transition-colors hover:bg-slate-50/80 ${r.excluded ? 'opacity-50' : ''}`}>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium text-slate-600">{r.id}</td>
                <td className="px-3 py-2.5 text-xs">
                  <div className="font-medium text-slate-700">{scopeLabel(t, r.scope)}</div>
                  <div className="text-slate-500">{r.category}</div>
                  {r.lotItem && <div className="text-slate-500">{r.lotItem}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div className={`font-medium text-slate-900 ${r.excluded ? 'line-through' : ''}`}>{r.parameter}</div>
                  <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                    {!r.quoteVerified && <span className={`${tag} bg-orange-100 text-orange-800`}><Icon name="alert" className="h-3 w-3" />{t('quoteNotFound')}</span>}
                    {r.restrictive && <span className={`${tag} bg-violet-100 text-violet-800`} title={r.restrictive}><Icon name="flag" className="h-3 w-3" />{t('restrictive')}</span>}
                    {r.changeNote && <span className={`${tag} bg-sky-100 text-sky-800`} title={r.changeNote}><Icon name="edit" className="h-3 w-3" />{t('changedByAmendment')}</span>}
                    {r.excluded && <span className={`${tag} bg-slate-200 text-slate-600`}>{t('excluded')}</span>}
                    {r.manual && <span className={`${tag} bg-slate-100 text-slate-600`}>{t('method_manual')}</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">{reqCondition(r) || <span className="font-normal text-slate-600">{r.value}</span>}</td>
                <td className="px-3 py-2.5">
                  <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLS[r.type]}`}>{typeLabel(t, r.type)}{r.points ? ` · ${r.points}` : ''}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">{r.proof}</td>
                <td className="max-w-[16rem] px-3 py-2.5">
                  <SourceLink src={r.source} />
                  <div className="mt-0.5 line-clamp-2 text-[11px] italic leading-snug text-slate-500" title={r.source.quote}>«{r.source.quote}»</div>
                </td>
                <td className={`tabular px-3 py-2.5 text-right text-xs font-medium ${r.confidence < 80 ? 'text-orange-700' : 'text-slate-500'}`}>{r.confidence}%</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <div className="inline-flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700" onClick={() => setEditing(r)} title={t('edit')} aria-label={`${t('edit')} ${r.id}`}>
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => toggle(r)}>
                      {r.excluded ? t('include') : t('exclude')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Icon name="help" className="h-5 w-5 text-amber-600" /> {t('questionsToCustomer')}
            <span className="tabular rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{project.questions.length}</span>
          </h2>
          {project.questions.length === 0 && <div className="text-sm text-slate-400">—</div>}
          <ul className="space-y-3">
            {project.questions.map((qq) => (
              <li key={qq.id} className="rounded-lg border border-slate-200 p-3 text-sm leading-relaxed text-slate-800">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${qq.kind === 'contradiction' ? 'bg-red-100 text-red-800' : qq.kind === 'restrictive' ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800'}`}>{qq.kind === 'restrictive' ? t('restrictive') : qq.kind}</span>
                {qq.text}
                <div className="mt-2 space-y-1">
                  {qq.sources.map((s, i) => (
                    <button type="button" key={i} className="flex w-full items-start gap-1.5 text-left text-xs text-blue-700 hover:underline" onClick={() => openDoc(s.fileId, s.fileName, s.page, s.quote)}>
                      <Icon name="file" className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>{s.fileName}, {t('pages')} {s.page}: «{s.quote.slice(0, 120)}»</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Icon name="clipboard" className="h-5 w-5 text-blue-600" /> {t('docsToPrepare')}
            <span className="tabular rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{docs.length}</span>
          </h2>
          {docs.length === 0 && <div className="text-sm text-slate-400">—</div>}
          <ul className="divide-y divide-slate-100 text-sm">
            {docs.map(([d, ids]) => (
              <li key={d} className="flex items-start gap-2.5 py-2">
                <Icon name="square" className="mt-0.5 h-4 w-4 text-slate-300" />
                <span className="min-w-0 flex-1 text-slate-800">{d}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-500">{ids.slice(0, 6).join(', ')}{ids.length > 6 ? '…' : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {!project.checklistApproved && (
        <div className="sticky bottom-3 z-20">
          <div className="anim-pop flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-white/95 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
            <Icon name="clipboard" className="h-5 w-5 text-blue-600" />
            <div className="min-w-0 flex-1 text-sm text-slate-700">
              <span className="tabular font-semibold text-slate-900">{active.length}</span> / {reqs.length} · {t('mandatory')}: <span className="tabular font-semibold text-slate-900">{active.filter((r) => r.type === 'mandatory').length}</span>
            </div>
            <Btn kind="primary" icon="check" onClick={approve}>{t('approve')}</Btn>
          </div>
        </div>
      )}

      {editing && <EditReq r={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}
