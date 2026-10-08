# Прокси для AI на Cloudflare Workers (бесплатно)

Зачем он нужен. Приложение «Тендер-Сверка» — статичный сайт на GitHub Pages, своего сервера у него нет.
AI-ключ нельзя класть в код сайта: его увидит любой посетитель. Прокси — маленькая программа
на серверах Cloudflare. Ключ хранится у неё в секрете, а браузер отправляет запросы к AI через неё.

```
Браузер (GitHub Pages) ──► Cloudflare Worker (ключ в секрете) ──► Google Gemini / OpenAI / Anthropic
```

Бесплатного тарифа Cloudflare Workers (100 000 запросов в сутки) для MVP хватает с большим запасом.
Банковская карта не нужна.

**Полностью бесплатно:** Cloudflare Workers (бесплатно) + Google Gemini (бесплатный тариф AI Studio, без карты).
OpenAI и Claude — платные (оплата за токены), их можно подключить позже тем же прокси.

> ⚠ На бесплатном тарифе Gemini Google может использовать присланные данные для улучшения своих продуктов.
> Для демо и тестовых документов это нормально; для реальных конфиденциальных тендеров включите платный тариф
> (Billing в AI Studio) — тогда данные не используются.

Что делает прокси (`worker.js`):

- принимает только `POST /v1/chat/completions` (Gemini/OpenAI) и `POST /v1/messages` (Anthropic), всё остальное отклоняет;
- если на прокси есть только ключ Gemini, а сайт просит модель OpenAI, — сам переключает запрос на Gemini (`GEMINI_MODEL`, по умолчанию `gemini-3.8-flash`);
- сам подставляет ключ из секрета, а ключи, присланные браузером, отбрасывает;
- отвечает только сайтам из списка `ALLOWED_ORIGINS` (CORS);
- не пропускает запросы больше 20 МБ;
- пропускает только модели из списка `ALLOWED_MODELS`, чтобы ключ не потратили на дорогие модели;
- `GET /` показывает, какие ключи настроены (сами ключи не показывает).

---

## Шаг 1. Регистрация в Cloudflare

1. Откройте <https://dash.cloudflare.com/sign-up> и зарегистрируйтесь по e-mail.
2. Подтвердите e-mail по ссылке из письма.
3. Домен покупать не нужно: воркер получит бесплатный адрес вида `https://<имя>.<ваш-поддомен>.workers.dev`.

## Шаг 2. Бесплатный ключ Google Gemini

1. Откройте <https://aistudio.google.com/apikey> и войдите Google-аккаунтом (Gmail).
2. Нажмите **Create API key** (при первом входе примите условия). Скопируйте ключ — он начинается с `AIza...`.
3. Ничего оплачивать не нужно: ключ сразу работает на бесплатном тарифе (есть лимиты запросов в минуту/сутки — для демо хватает).

*Необязательно, платно:* ключ OpenAI — <https://platform.openai.com/api-keys> (**Create new secret key**, `sk-...`),
обязательно поставьте лимит расходов: <https://platform.openai.com/settings/organization/limits>.

## Шаг 3. Создание воркера

Подойдёт любой из двух способов.

### Способ А: через сайт, без установки программ

1. В дашборде Cloudflare откройте **Compute (Workers) → Workers & Pages** и нажмите **Create** (**Create application**).
2. Выберите **Start with Hello World!** (Create Worker), задайте имя, например `tender-sverka-proxy`, и нажмите **Deploy**.
3. Нажмите **Edit code**. Удалите весь код в редакторе, вставьте содержимое файла [`worker.js`](./worker.js) целиком
   и нажмите **Deploy** справа вверху.
4. Перейдите в **Settings → Variables and Secrets** и нажмите **Add**:
   - **Type: Secret**, имя `GEMINI_API_KEY`, значение: ваш ключ `AIza...`. Сохраните (**Deploy**).
   - если есть платный ключ OpenAI: **Secret** `OPENAI_API_KEY` (`sk-...`);
   - если нужен Claude: ещё один **Secret** `ANTHROPIC_API_KEY`;
   - **Type: Text**, имя `ALLOWED_ORIGINS`, значение: адрес вашего сайта, например
     `https://<user>.github.io,http://localhost:*`. Без этой переменной разрешены все `*.github.io` и localhost;
   - **Type: Text**, имя `ALLOWED_MODELS`, значение, например,
     `gemini-*,gpt-4.1-mini*,gpt-4o-mini*`. **Без этой переменной разрешены любые модели.**
