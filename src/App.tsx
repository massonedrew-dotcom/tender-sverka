import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { Lang, Project, Settings } from './types'
import { AppCtx, type Ctx, type Job, type Tab } from './ctx'
import { LANG_NAMES, makeT, type Dict } from './i18n'
import { loadSettings, saveSettings, hasAI } from './lib/settings'
import { deleteProject, getProject, listProjects, putProject } from './lib/storage'
import { uid } from './lib/text'
import { buildDemoProject, DEMO_ID } from './demo/demoProject'
import { Btn, Empty, Icon, Spinner } from './components/ui'
import { SettingsModal } from './components/SettingsModal'
import { DocViewer, type DocTarget } from './components/DocViewer'
import { PrintReport } from './components/PrintReport'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { UploadScreen } from './screens/UploadScreen'
import { ChecklistScreen } from './screens/ChecklistScreen'
import { CompareScreen } from './screens/CompareScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { MatrixScreen } from './screens/MatrixScreen'
import { HistoryScreen } from './screens/HistoryScreen'

const TABS: Tab[] = ['upload', 'checklist', 'compare', 'summary', 'matrix', 'history']

interface Route { id?: string; tab?: Tab }

/** #/ — проекты, #/p/<id>/<tab>[?r=<reqId>] */
function parseHash(): Route {
  const [kind, id, tab] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')
  if (kind !== 'p' || !id) return {}
  return { id: decodeURIComponent(id), tab: TABS.includes(tab as Tab) ? (tab as Tab) : undefined }
}

const href = (id?: string, tab?: Tab) => (id ? `#/p/${encodeURIComponent(id)}${tab ? '/' + tab : ''}` : '#/')

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function defaultTab(p: Project): Tab {
  if (p.participants.some((x) => Object.keys(x.matches).length)) return 'compare'
  return p.requirements.length ? 'checklist' : 'upload'
}

