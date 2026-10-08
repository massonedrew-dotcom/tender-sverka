import { useState, type ReactNode } from 'react'
import { useApp } from '../ctx'
import type { DocFile, Participant, Project } from '../types'
import { readFiles, textFile, DOC_TYPES } from '../lib/extract'
import { analyzeParticipant, applyAmendment, extractRequirements, makeAnalysis } from '../lib/pipeline'
import { hasAI } from '../lib/settings'
import { uid } from '../lib/text'
import { Btn, Card, Chip, DropZone, Empty, FlowSteps, Icon, Modal, Notice } from '../components/ui'

function SectionHead({ n, title, right }: { n: number; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{n}</span>
      <h2 className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
      {right}
    </div>
  )
}

function FileList({ files, onType, onRemove, onOpen, t }: { files: DocFile[]; onType: (id: string, v: string) => void; onRemove: (id: string) => void; onOpen: (f: DocFile) => void; t: ReturnType<typeof useApp>['t'] }) {
  if (!files.length) return null
  return (
    <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {files.map((f) => (
        <li key={f.id} className={`px-3 py-2.5 ${f.warnings.length ? 'bg-orange-50/40' : ''}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button type="button" className="group flex min-w-0 flex-1 basis-40 items-center gap-2 text-left" title={f.path ?? f.name} onClick={() => onOpen(f)}>
              <Icon name="file" className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
              <span className="truncate text-sm font-medium text-slate-800 group-hover:text-blue-700 group-hover:underline">{f.name}</span>
              {f.pending && <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">NEW</span>}
            </button>
            <span className="tabular whitespace-nowrap text-xs text-slate-500">
              {f.pages.length} {t('pages')}
              {f.pages.some((p) => p.ocr) && <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[10px] font-semibold text-slate-600">OCR</span>}
            </span>
            <select
              className="max-w-[12rem] rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700"
              value={f.docType}
              onChange={(e) => onType(f.id, e.target.value)}
              title={t('docType')}
              aria-label={`${t('docType')}: ${f.name}`}
            >
              {[...new Set([f.docType, ...DOC_TYPES])].map((d) => <option key={d}>{d}</option>)}
            </select>
            <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => onRemove(f.id)} title={t('delete')} aria-label={`${t('delete')}: ${f.name}`}>
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          {f.warnings.map((w, i) => (
            <div key={i} className="mt-1.5 flex items-start gap-1.5 text-xs text-orange-800">
              <Icon name="alert" className="mt-px h-3.5 w-3.5 text-orange-500" />
              {w}
            </div>
          ))}
        </li>
      ))}
    </ul>
  )
}

export function UploadScreen() {
  const { t, project, update, settings, run, job, participant, setParticipant, go, openSettings, openDoc } = useApp()
  const [paste, setPaste] = useState<null | 'customer' | 'participant'>(null)
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const ai = hasAI(settings)
  const busy = !!job && !job.error
  const extracted = project.requirements.length > 0
  const pendingCustomer = project.customerFiles.filter((f) => f.pending)

  const addCustomer = (list: File[]) =>
    run(async (progress) => {
      progress('stage_read')
      const { files, warnings } = await readFiles(list, settings, (m) => progress('stage_read', m))
      const mark = files.map((f) => (extracted ? { ...f, pending: true, isAmendment: true, docType: f.docType === 'Прочее' ? 'Разъяснение / изменение' : f.docType } : f))
      update((p) => ({ ...p, customerFiles: [...p.customerFiles, ...mark] }), `${t('customerDocs')}: +${files.length} ${t('filesCount')}${warnings.length ? ' (' + warnings.join('; ') + ')' : ''}`)
    })

  const addParticipantFiles = (list: File[], partId: string) =>
    run(async (progress) => {
      progress('stage_read')
      const { files } = await readFiles(list, settings, (m) => progress('stage_read', m))
      update((p) => ({
        ...p,
        participants: p.participants.map((x) => (x.id === partId ? { ...x, files: [...x.files, ...files.map((f) => (Object.keys(x.matches).length ? { ...f, pending: true } : f))] } : x)),
      }), `${t('participantDocs')}: +${files.length} ${t('filesCount')}`)
    })

  const extract = () =>
    run(async (progress) => {
      const r = await extractRequirements(project, settings, progress)
      update((p) => ({
        ...p,
        requirements: r.requirements,
        questions: r.questions,
        checklistApproved: false,
        lotNumber: p.lotNumber || r.meta?.lotNumber || '',
        customer: p.customer || r.meta?.customer || '',
        deadline: p.deadline || (/^\d{4}-\d{2}-\d{2}$/.test(r.meta?.deadline ?? '') ? r.meta!.deadline! : ''),
        name: p.name === 'Без названия' && r.meta?.title ? r.meta.title : p.name,
        customerFiles: p.customerFiles.map((f) => ({ ...f, pending: false })),
        // новые требования получают новые ID — прежние результаты сверки к ним не относятся (история версий сохраняется)
        participants: p.participants.map((x) => ({ ...x, matches: {}, analysis: undefined })),
      }), `Извлечено ${r.requirements.length} требований, ${r.questions.length} вопросов к заказчику`)
      go('checklist')
    })

  const amend = () =>
    run(async (progress) => {
      const r = await applyAmendment(project, pendingCustomer, settings, progress)
      update((p) => ({
        ...p,
        requirements: r.requirements,
        questions: [...p.questions, ...r.questions],
        customerFiles: p.customerFiles.map((f) => ({ ...f, pending: false })),
      }), `Разъяснения учтены: изменено пунктов — ${r.changed.length} (${r.changed.join(', ')})`)
      go('checklist')
    })

  const check = (part: Participant, recheck: boolean) =>
    run(async (progress) => {
      // при повторной проверке пересчитываются незелёные пункты и пункты, изменённые разъяснениями заказчика
      const only = recheck ? project.requirements.filter((r) => !r.excluded && (part.matches[r.id]?.status !== 'ok' || !!r.changeNote)).map((r) => r.id) : undefined
      let next = await analyzeParticipant(project, part, settings, progress, only)
      progress('stage_analysis')
      try {
        next = { ...next, analysis: await makeAnalysis(project, next, settings) }
      } catch (e) {
        console.warn(e)
      }
      next = { ...next, files: next.files.map((f) => ({ ...f, pending: false })) }
      const v = next.versions[next.versions.length - 1]
      update((p) => ({ ...p, participants: p.participants.map((x) => (x.id === part.id ? next : x)) }), `${next.name}: ${v.label} — ${v.score.toFixed(1)}%`)
      go('compare')
    })

  const addParticipant = () => {
    const id = uid('p')
    const n = project.participants.length + 1
    update((p) => ({ ...p, participants: [...p.participants, { id, name: `Участник ${n}`, files: [], facts: [], contradictions: [], matches: {}, versions: [] }] }))
    setParticipant(id)
  }

  const setType = (where: 'customer' | string, id: string, v: string) =>
    update((p) =>
      where === 'customer'
        ? { ...p, customerFiles: p.customerFiles.map((f) => (f.id === id ? { ...f, docType: v } : f)) }
        : { ...p, participants: p.participants.map((x) => (x.id === where ? { ...x, files: x.files.map((f) => (f.id === id ? { ...f, docType: v } : f)) } : x)) },
    )
  const remove = (where: 'customer' | string, id: string) =>
    update((p) =>
      where === 'customer'
        ? { ...p, customerFiles: p.customerFiles.filter((f) => f.id !== id) }
        : { ...p, participants: p.participants.map((x) => (x.id === where ? { ...x, files: x.files.filter((f) => f.id !== id) } : x)) },
    )

  const submitPaste = () => {
    if (!pasteText.trim()) return
    const f = textFile((pasteName || 'Вставленный текст') + '.txt', pasteText)
    if (paste === 'customer') update((p: Project) => ({ ...p, customerFiles: [...p.customerFiles, extracted ? { ...f, pending: true, isAmendment: true } : f] }))
    else if (participant) update((p) => ({ ...p, participants: p.participants.map((x) => (x.id === participant.id ? { ...x, files: [...x.files, Object.keys(x.matches).length ? { ...f, pending: true } : f] } : x)) }))
    setPaste(null)
    setPasteText('')
    setPasteName('')
  }

  const hasMatches = participant && Object.keys(participant.matches).length > 0
  const pendingPart = participant?.files.filter((f) => f.pending) ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <Card className="px-3 py-2.5 sm:px-4">
        <FlowSteps project={project} t={t} go={go} />
      </Card>
      {project.isDemo && <Notice tone="info">{t('demoNote')}</Notice>}
      {!ai && (
        <Notice tone="warn" icon="key" action={<Btn onClick={openSettings} icon="settings">{t('settings')}</Btn>}>
          {t('needKey')}
        </Notice>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Документация заказчика */}
        <Card className="p-4 sm:p-5">
          <SectionHead n={1} title={t('customerDocs')} right={<span className="tabular rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{project.customerFiles.length} {t('filesCount')}</span>} />
          <DropZone onFiles={addCustomer} disabled={busy} label={extracted ? t('addAmendment') : t('dropHere')} hint={t('formatsHint')} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <button type="button" className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline" onClick={() => setPaste('customer')}>
              <Icon name="edit" className="h-3.5 w-3.5" /> {t('pasteText')}
            </button>
            <span className="inline-flex items-center gap-1 text-slate-400" title={t('lotLink')}>
              <Icon name="link" className="h-3.5 w-3.5" /> {t('lotLink')}
            </span>
          </div>
          <FileList files={project.customerFiles} onType={(id, v) => setType('customer', id, v)} onRemove={(id) => remove('customer', id)} onOpen={(f) => openDoc(f.id, f.name, 1)} t={t} />
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {!extracted && (
              <Btn kind="primary" icon="sparkles" disabled={busy || !ai || !project.customerFiles.length} onClick={extract}>{t('runExtraction')}</Btn>
            )}
            {extracted && pendingCustomer.length > 0 && (
              <Btn kind="primary" icon="sparkles" disabled={busy || !ai} onClick={amend}>{t('addAmendment')} ({pendingCustomer.length})</Btn>
            )}
            {extracted && (
              <>
                <Btn onClick={() => go('checklist')} icon="clipboard">
                  {t('tab_checklist')} <span className="tabular text-slate-500">({project.requirements.length})</span>
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Btn>
                <Btn kind="ghost" icon="refresh" disabled={busy || !ai} onClick={() => confirm(t('confirmReextract')) && extract()}>{t('runExtraction')}</Btn>
              </>
            )}
          </div>
        </Card>

        {/* Заявки участников */}
        <Card className="p-4 sm:p-5">
          <SectionHead n={2} title={t('participantDocs')} />
          <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {project.participants.map((x) => (
              <Chip key={x.id} active={participant?.id === x.id} onClick={() => setParticipant(x.id)}>{x.name}</Chip>
            ))}
            <button type="button" onClick={addParticipant} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-slate-400 px-3 py-1 text-sm text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">
              <Icon name="plus" className="h-3.5 w-3.5" /> {t('addParticipant')}
            </button>
          </div>
          {!participant ? (
            <Empty icon="users" action={<Btn kind="primary" icon="plus" onClick={addParticipant}>{t('addParticipant')}</Btn>}>
              {t('noParticipants')}
            </Empty>
          ) : (
            <>
              <label htmlFor="part-name" className="mb-1 block text-xs font-medium text-slate-600">{t('participantName')}</label>
              <input
                id="part-name"
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500"
                value={participant.name}
                onChange={(e) => update((p) => ({ ...p, participants: p.participants.map((x) => (x.id === participant.id ? { ...x, name: e.target.value } : x)) }))}
              />
              <DropZone onFiles={(f) => addParticipantFiles(f, participant.id)} disabled={busy} label={t('dropHere')} hint={t('formatsHint')} />
              <div className="mt-2.5 text-xs">
                <button type="button" className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline" onClick={() => setPaste('participant')}>
                  <Icon name="edit" className="h-3.5 w-3.5" /> {t('pasteText')}
                </button>
              </div>
              <FileList files={participant.files} onType={(id, v) => setType(participant.id, id, v)} onRemove={(id) => remove(participant.id, id)} onOpen={(f) => openDoc(f.id, f.name, 1)} t={t} />
              {!project.checklistApproved && extracted && (
                <div className="mt-4">
                  <Notice tone="warn" icon="clipboard" action={<Btn size="sm" onClick={() => go('checklist')}>{t('tab_checklist')} <Icon name="arrowRight" className="h-3.5 w-3.5" /></Btn>}>
                    {t('approve')}
                  </Notice>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {!hasMatches ? (
                  <Btn kind="primary" icon="sparkles" disabled={busy || !ai || !participant.files.length || !project.checklistApproved} onClick={() => check(participant, false)}>{t('runMatching')}</Btn>
                ) : (
                  <>
                    <Btn kind="primary" icon="refresh" disabled={busy || !ai || !project.checklistApproved} onClick={() => check(participant, true)}>{t('rerun')}{pendingPart.length ? ` (+${pendingPart.length})` : ''}</Btn>
                    <Btn kind="ghost" icon="sparkles" disabled={busy || !ai || !project.checklistApproved} onClick={() => check(participant, false)}>{t('runMatching')}</Btn>
                    <Btn onClick={() => go('compare')} icon="compare">{t('tab_compare')} <Icon name="arrowRight" className="h-4 w-4" /></Btn>
                  </>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {paste && (
        <Modal title={t('pasteText')} onClose={() => setPaste(null)} closeLabel={t('close')}>
          <input className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500" placeholder={t('docNamePh')} aria-label={t('docNamePh')} value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
          <textarea className="h-64 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm shadow-sm focus:border-blue-500" aria-label={t('pasteText')} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn onClick={() => setPaste(null)}>{t('cancel')}</Btn>
            <Btn kind="primary" icon="plus" disabled={!pasteText.trim()} onClick={submitPaste}>{t('addText')}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