5. Скопируйте адрес воркера со страницы **Overview**, например `https://tender-sverka-proxy.myname.workers.dev`.

### Способ Б: через командную строку (wrangler)

Нужен установленный Node.js 20+.

```bash
cd proxy
npx wrangler login                        # откроет браузер для входа в Cloudflare
npx wrangler deploy                       # создаст воркер по wrangler.toml
npx wrangler secret put GEMINI_API_KEY    # вставьте ключ AIza..., когда попросит
npx wrangler secret put OPENAI_API_KEY    # необязательно (платно)
npx wrangler secret put ANTHROPIC_API_KEY # необязательно
```

`ALLOWED_ORIGINS` и `ALLOWED_MODELS` задаются в [`wrangler.toml`](./wrangler.toml), в разделе `[vars]`.
При каждом `wrangler deploy` они перезаписывают значения из дашборда. Ключи в `wrangler.toml` не пишите.

## Шаг 4. Проверка

Откройте адрес воркера в браузере. Ответ должен быть таким:

```json
{"ok":true,"service":"tender-sverka-proxy","gemini":true,"openai":false,"anthropic":false}
```

Если `"gemini": false`, секрет `GEMINI_API_KEY` не сохранился: повторите шаг 3.4.

Проверка запроса к модели из терминала (подставьте свой адрес):

```bash
curl -s https://tender-sverka-proxy.myname.workers.dev/v1/chat/completions \
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"Скажи OK"}]}'
```

## Шаг 5. Подключение к приложению

Подойдёт любой из двух вариантов.

- **Для всех посетителей сайта.** В репозитории на GitHub откройте **Settings → Secrets and variables → Actions → Variables**,
  нажмите **New repository variable**, задайте имя `PROXY_URL` и значение: адрес воркера, без `/v1` на конце.
  Затем перезапустите деплой (**Actions → Deploy to GitHub Pages → Run workflow**). Сайт сразу будет работать с AI, ключ вводить не нужно.
- **Только для себя.** В приложении откройте **Настройки**, оставьте поле «API-ключ» пустым, а в поле
  «Адрес API / прокси» (baseUrl) вставьте адрес воркера. Провайдер: Google Gemini (или OpenAI, если на прокси есть его ключ). Модель — из разрешённых в `ALLOWED_MODELS`.

## Частые ошибки

| Сообщение | Что сделать |
|---|---|
| `Origin не разрешён: https://...` | Добавьте адрес сайта в `ALLOWED_ORIGINS` (только схема и домен, без пути `/repo/`). |
| `Модель «gpt-5» запрещена на прокси` | Выберите в настройках разрешённую модель или добавьте её в `ALLOWED_MODELS`. |
| `На прокси не задан ни GEMINI_API_KEY, ни OPENAI_API_KEY` | Добавьте секрет (шаг 3.4) и нажмите Deploy. |
| `429` / `RESOURCE_EXHAUSTED` от Gemini | Превышен бесплатный лимит запросов в минуту — подождите минуту и повторите. |
| `429` / `insufficient_quota` | Закончился баланс или сработал лимит OpenAI: пополните баланс на platform.openai.com. |
| Ошибка CORS в консоли браузера | Проверьте, что адрес прокси указан без лишнего пути и что сайт есть в `ALLOWED_ORIGINS`. |

## Безопасность: что важно понимать

- Ключ хранится только в секретах Cloudflare. Его нет ни в репозитории, ни в коде сайта.
- `ALLOWED_ORIGINS` защищает только от чужих сайтов в браузере. Скрипт вне браузера может подделать заголовок `Origin`.
  Поэтому обязательно задайте лимит расходов в OpenAI и ограничьте `ALLOWED_MODELS`.
- Если ключ скомпрометирован, удалите его на platform.openai.com, создайте новый и обновите секрет воркера.
