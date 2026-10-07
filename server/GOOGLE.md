> **Коротко:** играть можно и без Google — в комнатах вход по нику или гостем.
> Google нужен только если хочешь, чтобы прогресс был привязан к аккаунту на своём сервере.
>
> **Client ID не надо вшивать в код!** Открой в игре «Играть» → поле «Client ID» → вставь → «Сохранить».
>
> **SHA-1 приложения (постоянный, не меняется между сборками):**
> `1C:0A:C6:72:85:AF:9E:5C:28:81:F1:67:AE:26:3E:96:09:EE:74:C2`
> Package name: `com.kotovviktor.rpigra`

# Вход через Google — что нужно сделать (один раз, бесплатно)

Нужен **OAuth Client ID**. Его выдаёт Google Cloud Console. Создание занимает ~10 минут,
карта и оплата не нужны.

---

## 1. Создать проект

1. Открой https://console.cloud.google.com/ и войди своим Google-аккаунтом.
2. Вверху слева — выпадающий список проектов → **New project**.
3. Name: `Horizons RP` → **Create**. Подожди 10–20 секунд и выбери этот проект.

## 2. Настроить экран согласия

1. Меню слева: **APIs & Services → OAuth consent screen**.
2. User Type: **External** → *Create*.
3. Заполни обязательное:
   - App name: `Horizons RP`
   - User support email: твоя почта
   - Developer contact email: твоя почта
4. *Save and continue* три раза → *Back to dashboard*.
5. В разделе **Audience / Test users** добавь свою почту (пока приложение не опубликовано,
   входить смогут только тестовые пользователи). Когда захочешь открыть всем —
   кнопка **Publish app**.

## 3. Создать Client ID для сайта (веб-версия игры)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**, Name: `Horizons RP Web`.
3. **Authorized JavaScript origins** — добавь обе строки:
   - `https://kotovviktor542-hub.github.io`
   - `http://localhost:8099` (для моих тестов)
4. **Create**. Появится строка вида
   `123456789012-abcdefghijklmnop.apps.googleusercontent.com` — **это и есть Client ID**.

## 4. Создать Client ID для Android (APK)

Нужен, чтобы вход работал внутри приложения, а не только в браузере.

1. Снова **Create credentials → OAuth client ID** → Application type: **Android**.
2. Package name: `com.kotovviktor.rpigra`
3. SHA-1 certificate fingerprint: скажи мне — я достану его из ключа подписи в репозитории
   и пришлю строку вида `AB:CD:EF:...`.
4. **Create**.

## 5. Прислать мне

- **Web Client ID** (из шага 3) — я вставлю его в `www/js/net/config.js` и в переменную
  окружения `GOOGLE_CLIENT_ID` на сервере (Render → Environment).

После этого в игре на экране **Играть онлайн** кнопка «Войти через Google» станет активной:
игрок жмёт её, выбирает аккаунт, игра получает токен, сервер проверяет его у Google и
создаёт/находит профиль. Прогресс привязывается к Google-аккаунту и доступен с любого телефона.

---

## Что уже готово в коде

- `www/js/net/auth.js` — загрузка Google Identity Services, получение `id_token`, хранение сессии;
- `www/js/net/config.js` — константа `GOOGLE_CLIENT_ID` (сейчас пустая);
- `server/server.js` — проверка токена через `https://oauth2.googleapis.com/tokeninfo`,
  сверка `aud` с `GOOGLE_CLIENT_ID`, создание аккаунта `g:<sub>` и облачное сохранение профиля.

Пока Client ID не задан, кнопка Google выключена, а войти можно по **нику с паролем**
(аккаунт заводится на сервере) или **гостем** (без сохранения в облаке).
