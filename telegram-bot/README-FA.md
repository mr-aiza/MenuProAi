# رفع خطای 404 ربات MenuProAI

1. در Cloudflare به Workers & Pages > menuproai-telegram > Settings > Bindings بروید.
2. Add binding > Service را انتخاب کنید. Variable name: `MENU_API` و Service: `menuproai-api` (Production). ذخیره کنید.
3. در Edit code فایل `worker.js` همین بسته را به‌طور کامل جایگزین کد فعلی کنید و Deploy بزنید.
4. Secret فعلی `BOT_TOKEN` را نگه دارید. متغیر `API_BASE` می‌تواند همان `https://menuproai-api.bytelab.workers.dev` بماند.
5. آدرس `https://menuproai-telegram.bytelab.workers.dev/diagnostics` را باز کنید؛ باید `transport: service_binding` و `upstream: ok` باشد.
6. از تلگرام ربات را باز کنید، `/start` بزنید و Mini App را دوباره امتحان کنید.

نکته: اگر transport برابر public_fetch بود، Binding در Worker درست ثبت نشده است. اگر upstream خطا داشت، لاگ‌های Worker اصلی و دسترسی‌های API را بررسی کنید. توکن و رمز را برای دیگران ارسال نکنید.
