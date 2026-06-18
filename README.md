# Infra Billing Panel

Персональная (**single-user, self-hosted**) панель учёта расходов на инфраструктуру: VPS,
выделенные серверы, домены, CDN, объектные хранилища, лицензии и т.п. Панель сама ходит в API
хостинг-провайдеров, тянет баланс аккаунта, список ресурсов, тарифы и даты списаний, складывает
снапшоты и строит аналитику/прогнозы. Провайдеров без API владелец ведёт вручную.

## Возможности

- **Провайдеры с API:** Timeweb Cloud, Hetzner Cloud, HostBill, ISPsystem BILLmanager, Selectel,
  4VPS.SU. Плюс **Manual** — провайдеры без API ведутся руками.
- **Автосинк** (по расписанию + кнопкой): баланс + валюта аккаунта, список серверов/услуг, даты
  следующих списаний; история баланса по дням (снапшоты).
- **Импорт платежей** там, где API отдаёт реестр (BILLmanager — пополнения и списания, HostBill —
  оплаченные счета, Selectel — потребление). Ручные платежи — в журнале.
- **Аналитика:** месячные/годовые расходы, разрезы по провайдеру / стране / типу / валюте, прогноз
  по будущим списаниям, ближайшие списания с подсветкой критичности.
- **Мультивалютность:** суммы в своей валюте, конвертация к базовой; курсы ЦБ РФ или ручные.
- **Telegram-уведомления** (только исходящие): низкий баланс, скорое списание, ошибка синка.
- **Безопасность:** вход по логину/паролю (JWT в httpOnly-cookie), токены провайдеров шифруются
  AES-256-GCM и в API не возвращаются.

## Стек

- **Backend:** NestJS 11 (Node 22) · Prisma 7 · PostgreSQL 17 · zod (`nestjs-zod`) · axios · grammY
- **Frontend:** Vite · React 19 · Mantine v9 · TanStack Query · axios
- **Монорепо:** npm-workspaces — `apps/backend`, `apps/frontend`, `packages/shared` (общие zod-схемы)
- **Деплой:** единый Docker-образ (бэкенд раздаёт API + собранный SPA) + отдельный Postgres

---

## Установка (production)

**Требования:** Docker + Docker Compose plugin; домен и reverse-proxy с TLS (см. ниже — без HTTPS
вход не работает, т.к. сессионная кука `Secure`). Образ берётся из GHCR
(`ghcr.io/mishkatik/infra-billing`).

```bash
# 1. Каталог
mkdir -p /opt/infra-billing && cd /opt/infra-billing

# 2. Скачать prod-compose и пример конфига в .env
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/mishkatik/infra-billing/main/docker-compose-prod.yml
curl -fsSL -o .env https://raw.githubusercontent.com/mishkatik/infra-billing/main/.env.example

# 3. Сгенерировать секреты (GNU sed; разделитель # — т.к. base64 содержит /)
sed -i "s#^ENCRYPTION_KEY=.*#ENCRYPTION_KEY=$(openssl rand -base64 32)#" .env
sed -i "s#^SESSION_SECRET=.*#SESSION_SECRET=$(openssl rand -base64 48)#" .env
sed -i "s#^ADMIN_PASSWORD=.*#ADMIN_PASSWORD=$(openssl rand -hex 16)#" .env

# 4. Пароль БД — один и тот же в POSTGRES_PASSWORD и в DATABASE_URL
pw=$(openssl rand -hex 24) && sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$pw/" .env && sed -i "s|^\(DATABASE_URL=\"postgresql://infra:\)[^\@]*\(@.*\)|\1$pw\2|" .env

# 5. Запуск (миграции применяются на старте)
docker compose up -d && docker compose logs -f
```

Логин/пароль администратора после генерации: `grep -E '^ADMIN_(USERNAME|PASSWORD)=' .env`.

Панель поднимется на `127.0.0.1:8080`. Дальше — reverse-proxy с TLS на ваш домен.

### Reverse proxy + TLS (обязательно)

Контейнер слушает только `127.0.0.1:8080` — наружу не торчит. Поставьте перед ним reverse-proxy,
который терминирует TLS. **Без HTTPS логин не сработает** (сессионная кука помечена `Secure`).

Пример [Caddy](https://caddyserver.com) (сам выпустит сертификат):

```caddy
billing.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

### Обновление

Обновить и перезапустить:

```bash
cd /opt/infra-billing && docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```

Почистить неиспользуемые образы:

```bash
docker image prune
```

---

## Конфигурация (`.env`)

| Переменная | Назначение |
|------------|-----------|
| `PORT` | Порт бэкенда (он же отдаёт SPA), default 8080 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Параметры контейнера Postgres |
| `POSTGRES_HOST_PORT` | Порт публикации Postgres на `127.0.0.1` (default 5432) |
| `DATABASE_URL` | Строка подключения Prisma (хост = `infra-billing-db` в docker, `127.0.0.1` локально) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Учётные данные входа в панель |
| `SESSION_SECRET` | Подпись cookie-сессии (если пусто — выводится из ADMIN-данных) |
| `ENCRYPTION_KEY` | **Обязательно.** AES-256-GCM ключ для токенов провайдеров (32 байта base64) |

---

## Провайдеры — где взять доступ

Добавление: *Провайдеры → Добавить*, выбрать тип, ввести токен/креды (шифруются, в API не
возвращаются). После сохранения провайдер сразу синкается.

- **Timeweb Cloud** — ЛК → «API и Terraform» → создать токен.
- **Hetzner Cloud** — Project → Security → API Tokens (read). Баланса в API нет — только серверы.
- **HostBill** — base URL вашей инсталляции (напр. `https://secure.veesp.com/api`) + email + пароль.
- **ISP BILLmanager** — base URL (`https://.../billmgr`) + логин + пароль (+ TOTP-секрет, если 2FA по OTP).
- **Selectel** — номер аккаунта + сервисный пользователь IAM (имя + пароль) с ролью на биллинг;
  опц. имя проекта Облачной платформы для облачных серверов.
- **4VPS.SU** — API-ключ (ЛК → раздел API) + id панели (обычно `1`).
- **Manual** — без API, всё вводится руками.

## Telegram-уведомления

1. Создать бота у **@BotFather**, получить токен.
2. Узнать свой chat id (например, через **@userinfobot**), боту нажать `/start`.
3. В панели *Настройки → Telegram* — токен + chat id (опц. id топика), сохранить. Кнопка
   «Отправить примеры» пришлёт по образцу каждого типа уведомления. Изменения — без рестарта.

---

## Локальная разработка

```bash
make install            # npm ci
make db-up              # поднять только Postgres (127.0.0.1:5432)

# .env для локального запуска вне docker — DATABASE_URL на 127.0.0.1:
#   DATABASE_URL="postgresql://infra:infra@127.0.0.1:5432/infra_billing?schema=public"

make migrate            # prisma migrate dev
make dev                # backend :8080 + frontend :5173 (Vite проксирует /api)
```

Открыть <http://localhost:5173>. `make migrate`/`make studio` сами ходят в БД на `127.0.0.1`
(см. `LOCAL_DATABASE_URL` в Makefile). Локальный билд образа: `make docker-build` + `make docker-up`
(использует `docker-compose.yml` со сборкой из исходников).