const SCREENS: Record<Tab, ComponentType> = {
  upload: UploadScreen,
  checklist: ChecklistScreen,
  compare: CompareScreen,
  summary: SummaryScreen,
  matrix: MatrixScreen,
  history: HistoryScreen,
}

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [route, setRoute] = useState<Route>(parseHash)
  const [project, setProject] = useState<Project | null>(null)
  const [missingId, setMissingId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [doc, setDoc] = useState<DocTarget | null>(null)
  const [printing, setPrinting] = useState(false)
  /** Актуальный проект для update() из асинхронных задач */
  const projRef = useRef<Project | null>(null)
  const t = useMemo(() => makeT(settings.uiLang), [settings.uiLang])

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.documentElement.lang = settings.uiLang
  }, [settings.uiLang])

  const refresh = useCallback(() => {
    listProjects().then(setProjects)
  }, [])

  // Загрузка проекта по маршруту
  useEffect(() => {
    const id = route.id
    if (!id) {
      projRef.current = null
      refresh()
      return
    }
    if (projRef.current?.id === id) return
    let cancelled = false
    getProject(id)
      .then(async (p) => {
        // Прямая ссылка на демо у нового посетителя: создаём демо-проект на лету
        if (!p && id === DEMO_ID) {
          p = buildDemoProject(loadSettings())
          await putProject(p)
        }
        if (cancelled) return
        if (!p) return setMissingId(id)
        projRef.current = p
        setProject(p)
      })
      .catch((e) => !cancelled && setJob({ stage: 'error', error: errMsg(e) }))
    return () => {
      cancelled = true
    }
  }, [route.id, refresh])

  const commit = useCallback((next: Project) => {
    projRef.current = next
    setProject(next)
    putProject(next).catch((e) => setJob({ stage: 'error', error: errMsg(e) }))
  }, [])

  // update() привязан к id проекта: если задача завершилась после ухода в другой проект — правим сохранённую копию
  const projectId = project?.id
  const update = useCallback<Ctx['update']>(
    (fn, log) => {
      if (!projectId) return
      const apply = (cur: Project): Project => {
        const at = new Date().toISOString()
        const next = fn(cur)
        return { ...next, updatedAt: at, log: log ? [...next.log, { at, text: log }] : next.log }
      }
      const cur = projRef.current
      if (cur?.id === projectId) commit(apply(cur))
      else
        getProject(projectId)
          .then((p) => p && putProject(apply(p)))
          .catch((e) => setJob({ stage: 'error', error: errMsg(e) }))
    },
    [projectId, commit],
  )

  const setParticipant = useCallback(
    (id: string) => {
      const cur = projRef.current
      if (cur && cur.activeParticipantId !== id) commit({ ...cur, activeParticipantId: id })
    },
    [commit],
  )

  const run = useCallback<Ctx['run']>(async (fn) => {
    let stage = 'working'
    setJob({ stage })
    try {
      await fn((s, detail) => {
        stage = s
        setJob({ stage: s, detail })
      })
      setJob(null)
    } catch (e) {
      console.error(e)
      setJob({ stage, error: errMsg(e) })
    }
  }, [])

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }, [])

  const go = useCallback((tab: Tab) => {
    if (projRef.current) location.hash = href(projRef.current.id, tab)
  }, [])

  const openDoc = useCallback<Ctx['openDoc']>((fileId, fileName, page, quote) => setDoc({ fileId, fileName, page, quote }), [])
  const openSettings = useCallback(() => setShowSettings(true), [])
  const printReport = useCallback(() => setPrinting(true), [])

  // Печать: отчёт рендерится только на время печати
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const id = window.setTimeout(() => window.print(), 100)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  const openDemo = async () => {
    try {
      if (!(await getProject(DEMO_ID))) await putProject(buildDemoProject(settings))
      location.hash = href(DEMO_ID)
    } catch (e) {
      setJob({ stage: 'error', error: errMsg(e) })
    }
  }

  const resetDemo = () => {
    if (confirm(t('resetDemoConfirm'))) commit(buildDemoProject(settings))
  }

  const create = async (f: { name: string; lotNumber: string; customer: string; deadline: string }) => {
    const now = new Date().toISOString()
    const p: Project = {
      id: uid('prj-'),
      ...f,
      createdAt: now,
      updatedAt: now,
      customerFiles: [],
      requirements: [],
      questions: [],
      checklistApproved: false,
      participants: [],
      chat: [],
      log: [{ at: now, text: `${t('newProject')}: «${f.name}»` }],
    }
    try {
      await putProject(p)
      location.hash = href(p.id, 'upload')
    } catch (e) {
      setJob({ stage: 'error', error: errMsg(e) })
    }
  }

  const remove = async (id: string) => {
    await deleteProject(id)
    refresh()
  }

  const loaded = project && project.id === route.id ? project : null
  const tab: Tab | null = loaded ? (route.tab ?? defaultTab(loaded)) : null
  const participant = loaded ? (loaded.participants.find((x) => x.id === loaded.activeParticipantId) ?? loaded.participants[0]) : undefined

  const ctx = useMemo<Ctx | null>(
    () =>
      loaded && tab
        ? { t, settings, setSettings, project: loaded, update, participant, setParticipant, tab, go, job, run, openSettings, openDoc, printReport }
        : null,
    [loaded, tab, t, settings, setSettings, update, participant, setParticipant, go, job, run, openSettings, openDoc, printReport],
  )

  const Screen = tab ? SCREENS[tab] : null

  const body = (
    <div className="app min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4">
          <a href="#/" className="py-3 text-lg font-bold tracking-tight text-slate-900">{t('appName')}</a>
          <nav className="order-last -mx-4 flex w-full overflow-x-auto px-4 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:px-0">
            <a href="#/" className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${!route.id ? 'border-blue-600 font-semibold text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
              {t('tab_projects')}
            </a>
            {TABS.map((x) =>
              loaded ? (
                <a key={x} href={href(loaded.id, x)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${tab === x ? 'border-blue-600 font-semibold text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                  {t(`tab_${x}`)}
                </a>
              ) : (
                <span key={x} className="cursor-default whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm text-slate-300">{t(`tab_${x}`)}</span>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 py-2 lg:ml-0">
            {loaded?.isDemo && (
              <span className="flex items-center gap-1">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{t('demoBadge')}</span>
                <Btn kind="ghost" size="sm" icon="refresh" onClick={resetDemo} title={t('resetDemo')}>
                  <span className="hidden sm:inline">{t('resetDemo')}</span>
                </Btn>
              </span>
            )}
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
              {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
                <button
                  key={l}
                  title={LANG_NAMES[l]}
                  className={`px-2 py-1 uppercase ${settings.uiLang === l ? 'bg-blue-600 font-semibold text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => setSettings({ ...settings, uiLang: l })}
                >
                  {l}
                </button>
              ))}
            </div>
            <Btn kind="ghost" icon="settings" onClick={openSettings} title={t('settings')} ariaLabel={t('settings')}>
              <span className="hidden sm:inline">{t('settings')}</span>
            </Btn>
          </div>
        </div>
      </header>

      {job && (
        <div className={`border-b ${job.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm">
            {job.error ? <Icon name="alert" className="h-4 w-4 shrink-0" /> : <Spinner className="h-4 w-4 shrink-0" />}
            <span className="font-medium">{job.error ? t('error') : t('working')}</span>
            {job.stage !== 'error' && <span>{t(job.stage as keyof Dict)}</span>}
            {(job.error || job.detail) && <span className="min-w-0 flex-1 truncate text-xs opacity-80" title={job.error || job.detail}>{job.error || job.detail}</span>}
            {job.error && <Btn kind="ghost" size="sm" className="ml-auto" icon="x" onClick={() => setJob(null)} ariaLabel={t('close')}>{null}</Btn>}
          </div>
          {!job.error && (
            <div className="progress-indeterminate rounded-none" role="progressbar" aria-label={t('working')} />
          )}
        </div>
      )}

      <main>
        {!route.id ? (
          <ProjectsScreen
            t={t}
            projects={projects}
            settings={settings}
            onOpen={(id) => (location.hash = href(id))}
            onCreate={create}
            onDelete={remove}
            onDemo={openDemo}
            aiReady={hasAI(settings)}
            openSettings={openSettings}
          />
        ) : !loaded && missingId === route.id ? (
          <div className="mx-auto max-w-6xl px-4 py-6">
            <Empty icon="search" action={<Btn onClick={() => (location.hash = '#/')}>{t('tab_projects')}</Btn>}>{t('projectNotFound')}</Empty>
          </div>
        ) : !Screen ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500"><Spinner /> {t('loading')}</div>
        ) : (
          <Screen />
        )}
      </main>
    </div>
  )

  return (
    <>
      {ctx ? (
        <AppCtx.Provider value={ctx}>
          {body}
          {doc && loaded && (
            <DocViewer
              key={`${doc.fileId ?? doc.fileName}-${doc.page}-${doc.quote ?? ''}`}
              files={[...loaded.customerFiles, ...loaded.participants.flatMap((x) => x.files)]}
              target={doc}
              onClose={() => setDoc(null)}
              t={t}
            />
          )}
          {printing && <PrintReport />}
        </AppCtx.Provider>
      ) : (
        body
      )}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            setSettings(s)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
