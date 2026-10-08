// Хранение проектов в IndexedDB браузера (без сервера)
import { createStore, del, entries, get, set } from 'idb-keyval'
import type { Project } from '../types'

const store = createStore('tender-sverka', 'projects')

export async function listProjects(): Promise<Project[]> {
  try {
    const all = await entries<string, Project>(store)
    return all.map(([, p]) => p).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export const getProject = (id: string) => get<Project>(id, store)
export const putProject = (p: Project) => set(p.id, p, store)
export const deleteProject = (id: string) => del(id, store)
