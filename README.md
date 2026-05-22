# GTA RP Core — RAGE MP edition

Полноценный RP-проект: **Express + PostgreSQL** на бэкенде, **RAGE MP** ресурс (server + client + CEF) на игровой стороне. Бэкенд хранит всю «правду» (аккаунты, персонажи, инвентарь, машины, фракции, банк, чат, админ-логи), деплоится на **Railway** одной кнопкой. RAGE MP-мост — тонкий слой, который авторизованно ходит в API и синхронизирует игру.

## 📦 Структура

| Пакет | Назначение |
|-------|------------|
| `@/packages/server` | HTTP API (Express + PostgreSQL). Деплоится на Railway. |
| `@/packages/shared` | TS типы, имена событий (`RPEvent`), общий API-клиент. |
| `@/packages/ragemp-server` | RAGE MP server resource (Node). Auth, HUD, машины, чат, инвентарь, работы, админ-команды, polling админ-очереди, телефон, планшет, магазины. |
| `@/packages/ragemp-client` | RAGE MP client_packages (Node CommonJS). Хоткеи, CEF-мост, машины, эффекты админа (ESP, fly, noclip, spectate, crown). |
| `@/packages/ragemp-cef` | UI (HTML/CSS/JS): логин, выбор персонажа, HUD, чат, инвентарь, админ-панель, экран бана, телефон, планшет, магазин. |
| `@/packages/launcher` | Опциональный лаунчер. |

## 🚀 Деплой backend на Railway

Railway автоматически подхватит `@/railway.json`: соберёт `@gta-rp/shared` → `@gta-rp/server`, добавит PostgreSQL, создаст переменные окружения. Тебе останется только **заменить placeholder-значения** на реальные токены.

