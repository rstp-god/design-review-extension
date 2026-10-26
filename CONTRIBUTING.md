# Contributing to Design Review

[🇷🇺 Русская версия](#-как-внести-вклад) | [🇬🇧 English version](#-how-to-contribute)

---

## 🇷🇺 Как внести вклад

Design Review — open source под лицензией [MIT](LICENSE). Pull request'ы приветствуются: фиксы, новые поля тултипа, форматы экспорта, переводы, улучшения пикера. Отдельный форк поддерживать не нужно — присылайте PR прямо в этот репозиторий, мейнтейнер ревьюит, вливает и выкатывает в Chrome Web Store.

### Как прислать PR

1. Сделайте форк и ветку. Имя ветки — `feature/<что-делает>` или `fix/<что-чинит>`, по смыслу, а не по номеру задачи (иначе CI не пропустит префикс, а ревьюер не поймёт суть).
2. `corepack enable && yarn install`. Разработка: `yarn dev`, затем загрузите `dist/` как распакованное расширение в `chrome://extensions`.
3. Перед PR прогоните `yarn check`, `yarn test` и `yarn build`. Если меняли что-то на странице (пикер, overlay, снимок) — ещё `yarn build:e2e && yarn test:e2e:local`.
4. Коммиты — в стиле Conventional Commits: `feat(picker): …`, `fix(snapshot): …`.
5. Откройте PR в `main` и заполните шаблон (RU или EN) — CI проверяет, что все разделы на месте.

### Что держать в голове

- **Local-first.** Без собственных серверов, аналитики и трекинга. Сетевых запросов нет вообще; если фича без них невозможна — сначала issue с обсуждением.
- **Разрешения.** Новые `permissions` в манифесте — только после обсуждения: они меняют окно установки и ревью стора. Меняете разрешения или то, что и где хранится, — обновите [`privacy.html`](privacy.html) и раздел про разрешения в README.
- **Чужие страницы.** Всё, что мы рисуем, живёт в Shadow DOM и не должно ломаться от стилей сайта и ломать их. Без `rem`, без `innerHTML` со строками со страницы, всплывающие элементы — только внутри нашего shadow root. Подробности — README, раздел «Архитектура».
- **IndexedDB трогает только background.** Новые операции с данными — новое сообщение в `src/shared/messaging.ts` с Zod-схемой.
- **Строки интерфейса** — через i18next, на английском и русском. Контракт-тест проверяет, что наборы ключей совпадают.
- **`data-testid`** на всём интерактивном — из `tests/constants/testIds.ts`.
- **Гайды** — в [README](README.md): «Новое поле в тултипе» и «Новый формат экспорта».

### Релизы (для мейнтейнера)

1. PR с новой `version` в `package.json` (semver) → merge в `main`.
2. Тег на main: `git tag v1.2.3 && git push origin v1.2.3`.
3. Воркфлоу `Release` проверяет, что тег совпадает с версией, гоняет тесты, собирает `design-review-<version>.zip` и публикует GitHub Release с патчноутами из названий PR.
4. Zip из релиза загружается в Chrome Web Store.

---

## 🇬🇧 How to contribute

Design Review is open source under the [MIT](LICENSE) license. Pull requests are welcome: fixes, new tooltip fields, export formats, translations, picker improvements. There is no need to maintain a separate fork — send PRs straight to this repository; the maintainer reviews, merges and ships them to the Chrome Web Store.

### Sending a PR

1. Fork and create a branch named `feature/<what-it-does>` or `fix/<what-it-fixes>` — by meaning, not by ticket number (CI rejects other prefixes, and reviewers need the intent).
2. `corepack enable && yarn install`. For development run `yarn dev`, then load `dist/` as an unpacked extension in `chrome://extensions`.
3. Before opening the PR run `yarn check`, `yarn test` and `yarn build`. If you touched on-page behaviour (picker, overlay, snapshot), also `yarn build:e2e && yarn test:e2e:local`.
4. Commits follow Conventional Commits: `feat(picker): …`, `fix(snapshot): …`.
5. Open the PR against `main` and fill in the template (EN or RU) — CI checks that every section is present.

### Things to keep in mind

- **Local-first.** No servers of our own, no analytics, no tracking. There are no network requests at all; if a feature truly needs one, open an issue to discuss it first.
- **Permissions.** New manifest `permissions` only after discussion: they change the install prompt and store review. If you change permissions or what is stored where, update [`privacy.html`](privacy.html) and the README permissions section.
- **Third-party pages.** Everything we render lives in a Shadow DOM and must neither break from the site's styles nor break them. No `rem`, no `innerHTML` with strings taken from the page, floating elements only inside our shadow root. Details — README, "Architecture".
- **Only the background touches IndexedDB.** New data operations mean a new message in `src/shared/messaging.ts` with a Zod schema.
- **UI strings** go through i18next, in English and Russian. A contract test checks that key sets match.
- **`data-testid`** on everything interactive, from `tests/constants/testIds.ts`.
- **Guides** — in the [README](README.md): "Add a tooltip field" and "Add an export format".

### Releases (maintainer)

1. PR bumping `version` in `package.json` (semver) → merge to `main`.
2. Tag on main: `git tag v1.2.3 && git push origin v1.2.3`.
3. The `Release` workflow checks the tag matches the version, runs tests, builds `design-review-<version>.zip` and publishes a GitHub Release with notes generated from PR titles.
4. Upload the zip from the release to the Chrome Web Store.
