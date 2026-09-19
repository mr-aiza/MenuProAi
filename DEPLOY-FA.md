# MenuProAI v6 — اتصال واقعی داده‌ها

این نسخه یک لایه داده واحد دارد و Dashboard و KDS از همان Worker و همان سفارش‌ها استفاده می‌کنند.

## Worker
`menuproai-worker.js` را روی Cloudflare Worker دیپلوی کن.

Binding الزامی:
- `MENU_KV` → KV اختصاصی MenuProAI

Binding سازگاری با حساب‌های قدیمی:
- `USERS_KV` → همان KV سیستم قدیمی bytelab-users (اختیاری، ولی برای sessionهای قدیمی لازم است)

## API
آدرس پیش‌فرض فرانت:
`https://menuproai-api.bytelab.workers.dev`

اگر آدرس Worker عوض شد، در ابتدای `dashboard.html` و `kds.html` مقدار `window.__MENUPROAI_API__` را تغییر بده.

## احراز هویت
نسخه v6 دیگر به وجود فایل خارجی `assets/bytelab-auth.js` وابسته نیست؛ فایل داخل همین ZIP است و این endpointها را صدا می‌زند:
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET `/api/auth/me`

Sessionهای قدیمی `bytelab-users` هم در صورت وجود `USERS_KV` همچنان پذیرفته می‌شوند.

## تست اتصال
GET `/api/health`
باید `ok: true` و `bindings.menuKV: true` برگرداند.

## زنجیره داده
Menu → `menu:{slug}`
Orders → `orders:{slug}`
Discounts → `discounts:{slug}`
Inventory → `inventory:{slug}`
Activity → `activity:{slug}`
Tables → داخل `menu:{slug}`
Analytics → مستقیماً از `orders:{slug}` محاسبه می‌شود.

## نکته مهم
هیچ صفحه‌ای نباید عدد ساختگی برای داده‌های اصلی نشان بدهد. اگر API خطا بدهد، UI باید خطای اتصال را نشان دهد.