### 1. Подключение репозитория
1. Создай проект на [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Выбери `anva4ik2/rp`.
3. Railway автоматически прочитает `railway.json` и создаст сервис + PostgreSQL.

### 2. Переменные окружения (5 сервисов)

#### Сервис 1 — Express API (`packages/server`)
Railway создаст эти переменные автоматически из `railway.json`, но **обязательно замени placeholder**:

| Переменная | Описание | Что вписать |
|------------|----------|-------------|
| `DATABASE_URL` | Авто — из плагина PostgreSQL | Не трогай, Railway подставит сам |
| `JWT_SECRET` | Ключ подписи JWT | `openssl rand -hex 32` или любая строка ≥32 символов |
| `ADMIN_TOKEN` | Токен моста RAGE MP ↔ API | `openssl rand -hex 24` — **тот же** для ragemp-server |
| `BOOTSTRAP_FOUNDER_EMAIL` | Email первого админа (level 5) | Твой реальный email |
| `STARTER_VEHICLE_MODEL` | Стартовая машина новичка | `asea`, `blista`, `sultan` и т.д. |
| `PORT` | Порт Express | `4000` (Railway пробросит публичный URL) |
| `CORS_ORIGINS` | Разрешённые origins | `*` для dev, потом замени на домен |

#### Сервис 2 — PostgreSQL
Авто-создаётся плагином. Переменная `DATABASE_URL` появится сама.

#### Сервис 3 — RAGE MP Server (`packages/ragemp-server`)
**Если деплоишь на Railway отдельным сервисом** (опционально, обычно запускается локально):

| Переменная | Описание |
|------------|----------|
| `API_BASE_URL` | `https://<express-service>.up.railway.app` |
| `ADMIN_TOKEN` | **Тот же**, что в Express API |
| `AUTH_SALT` | Любая длинная строка для хеша паролей |

#### Сервис 4 — RAGE MP Client (`packages/ragemp-client`)
Не деплоится на Railway. Собирается локально: `npm run build` внутри `packages/ragemp-client`.

#### Сервис 5 — CEF UI (`packages/ragemp-cef`)
Не деплоится отдельно. Встраивается в `client_packages` как HTML/CSS/JS. Нет env-переменных — всё через `mp.trigger`.

### 3. Где менять переменные
**Railway Dashboard** → выбери сервис **server** → вкладка **Variables** → замени `CHANGE_ME_*` на реальные значения.

### 4. Перезапуск
После смены переменных Railway автоматически пересоберёт и перезапустит сервис. Проверь `/health` — должен вернуть `{"ok":true}`.

### 5. Получи API URL
Публичный URL вида `https://<service>.up.railway.app` — это твой `API_BASE_URL` для RAGE MP-моста.

## 🎮 Запуск RAGE MP

1. Скачай RAGE MP server (`ragemp-srv`), распакуй в `C:\ragemp-server\server-files`.
2. В корне проекта:
   ```powershell
   $env:RAGEMP_SERVER_FILES = "C:\ragemp-server\server-files"
   npm install
   npm run build
   npm run sync:ragemp
   ```
3. В `server-files\packages\gta-rp-core\.env`:
   ```env
   API_BASE_URL=https://<service>.up.railway.app
   AUTH_SALT=<любая длинная строка>
   ADMIN_TOKEN=<тот же, что в Railway>      # нужен для polling /admin/pending
   ```
4. Скопируй `conf.json.example` → `conf.json`, проверь `"resources": ["gta-rp-core"]` и `"enable-nodejs": true`.
5. Запусти `ragemp-server.exe`. Игроки подключаются: `direct connect <IP>:22005`.

## 🔐 Авторизация и персонажи

Первый запуск игрока:
1. RAGE MP клиент открывает CEF → форма **Вход / Регистрация**.
2. CEF шлёт `cef:login` или `cef:register` → client_packages проксирует на сервер → сервер вызывает `/auth/login` или `/auth/register` → JWT сохраняется в сессии.
3. Сервер шлёт список персонажей. Если пусто — открывается форма создания.
4. При создании персонажа бэкенд **сразу выдаёт стартер-машину** (`@/packages/server/src/modules/starter.ts`) + ключи. После загрузки в мир RAGE MP-мост спавнит её **рядом с игроком** — можно сразу садиться и ехать.
5. Все последующие подключения восстанавливают позицию игрока и всех его машин из БД.

## 🚀 One-click Railway deploy (рекомендуется)

1. Создай форк/репо на GitHub.
2. На [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → выбери репо.
3. В проекте: **+ New** → **Database** → **Add PostgreSQL**.
4. В сервисе бэкенда открой **Variables** и добавь:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   JWT_SECRET   = <минимум 32 случайных символа>
   ADMIN_TOKEN  = <длинный случайный токен>
   CORS_ORIGINS = *
   PORT         = 3000
   BOOTSTRAP_FOUNDER_EMAIL = <твой email>
   ```
5. Railway сам подхватит `@/railway.json` + `@/nixpacks.toml` → Node 20 → `npm install --include=dev` → собирает `@gta-rp/shared` затем `@gta-rp/server` → запускает `node dist/index.js`.
6. После деплоя проверь URL: `https://<service>.up.railway.app/health` должен вернуть `{ "status": "ok" }`.

## ⌨️ Хоткеи

| Клавиша | Действие |
|---------|----------|
| F1 / F2 | Меню взаимодействия |
| I       | Инвентарь |
| T       | Планшет |
| T или Y | Открыть чат |
| Enter   | Отправить сообщение в чате |
| Esc     | Закрыть UI/чат |
| J       | Двигатель в авто |
| L       | Замок авто |
| **F5**  | **Admin Mode ON/OFF** (noclip + invis + fly + crown icon) — только для админов |
| **F6**  | **Телепорт к метке на карте** — только в Admin Mode |

## 💬 Чат

- Обычное сообщение → `[OOC] Имя: текст` (глобально).
- `/me делает что-то` — экшен в радиусе 20 м (фиолетовый).
- `/do описание` — описание сцены (жёлтый).
- `/try пытается` — попытка со случайным успехом (розовый).
- `/b комментарий` или `/ooc` — OOC локально.
- `/l текст` или `/local` — IC локально.
- `/admin` — открыть админ-панель (только если уровень ≥ 1).

## 🛡️ Админка — уровни 1–5

| Уровень | Кто | Может |
|---------|-----|-------|
| 1 | Helper    | `/kick`, `/spectate`, чтение логов и репортов |
| 2 | Moderator | + `/tp`, `/bring`, `/heal`, `/veh` |
| 3 | Admin     | + `/ban`, `/setmoney`, выдача предметов |
| 4 | Head      | + создание фракций, выдача машин (`/admin/give-vehicle`), редактирование каталога |
| 5 | Founder   | + `/setadmin`, полный доступ |

Способы войти в админку:
- **`x-admin-token` header** — серверный супер-токен, эквивалент уровня 5. Используется RAGE MP мостом для polling `/admin/pending` и для CI/скриптов.
- **JWT обычного пользователя** с `users.admin_level >= N` — для входа через клиента/CEF.

Первый founder создаётся через `BOOTSTRAP_FOUNDER_EMAIL`: тот email, который первым зарегистрируется, автоматически получит уровень 5.

Доступные эндпоинты:
- `GET /admin/me`, `GET /admin/search?q=...`, `GET /admin/logs`, `GET /admin/reports`, `GET /admin/pending` (token-only).
- `POST /admin/kick`, `/teleport`, `/heal`, `/ban`, `/give-money`, `/set-money`, `/give-vehicle`, `/set-admin-level` (founder), `/factions`, `/factions/member`, `/factions/vehicle`, `/factions/rank`, `/vehicles/catalog/bulk`.

### Чат-команды по уровням

**L0 (все игроки):**
- `/online` — список игроков онлайн

**L1 (helper):**
- `/kick <имя> <причина>` — кикнуть
- `/spectate <имя>` — наблюдать (пустой `/spectate` — выйти)
- `/admins` — кто из админов онлайн
- `/esp` — подсветка игроков и машин на карте
- `/me`, `/do`, `/try`, `/b`, `/l` — RP чат-команды

**L2 (moderator):**
- `/tp <имя>` — телепорт к игроку
- `/bring <имя>` — призвать к себе
- `/heal [имя]` — восстановить HP/броню
- `/veh <model>` — заспавнить временную машину
- `/freeze <имя>`, `/unfreeze <имя>` — заморозить
- `/invis [имя]` — невидимость
- `/mute <имя> [мин] [причина]`, `/unmute <имя>`
- `/repairveh` — починить машину, в которой сидишь
- `/spectate <имя>` — следить за игроком (пустой — выйти)
- `/prison <имя> <минуты> <причина>` — Деморган
- `/unprison <имя>` — выпустить из Деморгана
- `/gotoveh <ownershipId>` — телепорт к машине по ID

**L3 (admin):**
- `/ban <имя> <часы> <причина>` — бан (0 часов = перм)
- `/unban <userId>` — снять бан
- `/setmoney <имя> <cash|bank> <сумма>`
- `/god [имя]` — неуязвимость
- `/fly` — режим полёта
- `/noclip [имя]` — прохождение сквозь стены
- `/giveweapon <имя> <модель> [патроны]`
- `/givelevel <имя> <уровень>` — выдать RP-уровень
- `/announce <текст>` — глобальное объявление

**L4 (head admin):**
- `/clearinv <имя>` — очистить инвентарь
- Выдача машин через `/admin/give-vehicle` API
- `/faction-remove <имя>` — исключить из фракции

**L5 (founder):**
- `/setadmin <имя> <0-5>` — назначить админа
- Переименование, полное управление

### CEF админ-панель

Открывается командой `/admin` или кнопкой в меню (только при L≥1). Три вкладки:
- **Игроки**: поиск по имени, выбор → 20+ быстрых действий (Kick/Heal/Freeze/God/Invis/Noclip/Spectate/Prison/Unprison/Mute/Ban/GiveMoney/GiveVehicle/GiveWeapon/GiveLevel/FactionKick/Wipe/TPMap) + Announce.
- **Логи**: последние 100 действий админов.
- **Репорты**: очередь жалоб от игроков.

## ⛔ Система банов

Два типа банов:

1. **De Morgan (временный, замедленный)** — время течёт в 10 раз медленнее: 1 реальная секунда = 0.1 бан-секунды. Если админ дал бан на 60 минут, игрок будет ждать 600 минут реального времени. Подходит для нарушителей, которые должны "отсидеть" срок.
2. **Hard Ban (навсегда)** — перманентный бан. При входе игрок видит экран «ЗАБАНЕН НАВСЕГДА» и не может зайти ни при каких условиях.

## 📱 Телефон / Планшет / Магазин

- **Телефон** — открывается через меню взаимодействия (F1/F2 → 📞 Телефон). Контакты, SMS, банковский перевод.
- **Планшет** — F1/F2 → 📱 Планшет. Вкладки: Marketplace (торговая площадка), Работы, Дома, Бизнесы, Фракции.
- **Магазин 24/7** — открывается взаимодействием с NPC-продавцом (F → Магазин).

## 🆔 Система владения (Ownership ID)

Каждая машина, дом, бизнес и предмет в инвентаре получает уникальный `ownership_id` при создании. Администратор может телепортироваться к объекту по его ID (`/gotoveh <ownershipId>`), а также отслеживать владельца через API.

## 🚗 Машины

- Каталог: 200+ моделей в `@/packages/server/src/modules/vehicles.ts`, фильтры по региону/доступу/салону.
- При регистрации **стартер-машина выдаётся автоматически** — таблица `vehicles` + `vehicle_keys`.
- Позиция, тонировка, lock state сохраняются каждые 30 секунд (`POST /vehicles/position`) и при дисконнекте.
- Спавн при заходе: первая машина — у игрока под боком, остальные — на последних позициях.

## 🧬 Архитектура взаимодействия

```
┌────────────┐  mp.trigger   ┌─────────────────────┐  callRemote   ┌──────────────────────┐  fetch (JWT)  ┌─────────────────┐
│   CEF UI   │ ────────────► │ client_packages     │ ───────────►  │ ragemp-server (Node) │ ─────────────► │ Express + PG    │
│  (browser) │ ◄──────────── │ (RAGE MP client)    │ ◄───────────  │ event handlers       │ ◄───────────── │ Railway         │
└────────────┘   dispatch    └─────────────────────┘    events     └──────────────────────┘    JSON        └─────────────────┘
                  Event
```

- **CEF никогда не ходит в HTTP API напрямую** — всё через серверный мост с JWT.
- Имена событий — в `@/packages/shared/src/events.ts` (`RPEvent.*`).

## 🛠 Скрипты

- `npm run build` — собрать все пакеты.
- `npm run sync:ragemp [target]` — выгрузить готовый ресурс в `server-files/`.
- `npm run dev:server` — backend API в watch.
- `npm run dev:ragemp` — серверный мост в watch (для проверки типов).
- `npm run docker:up` — поднять Postgres + API локально в Docker.

## 🎮 Как запустить и играть (пошагово)

### 1. Деплой бэкенда (Railway)
1. Заливаем код на GitHub.
2. На [railway.app](https://railway.app) создаём проект → Deploy from GitHub repo.
3. Добавляем плагин **PostgreSQL**.
4. В Variables сервиса бэкенда указываем:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<минимум 32 символов>
   ADMIN_TOKEN=<длинный случайный токен>
   CORS_ORIGINS=*
   PORT=3000
   BOOTSTRAP_FOUNDER_EMAIL=<твой email>
   ```
5. Railway автоматически соберёт и запустит бэкенд. Копируем публичный URL.

### 2. Сборка RAGE MP ресурса
1. Скачиваем RAGE MP server (`ragemp-srv`) и распаковываем, например в `C:\ragemp-server\server-files`.
2. В корне проекта открываем PowerShell:
   ```powershell
   $env:RAGEMP_SERVER_FILES = "C:\ragemp-server\server-files"
   npm install
   npm run build
   npm run sync:ragemp
   ```
3. В `server-files\packages\gta-rp-core\.env` пишем:
   ```env
   API_BASE_URL=https://<service>.up.railway.app
   AUTH_SALT=<любая длинная строка>
   ADMIN_TOKEN=<тот же токен, что в Railway>
   ```
4. В `server-files\conf.json` проверяем `"resources": ["gta-rp-core"]` и `"enable-nodejs": true`.
5. Запускаем `ragemp-server.exe`.

### 3. Подключение игроков
1. Открываем RAGE MP клиент (launcher).
2. Direct Connect → вводим IP: `127.0.0.1:22005` (если сервер локальный) или IP сервера.
3. В игре откроется CEF-окно авторизации.
4. Регистрируемся / входим.
5. Создаём персонажа → попадаем в мир Los Santos.

### 4. Получение админки
- Founder (уровень 5) автоматически получается при первой регистрации аккаунта с `BOOTSTRAP_FOUNDER_EMAIL`.
- `/setadmin <имя> <0-5>` — выдача уровней другим (только founder).
- **F5** — включить/выключить Admin Mode (noclip + invis + fly + корона над головой).
- **F6** — телепорт к метке на карте (только в Admin Mode).

## ✅ Проверочный чек-лист

После старта пройди по нему:
- [ ] `GET /health` возвращает 200.
- [ ] Регистрация через CEF создаёт пользователя; founder получает `adminLevel` 5.
- [ ] Создание персонажа возвращает стартер-машину с `ownership_id`.
- [ ] После выбора персонажа игрок спавнится возле машины (`J` — двигатель, `L` — замок).
- [ ] Чат работает: `/me`, `/do`, `/try`, `/b`, `/l`.
- [ ] У админа в HUD видна красная плашка `Admin L5`.
- [ ] `/admin` открывает панель с 20+ кнопками действий.
- [ ] **F5** включает Admin Mode (noclip + invis + fly + crown icon).
- [ ] **F6** телепортирует к метке на карте (в Admin Mode).
- [ ] `/prison <имя> 10 тест` отправляет в Деморган (Bolingbroke).
- [ ] Бан через `/ban` с `banType=demorgan` — время идёт в 10 раз медленнее.
- [ ] Hard Ban — игрок видит экран «ЗАБАНЕН НАВСЕГДА».
- [ ] Авто-сохранение каждые 30с: позиция игрока и машин обновляется в БД.
- [ ] Телефон, планшет и магазин открываются через меню взаимодействия.

## 📄 Лицензия
MIT
