# RP-igra

Симулятор жизни для Android. HTML5 + Capacitor, APK собирается автоматически через GitHub Actions.

## Скачать

Последняя сборка: **[Releases](https://github.com/kotovviktor542-hub/RP-igra/releases)** → файл `RP-igra-buildNN.apk`

## Что это

Текстовый симулятор жизни. Управляешь персонажем: работаешь, качаешь навыки, следишь
за здоровьем/энергией/настроением/сытостью, доживаешь до чего-нибудь приличного.

- 4 характеристики: здоровье, энергия, настроение, сытость
- 4 навыка: физуха, интеллект, харизма, ремесло
- 4 работы, открываются по навыкам (курьер → бариста → мастер → junior-разработчик)
- Действия: тренировка, учёба, общение, ремесло, еда, отдых, врач
- Случайные события ночью
- Автосохранение в localStorage

## Стек

| Что | Чем |
|---|---|
| Игра | Vanilla JS, без сборщика |
| Обёртка в APK | Capacitor 6 |
| CI | GitHub Actions → `assembleDebug` → Release |

## Структура

```
www/                 веб-приложение (webDir для Capacitor)
  index.html         экраны: старт + игра
  css/style.css      тёмная мобильная тема
  js/state.js        состояние персонажа, сохранение
  js/data.js         контент: статы, навыки, работы, действия, события
  js/engine.js       игровая логика (без DOM, тестируется в node)
  js/ui.js           рендер DOM
  js/main.js         связка UI ↔ движок
tools/check.js       59 тестов логики + симуляция 500 дней
tools/serve.js       локальный dev-сервер
.github/workflows/   автосборка APK
capacitor.config.json
```

## Разработка

```bash
npm install
npm run check    # тесты логики
npm run serve    # http://localhost:8080
```

Папка `android/` не коммитится — она генерируется в CI командой `npx cap add android`.

## Сборка APK

Любой пуш в `main` запускает workflow `Build APK`:

1. Node 20 + JDK 17 + Android SDK 34
2. `npm install` → `npm run check` (тесты; если падают — сборки не будет)
3. `npx cap add android` + `npx cap sync android`
4. `./gradlew assembleDebug`
5. Создаётся релиз с тегом `v0.1.0-buildNN`

APK — **debug-подписанный**, для установки нужно разрешить «Установка из неизвестных источников».
