# چک‌لیست انتشار

1. از Worker فعلی نسخه پشتیبان بگیرید.
2. کد `worker.js` را جایگزین کنید یا در پروژه Wrangler کپی کنید.
3. `BOT_TOKEN` و Service Binding به نام `MENU_API` را حفظ کنید.
4. برای اعلان‌ها، `NOTIFY_KV` و Cron را در Cloudflare تنظیم کنید؛ بدون این موارد Mini App همچنان قابل استفاده است اما اعلان‌ها فعال نمی‌شوند.
5. Deploy کنید و `/diagnostics` را بررسی کنید؛ انتظار `transport: service_binding` و `upstream: ok` است.
6. آدرس اصلی Worker را یک بار باز کنید تا فرمان‌ها و دکمه Mini App تنظیم شوند.
7. در تلگرام `/start`، `/help` و Mini App را تست کنید.
8. اگر دکمه قدیمی برگشت، `/reset` بفرستید.

**امنیت:** توکن واقعی را در فایل ZIP یا مخزن عمومی قرار ندهید.
