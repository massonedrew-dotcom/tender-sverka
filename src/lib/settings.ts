import type { Settings } from '../types'
import { DEFAULT_K, DEFAULT_WEIGHTS } from './scoring'

const KEY = 'tender-sverka-settings-v1'

/** URL прокси можно «зашить» при сборке (переменная VITE_PROXY_URL) — тогда AI работает по ссылке без ключа. */
const BUILD_PROXY = (import.meta.env.VITE_PROXY_URL as string | undefined) ?? ''

export const MODEL_PRESETS: Record<Settings['provider'], string[]> = {
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5'],
  anthropic: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4.1-mini',
  baseUrl: BUILD_PROXY,
  reviewThreshold: 80,
  weights: { ...DEFAULT_WEIGHTS },
  k: { ...DEFAULT_K },
  reportLang: 'ru',
  uiLang: 'ru',
  ocrPageLimit: 40,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const s = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      baseUrl: s.baseUrl || BUILD_PROXY,
      weights: { ...DEFAULT_SETTINGS.weights, ...(s.weights ?? {}) },
      k: { ...DEFAULT_SETTINGS.k, ...(s.k ?? {}) },
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* приватный режим — настройки живут до перезагрузки */
  }
}

export const hasAI = (s: Settings) => !!(s.apiKey || s.baseUrl)
