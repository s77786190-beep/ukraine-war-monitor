# Личный ИИ-агент для Android

Отдельный Expo/React Native клиент в каталоге `personal-ai-agent/`. Не изменяет существующее приложение мониторинга в корне репозитория.

## Текущий этап — 0.1.0
- Русскоязычный интерфейс: чёрный фон, оранжевые акценты.
- Разделы: чат, задачи, специализированные агенты, память, настройки.
- Локальное сохранение истории и заметки памяти.
- Подключение к серверному API через адрес backend и токен.
- Честное отображение отсутствия backend: приложение не имитирует ответы модели.

## Сборка автономного APK локально
Требуются Node.js 20+, Java 17 и Android SDK.

```bash
cd personal-ai-agent
npm install
npm run typecheck
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease
```

APK: `personal-ai-agent/android/app/build/outputs/apk/release/app-release.apk`.

Для проверки APK:
```bash
unzip -t app-release.apk
$ANDROID_HOME/build-tools/<version>/apksigner verify --verbose app-release.apk
$ANDROID_HOME/build-tools/<version>/aapt dump badging app-release.apk
```

Не используйте `assembleDebug` как готовый APK для пользователя: debug-сборка может зависеть от Metro. CI собирает release APK, проверяет наличие встроенного JS bundle, целостность ZIP, подпись и идентификатор пакета.

## Что ещё требуется до полноценного продукта
Серверный оркестратор и БД долговременной памяти; авторизация и безопасное хранение секретов; интеграции поиска и внешних сервисов; очередь фоновых задач; Realtime voice; Android AccessibilityService с явным включением пользователем; реестр инструментов; мультимодальные провайдеры; тесты и управляемая релизная подпись. Эти функции не объявляются реализованными до фактической разработки и проверки.

Backend задаёт API-контракт: POST `/v1/chat`, JSON `{ "message": "...", "language": "ru" }`, ответ `{ "reply": "..." }`. Для работы чата сервер должен быть развёрнут, а его HTTPS-адрес и токен — настроены в приложении.


Android UI uses system safe-area insets plus 24 dp of additional spacing at the top and bottom.
