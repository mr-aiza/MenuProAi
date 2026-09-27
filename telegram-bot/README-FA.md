# اصلاح اتصال ربات MenuProAI

1. فایل worker.js را جایگزین کد Worker با نام menuproai-telegram کنید و Deploy بزنید.
2. متغیر API_BASE باید https://menuproai-api.bytelab.workers.dev باشد. BOT_TOKEN را تغییر ندهید.
3. https://menuproai-telegram.bytelab.workers.dev/diagnostics را باز کنید. این نسخه apiBase و healthUrl را هم نشان می‌دهد.
4. اگر upstream برابر ok بود، Mini App را مجدداً از داخل ربات باز کنید.
5. اگر همچنان 404 بود، مقدار apiBase و healthUrl و upstreamStatus را بدون توکن ارسال کنید.

نکته: این تغییر فقط Worker تلگرام است و API اصلی را تغییر نمی‌دهد. این نسخه اتصال واقعی به سرویس‌های منتشرشده را تضمین نمی‌کند.
