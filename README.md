# Design Review — дизайн-ревью прямо на сайте 🎯

[🇷🇺 Русская версия](#-русская-версия) | [🇬🇧 English version](#-english-version)

---

## 🇷🇺 Русская версия

Расширение для Chrome, чтобы делать дизайн-ревью свёрстанных страниц. Наводите на элемент как в DevTools, подписываете, что не так, ставите критичность — и выгружаете отчёт в HTML или PDF со скринами, маркерами, селекторами и стилями.

> 🚧 **Статус: в разработке.** До первого релиза описание отражает целевое поведение.

### Оглавление

- [Возможности](#возможности)
- [Технологии](#-технологии)
- [Быстрый старт](#-быстрый-старт)
- [Тестирование](#-тестирование)
- [Архитектура](#-архитектура)
- [Разрешения и приватность](#-разрешения-и-приватность)
- [Гайд: новое поле в тултипе](#-гайд-новое-поле-в-тултипе)
- [Гайд: новый формат экспорта](#-гайд-новый-формат-экспорта)
- [Open source и вклад](#-open-source-и-вклад)
- [Полезные команды](#-полезные-команды)

### Возможности

- **Пикер как в DevTools** — подсветка box-model (margin / border / padding / content) и тултип: размеры, шрифт, цвета, отступы, radius
- **Навигация по дереву** — `↑` родитель, `↓` ребёнок, `←` `→` соседи
- **Выделение области** — для проблем «между» элементами
- **Снимок страницы** — сразу (`F`) или с таймером (`Shift+F`, 3 / 5 / 10 с): hover-меню, дропдауны и кадры анимаций остаются на месте
- **Замечания** — текст, критичность (blocker / major / minor), стили элемента, номер-маркер на странице
- **Сессии по домену или по странице** — пройдите весь сайт одной сессией, потом сузьте до страницы
- **Экспорт** — самодостаточный HTML (открывается офлайн) и PDF
- **Local-first** — без серверов, аналитики и сетевых запросов
- **RU / EN** — интерфейс и отчёт

### 🛠️ Технологии

React 19 · TypeScript · Vite + `@crxjs/vite-plugin` · Manifest V3 · Tailwind v4 · Floating UI · Zustand · Zod · i18next · IndexedDB (`idb`) · pdfmake · Biome · Vitest · Playwright

### ⚡ Быстрый старт

```bash
corepack enable
yarn install
yarn dev
```

Откройте `chrome://extensions`, включите «Режим разработчика», «Загрузить распакованное» → папка `dist/`.

Откройте любой сайт → иконка расширения → «Начать ревью» (или `Alt+Shift+R`).

### 🧪 Тестирование

| Команда | Что делает |
|---|---|
| `yarn test` | Vitest: unit и контракт-тесты |
| `yarn test:coverage` | То же с порогами покрытия |
| `yarn build:e2e` | Сборка для e2e в `dist-e2e/` — **обязательна перед Playwright** |
| `yarn test:e2e:local` | Playwright на локальной фикстуре-сайте (`tests/fixtures/site`) |
| `yarn test:e2e:update-snapshots` | Обновить локальные визуальные бейзлайны (mac) |

Визуальные бейзлайны хранятся отдельно для `chromium-mac/` и `chromium-ci/`. Бейзлайны CI обновляются только через воркфлоу `Update Visual Snapshots`.

Почему отдельная e2e-сборка: Playwright не умеет кликать по иконке расширения, а без клика Chrome не выдаёт `activeTab`. В `dist-e2e/` добавлены host permissions и тестовый хук; в прод-сборку это не попадает — проверяется контракт-тестом.

### 🧩 Архитектура

```
popup ──┐                         ┌── report page (HTML / PDF)
        ├── messages ── background ┤
content ┘   (Zod)      (IDB, capture, inject)
   │
   └── Shadow DOM: тулбар, пикер, снимок, область, форма, панель, маркеры
```

| Где | Что |
|---|---|
| `src/background/` | Хоткей, инъекция content script, `captureVisibleTab`, IndexedDB, переезд сессий |
| `src/content/` | Весь UI на странице внутри Shadow DOM, пикер (живой DOM и снимок), кроп |
| `src/popup/` | Старт ревью, недавние сессии, настройки |
| `src/report/` | Страница отчёта: превью, экспорт HTML и PDF |
| `src/ui/` | Свои UI-примитивы на Tailwind + Floating UI |
| `src/shared/` | Модель, Zod-схемы, типизированные сообщения, ключ сессии |

Правила, которые важно не нарушать:

- **IndexedDB трогает только background.** Остальные — через сообщения из `src/shared/messaging.ts`.
- **Всё наше на странице — внутри Shadow DOM.** Без `rem` (сайты меняют базовый размер шрифта), всплывающие элементы — только внутри нашего shadow root.
- **Данные со страницы — недоверенные.** Никакого `innerHTML` со строками сайта.

### 🔐 Разрешения и приватность

| Разрешение | Зачем |
|---|---|
| `activeTab` | Доступ к текущей вкладке только после вашего клика или хоткея |
| `scripting` | Показать панель ревью на этой вкладке |
| `storage` | Настройки и позиция тулбара |
| `unlimitedStorage` | Скриншоты в локальной базе без лимита |

Никаких host permissions: расширение не видит сайты, пока вы сами не запустили ревью. Ничего не уходит в сеть. Подробнее — [privacy.html](privacy.html).

### 🧪 Гайд: новое поле в тултипе

1. Добавьте ключ поля в `TooltipField` (`src/shared/model.ts`) и в Zod-схему настроек.
2. Опишите сбор значения в `src/content/styles.ts` — из `getComputedStyle`, с учётом формата цвета и единиц из настроек.
3. Добавьте строку в тултип и в блок «Стили элемента» формы.
4. Добавьте чекбокс в настройки и строки i18n в `en` и `ru`.
5. Убедитесь, что поле попадает в снимок (`picker/snapshot.ts`) и в отчёт.
6. Unit-тест на сбор значения + обновлённый визуальный снапшот тултипа.

### 🧪 Гайд: новый формат экспорта

1. Создайте `src/report/<format>.ts`, реализующий `ReportRenderer` (вход — сессия, замечания, blobs, язык; выход — `Blob` и имя файла).
2. Зарегистрируйте формат на странице отчёта и добавьте кнопку.
3. Строки — через i18next отчёта.
4. Тяжёлые зависимости — только в бандл страницы отчёта, не в content script.
5. Unit-тест на рендер + e2e на скачивание.

### 🤝 Open source и вклад

Проект открыт под [MIT](LICENSE). PR приветствуются — подробности в [CONTRIBUTING.md](CONTRIBUTING.md).

### 🧰 Полезные команды

```bash
yarn dev            # дев-сборка
yarn build          # прод-сборка + zip в release/
yarn check          # Biome: линт + формат
yarn test           # unit + контракты
yarn build:e2e && yarn test:e2e:local
```

---

## 🇬🇧 English version

A Chrome extension for design review of live web pages. Hover elements the way DevTools does, write what's wrong, set a severity, and export an HTML or PDF report with screenshots, markers, selectors and styles.

> 🚧 **Status: in development.** Until the first release this README describes the target behaviour.

### Table of contents

- [Features](#features)
- [Tech stack](#️-tech-stack)
- [Quick start](#-quick-start)
- [Testing](#-testing)
- [Architecture](#-architecture)
- [Permissions and privacy](#-permissions-and-privacy)
- [Guide: add a tooltip field](#-guide-add-a-tooltip-field)
- [Guide: add an export format](#-guide-add-an-export-format)
- [Open source and contributing](#-open-source-and-contributing)
- [Useful commands](#-useful-commands)

### Features

- **DevTools-style picker** — box-model highlight (margin / border / padding / content) and a tooltip with size, font, colors, spacing, radius
- **Tree navigation** — `↑` parent, `↓` child, `←` `→` siblings
- **Area select** — for issues *between* elements
- **Page snapshot** — now (`F`) or on a timer (`Shift+F`, 3 / 5 / 10 s): hover menus, dropdowns and animation frames stay put
- **Issues** — text, severity (blocker / major / minor), element styles, numbered marker on the page
- **Sessions per domain or per page** — review the whole site in one session, then narrow down to a page
- **Export** — self-contained HTML (works offline) and PDF
- **Local-first** — no servers, analytics or network requests
- **EN / RU** — UI and report

### 🛠️ Tech stack

React 19 · TypeScript · Vite + `@crxjs/vite-plugin` · Manifest V3 · Tailwind v4 · Floating UI · Zustand · Zod · i18next · IndexedDB (`idb`) · pdfmake · Biome · Vitest · Playwright

### ⚡ Quick start

```bash
corepack enable
yarn install
yarn dev
```

Open `chrome://extensions`, enable Developer mode, "Load unpacked" → `dist/`.

Open any site → extension icon → "Start review" (or `Alt+Shift+R`).

### 🧪 Testing

| Command | What it does |
|---|---|
| `yarn test` | Vitest: unit and contract tests |
| `yarn test:coverage` | Same, with coverage thresholds |
| `yarn build:e2e` | E2E build into `dist-e2e/` — **required before Playwright** |
| `yarn test:e2e:local` | Playwright against the local fixture site (`tests/fixtures/site`) |
| `yarn test:e2e:update-snapshots` | Refresh local visual baselines (mac) |

Visual baselines are stored separately for `chromium-mac/` and `chromium-ci/`. CI baselines are refreshed only via the `Update Visual Snapshots` workflow.

Why a separate E2E build: Playwright cannot click the extension icon, and without that click Chrome never grants `activeTab`. `dist-e2e/` adds host permissions and a test hook; neither reaches the production build — a contract test checks it.

### 🧩 Architecture

```
popup ──┐                         ┌── report page (HTML / PDF)
        ├── messages ── background ┤
content ┘   (Zod)      (IDB, capture, inject)
   │
   └── Shadow DOM: toolbar, picker, snapshot, area, form, panel, markers
```

| Where | What |
|---|---|
| `src/background/` | Hotkey, content script injection, `captureVisibleTab`, IndexedDB, session migration |
| `src/content/` | All on-page UI inside a Shadow DOM, picker (live DOM and snapshot), cropping |
| `src/popup/` | Start review, recent sessions, settings |
| `src/report/` | Report page: preview, HTML and PDF export |
| `src/ui/` | Our UI primitives on Tailwind + Floating UI |
| `src/shared/` | Model, Zod schemas, typed messages, session key |

Rules worth not breaking:

- **Only the background touches IndexedDB.** Everyone else goes through messages from `src/shared/messaging.ts`.
- **Everything we render on a page lives inside a Shadow DOM.** No `rem` (sites change the root font size); floating elements only inside our shadow root.
- **Page data is untrusted.** No `innerHTML` with strings taken from the site.

### 🔐 Permissions and privacy

| Permission | Why |
|---|---|
| `activeTab` | Access to the current tab only after your click or hotkey |
| `scripting` | Show the review UI on that tab |
| `storage` | Settings and toolbar position |
| `unlimitedStorage` | Screenshots in the local database without a quota |

No host permissions: the extension cannot see any site until you start a review there. Nothing is sent over the network. Details — [privacy.html](privacy.html).

### 🧪 Guide: add a tooltip field

1. Add the field key to `TooltipField` (`src/shared/model.ts`) and to the settings Zod schema.
2. Read the value in `src/content/styles.ts` from `getComputedStyle`, honouring the color format and units settings.
3. Add a row to the tooltip and to the issue form's "Element styles" block.
4. Add a checkbox to settings and i18n strings in `en` and `ru`.
5. Make sure the field is captured in snapshots (`picker/snapshot.ts`) and rendered in the report.
6. Unit test for the value + updated tooltip visual snapshot.

### 🧪 Guide: add an export format

1. Create `src/report/<format>.ts` implementing `ReportRenderer` (input: session, issues, blobs, language; output: a `Blob` and a file name).
2. Register the format on the report page and add a button.
3. Strings go through the report's i18next instance.
4. Heavy dependencies belong to the report page bundle only, never to the content script.
5. Unit test for rendering + E2E test for the download.

### 🤝 Open source and contributing

Released under [MIT](LICENSE). PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

### 🧰 Useful commands

```bash
yarn dev            # dev build
yarn build          # production build + zip in release/
yarn check          # Biome: lint + format
yarn test           # unit + contracts
yarn build:e2e && yarn test:e2e:local
```
