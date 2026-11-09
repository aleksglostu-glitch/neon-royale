# Neon Royale — онлайн-битва 1 на 1

Неоновая арена в стиле Clash Royale: перетаскивай карточки воинов на поле,
разрушай башни соперника, побеждай в дуэлях 1 на 1.

## Структура репозитория

| Папка | Что это |
|---|---|
| `client/` | исходники игры (Next.js + Capacitor 7 → APK) |
| `server/` | игровой сервер для Railway (Bun + socket.io) |

## Возможности

- 25 карт: 15 героев, 6 башен, 4 секретные лисьи карты (промокод)
- Дорогая экономика: карты 2 000 – 20 000 золота, улучшения до 55 000
- Уникальные ники на весь сервер + таблица лидеров (топ-100)
- PvP 1 на 1: очередь на 15 секунд → если соперник не нашёлся, бой с ботом
- Промокод администратора проверяется ТОЛЬКО на сервере (XOR, rate-limit)
- Сплаш-студия, иммерсивный полный экран, защита от вылетов (WebView guard)

## Деплой сервера на Railway

1. Railway.app → New Project → Deploy from GitHub repo
2. Корневая папка: `server/` (Railway сам поставит Bun и запустит `bun run start`)
3. Settings → Networking → Generate Domain → готово

Проверка: `https://<домен>/health` → `{"ok":true,...}`

## Сборка APK (локально)

```bash
cd client
bun install
bun run build          # Next.js static export → out/
npx cap sync android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## Приватность

Хранятся только самодельный ник, случайный playerId и игровые счётчики
(трофеи/победы). Персональные данные не собираются — 152-ФЗ соблюдён,
уведомление РКН не требуется.
