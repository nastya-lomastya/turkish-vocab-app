# Türkçe Kelimeler — личный тренажёр турецкой лексики

Next.js-приложение: слова хранятся в Postgres (Neon), переводы и разбор форм
глаголов идут через Claude API (ключ живёт только на сервере), доступ закрыт
одним общим паролем.

## 1. Локальная настройка

```bash
npm install
cp .env.example .env.local
```

Открой `.env.local` и заполни:

- `DATABASE_URL` — connection string из Neon (см. шаг 2)
- `ANTHROPIC_API_KEY` — ключ с https://platform.claude.com (Console → API Keys)
- `APP_PASSWORD` — пароль, который будешь вводить в браузере
- `SESSION_SECRET` — любая длинная случайная строка (просто придумай, никому не нужно её знать)

Запуск для разработки:

```bash
npm run dev
```

Открой http://localhost:3000 — попросит пароль, дальше обычный интерфейс.

## 2. База данных (Neon)

Самый простой путь — через сам Vercel:

1. В проекте на vercel.com открой вкладку **Storage**
2. **Create Database → Postgres (Neon)**
3. Vercel сам создаст базу и предложит подключить её к проекту —
   тогда `DATABASE_URL` автоматически появится в переменных окружения проекта,
   вручную вставлять не придётся.

Если хочешь сделать это отдельно от Vercel — можно завести базу на neon.tech
напрямую и просто скопировать connection string оттуда в `DATABASE_URL`.

Таблица создастся сама при первом запросе — ничего руками накатывать не нужно.

## 3. Git + GitHub

```bash
cd turkish-vocab-app
git init
git add .
git commit -m "Первый коммит: тренажёр турецкой лексики"
```

Дальше на github.com создай пустой репозиторий (без README, без .gitignore —
они уже есть) и подключи его:

```bash
git remote add origin git@github.com:<твой-юзернейм>/turkish-vocab-app.git
git branch -M main
git push -u origin main
```

## 4. Vercel

1. На vercel.com → **Add New → Project** → выбери репозиторий из GitHub
2. Vercel сам распознает Next.js, ничего в настройках сборки менять не нужно
3. Перед первым деплоем (или сразу после) зайди в **Settings → Environment
   Variables** и добавь те же четыре переменные, что в `.env.local`:
   `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET`
   (если базу создавал через Storage-таб — DATABASE_URL там уже будет)
4. Deploy

После деплоя Vercel даст ссылку вида `turkish-vocab-app.vercel.app` —
открываешь, вводишь пароль, пользуешься с телефона и с компьютера одинаково.

## Дальнейшая работа

Дальше это обычный git-репозиторий: правишь код в VS Code, коммитишь,
`git push` — Vercel сам пересобирает и обновляет продакшн за 30–60 секунд.
Для локальной проверки перед пушем — `npm run dev`.

## Структура проекта

```
app/
  page.tsx              — главная страница (рендерит VocabTrainer)
  login/page.tsx         — страница входа по паролю
  api/words/route.ts     — список слов, добавление
  api/words/[id]/route.ts — обновление форм/статистики, удаление
  api/claude/route.ts     — прокси к Anthropic API (ключ только здесь)
  api/login/route.ts      — проверка пароля, выдача cookie
components/
  VocabTrainer.tsx        — вся логика и разметка приложения
lib/
  db.ts                   — подключение к Neon, создание таблицы
  auth.ts                 — вычисление токена сессии
proxy.ts                  — проверка cookie на каждый запрос (защита паролем)
```
