import { createContext, useContext } from 'react'
import type { Participant, Project, Settings } from './types'
import type { T } from './i18n'

export type Tab = 'upload' | 'checklist' | 'compare' | 'summary' | 'matrix' | 'history'

export interface Job {
  stage: string
  detail?: string
  error?: string
}

export interface Ctx {
  t: T
  settings: Settings
  setSettings: (s: Settings) => void
  project: Project
  update: (fn: (p: Project) => Project, log?: string) => void
  participant?: Participant
  setParticipant: (id: string) => void
  tab: Tab
  go: (tab: Tab) => void
  job: Job | null
  run: (fn: (progress: (stage: string, detail?: string) => void) => Promise<void>) => Promise<void>
  openSettings: () => void
  openDoc: (fileId: string | undefined, fileName: string, page: number, quote?: string) => void
  printReport: () => void
}

export const AppCtx = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('no ctx')
  return c
}
