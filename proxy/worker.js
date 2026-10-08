// Тендер-Сверка — прокси к Google Gemini / OpenAI / Anthropic на Cloudflare Workers (бесплатный тариф).
// Ключи хранятся как секреты воркера (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY) и никогда не попадают в браузер.
// GEMINI_API_KEY — бесплатный ключ Google AI Studio: https://aistudio.google.com/apikey
//
// Маршруты:
//   POST /v1/chat/completions → Gemini (модели gemini-*, секрет GEMINI_API_KEY) или https://api.openai.com (OPENAI_API_KEY).
//                               Если задан только один из ключей — модель подменяется на GEMINI_MODEL / OPENAI_MODEL.
//   POST /v1/messages         → https://api.anthropic.com/v1/messages        (секрет ANTHROPIC_API_KEY)
//   GET  /                    → проверка состояния (какие ключи настроены), без секретов
//
// Переменные (Settings → Variables, или [vars] в wrangler.toml):
//   ALLOWED_ORIGINS — сайты, которым разрешено обращаться к прокси, через запятую.
//                     Поддерживается «*»: https://*.github.io, http://localhost:*. Одна «*» — разрешить всем.
//                     По умолчанию: https://*.github.io, http://localhost:*, http://127.0.0.1:*
//   ALLOWED_MODELS  — разрешённые модели через запятую, «*» в конце — любой суффикс (gpt-4.1-mini*).
//                     Пусто — любые модели (не рекомендуется: ключ могут потратить на дорогие модели).
//   OPENAI_BASE_URL — необязательно: другой OpenAI-совместимый адрес (по умолчанию https://api.openai.com)
//
// Без зависимостей. Формат — ES-модуль (можно вставить в редактор кода на дашборде Cloudflare).

const MAX_BODY = 20 * 1024 * 1024 // 20 МБ — с запасом на скан-страницы для OCR
const DEFAULT_ORIGINS = 'https://*.github.io,http://localhost:*,http://127.0.0.1:*'

const ROUTES = {
  '/v1/chat/completions': { provider: 'openai', secret: 'OPENAI_API_KEY' },
  '/v1/messages': { provider: 'anthropic', secret: 'ANTHROPIC_API_KEY' },
}

const ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-api-key',
  'anthropic-version',
  'anthropic-beta',
  'anthropic-dangerous-direct-browser-access',
].join(', ')

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const origin = request.headers.get('Origin') || ''
    const allowed = originAllowed(origin, env.ALLOWED_ORIGINS)
    const cors = corsHeaders(allowed && origin ? origin : null)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!allowed || !ROUTES[path]) return new Response(null, { status: 403, headers: { Vary: 'Origin' } })
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': ALLOW_HEADERS,
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    // Проверка состояния: открыть URL воркера в браузере
    if (request.method === 'GET' && path === '/') {
      return json(200, { ok: true, service: 'tender-sverka-proxy', gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, anthropic: !!env.ANTHROPIC_API_KEY }, cors)
    }

    const route = ROUTES[path]
    if (!route) return fail(404, 'Not found. Прокси принимает только POST /v1/chat/completions и POST /v1/messages', cors)
    if (request.method !== 'POST') return fail(405, 'Method not allowed: только POST', { ...cors, Allow: 'POST, OPTIONS' })
    if (!allowed) return fail(403, `Origin не разрешён: ${origin || '(нет заголовка Origin)'}. Добавьте сайт в переменную ALLOWED_ORIGINS воркера`, cors)

    // Ограничение размера тела
    const declared = Number(request.headers.get('Content-Length') || 0)
    if (declared > MAX_BODY) return fail(413, 'Слишком большой запрос (лимит прокси 20 МБ)', cors)
    let body = await request.arrayBuffer()
    if (body.byteLength > MAX_BODY) return fail(413, 'Слишком большой запрос (лимит прокси 20 МБ)', cors)
    let payload
    try {
      payload = JSON.parse(new TextDecoder().decode(body))
    } catch {
      return fail(400, 'Тело запроса должно быть JSON', cors)
    }

    // Выбор провайдера для /v1/chat/completions: Gemini (бесплатный тариф) или OpenAI — по модели и настроенным ключам
    let provider = route.provider
    let key = env[route.secret]
    if (route.provider === 'openai') {
      const wantGemini = /^gemini/i.test(String(payload.model ?? ''))
      if (wantGemini && env.GEMINI_API_KEY) provider = 'gemini'
      else if (!wantGemini && env.OPENAI_API_KEY) provider = 'openai'
      else if (env.GEMINI_API_KEY) {
        // сайт просит модель OpenAI, а на прокси только ключ Gemini — подменяем модель
        provider = 'gemini'
        payload.model = env.GEMINI_MODEL || 'gemini-3.8-flash'
      } else if (env.OPENAI_API_KEY) {
        payload.model = env.OPENAI_MODEL || 'gpt-4.1-mini'
      }
      key = provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY
      if (!key) return fail(500, 'На прокси не задан ни GEMINI_API_KEY, ни OPENAI_API_KEY (Settings → Variables and Secrets)', cors)
      if (provider === 'gemini') toGemini(payload)
      body = new TextEncoder().encode(JSON.stringify(payload))
    } else if (!key) return fail(500, `На прокси не задан секрет ${route.secret} (Settings → Variables and Secrets)`, cors)

    // Ограничитель моделей (по итоговой модели)
    const model = String(payload.model ?? '')
    if (!model) return fail(400, 'В запросе не указана модель (model)', cors)
    const allowList = list(env.ALLOWED_MODELS)
    if (allowList.length && !allowList.some((p) => wildcard(p).test(model)))
      return fail(403, `Модель «${model}» запрещена на прокси. Разрешены: ${allowList.join(', ')} (переменная ALLOWED_MODELS)`, cors)

    // Заголовки к провайдеру собираются заново: клиентские Authorization / x-api-key отбрасываются
    const headers = new Headers({ 'Content-Type': 'application/json' })
    let target
    if (provider === 'gemini') {
      target = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      headers.set('Authorization', `Bearer ${key}`)
    } else if (provider === 'openai') {
      target = `${(env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '')}/v1/chat/completions`
      headers.set('Authorization', `Bearer ${key}`)
    } else {
      target = 'https://api.anthropic.com/v1/messages'
      headers.set('x-api-key', key)
      headers.set('anthropic-version', request.headers.get('anthropic-version') || '2023-06-01')
      const beta = request.headers.get('anthropic-beta')
      if (beta) headers.set('anthropic-beta', beta)
    }

    let upstream
    try {
      upstream = await fetch(target, { method: 'POST', headers, body })
    } catch (e) {
      return fail(502, `Провайдер недоступен: ${e instanceof Error ? e.message : String(e)}`, cors)
    }

    const out = new Headers(cors)
    out.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json')
    for (const h of ['retry-after', 'x-request-id', 'request-id']) {
      const v = upstream.headers.get(h)
      if (v) out.set(h, v)
    }
    out.set('Access-Control-Expose-Headers', 'retry-after, x-request-id, request-id')
    return new Response(upstream.body, { status: upstream.status, headers: out })
  },
}

/** Приводит запрос OpenAI к OpenAI-совместимому слою Gemini: max_tokens, без seed и json_object (JSON просим в тексте). */
function toGemini(p) {
  if (p.max_completion_tokens && !p.max_tokens) p.max_tokens = Math.min(p.max_completion_tokens, 65536)
  delete p.max_completion_tokens
  delete p.seed
  if (p.response_format?.type === 'json_object') {
    delete p.response_format
    const last = [...(p.messages ?? [])].reverse().find((m) => m.role === 'user')
    const hint = '\n\nОтветь строго одним JSON-объектом без пояснений и без markdown.'
    if (last && typeof last.content === 'string') last.content += hint
    else if (last && Array.isArray(last.content)) {
      const part = last.content.find((c) => c.type === 'text')
      if (part) part.text += hint
    }
  }
  p.reasoning_effort = 'low'
  if (p.temperature === undefined) p.temperature = 0
}

function list(v) {
  return String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Шаблон с «*» → RegExp (без учёта регистра). */
function wildcard(pattern) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${esc}$`, 'i')
}

function originAllowed(origin, setting) {
  const patterns = list(setting === undefined || String(setting).trim() === '' ? DEFAULT_ORIGINS : setting)
  if (patterns.includes('*')) return true
  if (!origin) return false
  return patterns.some((p) => {
    // «http://localhost:*» разрешает и адрес без порта
    if (p.endsWith(':*') && origin === p.slice(0, -2)) return true
    // «*» в имени хоста — один или несколько поддоменов, без «/»
    const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')
    return new RegExp(`^${esc}$`, 'i').test(origin)
  })
}

function corsHeaders(origin) {
  const h = { Vary: 'Origin' }
  if (origin) h['Access-Control-Allow-Origin'] = origin
  return h
}

function json(status, data, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } })
}

/** Ошибка в формате, совместимом с OpenAI/Anthropic ({error:{message}}) — приложение покажет текст пользователю. */
function fail(status, message, headers) {
  return json(status, { error: { type: 'proxy_error', message } }, headers)
}
