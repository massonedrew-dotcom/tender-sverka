// Обращение к LLM прямо из браузера: OpenAI (или совместимый прокси), Google Gemini (OpenAI-совместимый API) и Anthropic Claude
import type { Settings } from '../types'

export interface LLMRequest {
  system: string
  user: string
  /** data:image/...;base64,... */
  images?: string[]
  json?: boolean
  maxTokens?: number
  signal?: AbortSignal
}

export class LLMError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Reasoning-модели OpenAI (o1/o3/o4, gpt-5*): без temperature/seed, с reasoning_effort. gpt-5-chat — обычная чат-модель. */
function isReasoningModel(model: string) {
  return /^(o\d|gpt-5(?!.*-chat))/i.test(model)
}

/** Лимит выходных токенов модели: max_tokens сверх него API отклоняет с ошибкой 400. */
function maxOutput(model: string, wanted: number): number {
  const m = model.toLowerCase()
  let cap = 32768 // gpt-4.1*, неизвестные / OpenAI-совместимые
  if (/^gpt-4o|^gpt-4-turbo/.test(m)) cap = 16384
  else if (/^gpt-3\.5/.test(m)) cap = 4096
  else if (/^gpt-5/.test(m)) cap = 128000
  else if (/^o\d/.test(m)) cap = 100000
  else if (/^claude/.test(m)) cap = 64000
  else if (/^gemini/.test(m)) cap = 65536
  return Math.min(wanted, cap)
}

/** Ошибка, которую бессмысленно повторять (обрезанный ответ, отказ модели). */
function fatal(msg: string): LLMError {
  const e = new LLMError(msg)
  ;(e as LLMError & { status?: number }).status = 422
  return e
}

const TRUNCATED =
  'Ответ модели обрезан по лимиту токенов — фрагмент слишком большой для одного запроса. Уменьшите пакет или выберите модель с большим лимитом вывода'

export const isGemini = (model: string) => /^gemini/i.test(model)
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai'
const JSON_HINT = '\n\nОтветь строго одним JSON-объектом без пояснений и без markdown.'

async function callOpenAI(s: Settings, req: LLMRequest): Promise<string> {
  const gemini = isGemini(s.model)
  const base = (s.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  // Gemini напрямую — свой OpenAI-совместимый адрес; через прокси — общий путь /v1/chat/completions
  const url =
    gemini && !s.baseUrl ? `${GEMINI_BASE}/chat/completions` : /\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const userText = gemini && req.json ? req.user + JSON_HINT : req.user
  const content: unknown = req.images?.length
    ? [{ type: 'text', text: userText }, ...req.images.map((u) => ({ type: 'image_url', image_url: { url: u, detail: 'high' } }))]
    : userText
  const body: Record<string, unknown> = {
    model: s.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content },
    ],
  }
  const maxTokens = maxOutput(s.model, req.maxTokens ?? 16000)
  if (gemini) {
    // OpenAI-совместимый слой Gemini: max_tokens, без seed и json_object (JSON требуем в промпте)
    body.max_tokens = maxTokens
    body.temperature = 0
    body.reasoning_effort = 'low'
  } else {
    body.max_completion_tokens = maxTokens
    if (isReasoningModel(s.model)) body.reasoning_effort = 'low'
    else {
      // воспроизводимость (ТЗ 10): детерминированная выборка
      body.temperature = 0
      body.seed = 42
    }
    if (req.json) body.response_format = { type: 'json_object' }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.apiKey) headers.Authorization = `Bearer ${s.apiKey}`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal })
  if (!res.ok) throw await httpError(res)
  const data = await res.json()
  const choice = data?.choices?.[0]
  if (choice?.message?.refusal) throw fatal(`Модель отказалась отвечать: ${choice.message.refusal}`)
  if (choice?.finish_reason === 'length') throw fatal(TRUNCATED)
  if (choice?.finish_reason === 'content_filter') throw fatal('Ответ модели заблокирован фильтром содержимого')
  const text = choice?.message?.content
  if (typeof text !== 'string' || !text) throw new LLMError('Пустой ответ модели')
  return text
}

async function callAnthropic(s: Settings, req: LLMRequest): Promise<string> {
  const base = (s.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const url = /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`
  const content: unknown[] = []
  for (const img of req.images ?? []) {
    const m = img.match(/^data:([^;]+);base64,(.*)$/)
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  }
  content.push({ type: 'text', text: req.user + (req.json ? '\n\nОтветь строго одним JSON-объектом без пояснений и без markdown.' : '') })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  if (s.apiKey) headers['x-api-key'] = s.apiKey
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: s.model,
      max_tokens: maxOutput(s.model, req.maxTokens ?? 16000),
      system: req.system,
      messages: [{ role: 'user', content }],
    }),
    signal: req.signal,
  })
  if (!res.ok) throw await httpError(res)
  const data = await res.json()
  if (data?.stop_reason === 'max_tokens') throw fatal(TRUNCATED)
  if (data?.stop_reason === 'refusal') throw fatal('Модель отказалась отвечать на запрос')
  const text = (data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  if (!text) throw new LLMError('Пустой ответ модели')
  return text
}

async function httpError(res: Response): Promise<LLMError> {
  let msg = `${res.status} ${res.statusText}`
  try {
    const j = await res.json()
    msg += ': ' + (j?.error?.message ?? JSON.stringify(j).slice(0, 300))
  } catch {
    /* ignore */
  }
  const e = new LLMError(msg)
  ;(e as LLMError & { status?: number }).status = res.status
  return e
}

export async function callLLM(s: Settings, req: LLMRequest): Promise<string> {
  if (!s.apiKey && !s.baseUrl) throw new LLMError('Не задан API-ключ или адрес прокси (Настройки)')
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return s.provider === 'anthropic' && !isGemini(s.model) ? await callAnthropic(s, req) : await callOpenAI(s, req)
    } catch (e) {
      last = e
      const st = (e as { status?: number }).status
      if (req.signal?.aborted) throw e
      if (st && st !== 429 && st < 500) throw e
      await sleep(1500 * 2 ** attempt)
    }
  }
  throw last
}

export function parseJSON<T>(raw: string): T {
  let t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1]
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a >= 0 && b > a) t = t.slice(a, b + 1)
  try {
    return JSON.parse(t) as T
  } catch {
    // мягкий ремонт: хвостовые запятые
    return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')) as T
  }
}

export async function callJSON<T>(s: Settings, req: LLMRequest): Promise<T> {
  const raw = await callLLM(s, { ...req, json: true })
  try {
    return parseJSON<T>(raw)
  } catch {
    // одна повторная попытка
    const raw2 = await callLLM(s, { ...req, json: true, user: req.user + '\n\nПредыдущий ответ не был валидным JSON. Верни только корректный JSON.' })
    return parseJSON<T>(raw2)
  }
}

/** Параллельное выполнение с ограничением. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}
