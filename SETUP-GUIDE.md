# MenuProAI — راهنمای کامل نصب (همه‌ی ۵ مرحله)

## معماری نهایی

```
menuproai.bytelabpro.xyz/               → GitHub Pages (index.html قدیمی، اختیاری)
menuproai.bytelabpro.xyz/dashboard.html → GitHub Pages (داشبورد مالک کافه)
menuproai.bytelabpro.xyz/USERS/*/menu.html → Cloudflare Worker Route (منوی عمومی هر کافه)

Worker menuproai-worker  → مدیریت داده (ساخت کافه، آیتم‌ها)   ← MENU_KV, USERS_KV(فقط خواندن)
Worker ai-worker          → دستیار هوش مصنوعی سفارش‌گیری        ← MENU_KV(فقط خواندن), AI binding
Worker menuproai-router   → سرو صفحه‌ی عمومی منو رو مسیر /USERS/*
```

سه Worker جدا، دو KV namespace (`MENU_KV` جدید، `USERS_KV` مشترک با سایت اصلی برای احراز هویت).

---

## فایل‌های این زیپ

| فایل | مقصد |
|---|---|
| `menuproai-worker.js` | دیپلوی به‌عنوان Worker شماره ۱ (مدیریت داده) |
| `ai-worker.js` | جایگزین Worker موجودت (`menuproai.tempmail41245.workers.dev`) |
| `menuproai-router.js` | دیپلوی به‌عنوان Worker شماره ۳ (فقط برای مسیر `/USERS/*`) |
| `dashboard.html` | داخل ریپوی `MenuProAi` گیت‌هاب |
| `public-menu.html` | داخل ریپوی `MenuProAi` گیت‌هاب (این همون قالبیه که Worker شماره ۳ سرو می‌کنه) |
| `assets/bytelab-auth.js` | داخل ریپوی `MenuProAi`، مسیر `assets/bytelab-auth.js` |
| `CNAME` | همون فایل قبلی، دست‌نخورده |
| `index.html.original-backup` | نسخه‌ی اصلی که فرستادی، فقط برای مرجع/آرشیو — نیازی به آپلودش نیست |

---

## مرحله ۱ و ۲ — Worker مدیریت داده

1. Cloudflare → Workers & Pages → یه Worker جدید بساز (اسم پیشنهادی: `menuproai-api`)
2. کد `menuproai-worker.js` رو بذار توش، دیپلوی کن
3. Settings → Bindings:
   - KV binding با نام `MENU_KV` → یه namespace **جدید** بساز
   - KV binding با نام `USERS_KV` → از دراپ‌داون، namespace **موجود** `bytelab-users-worker` رو انتخاب کن (نسازش دوباره)
4. آدرس نهایی این Worker رو یادداشت کن (چیزی مثل `https://menuproai-api.<account>.workers.dev`)

---

## مرحله ۳ — صفحه‌ی عمومی منو

1. تو `public-menu.html`، خط بالای اسکریپت رو با آدرس Worker مرحله ۱ پر کن:
   ```js
   const MENUPROAI_API = "https://menuproai-api.<account>.workers.dev";
   ```
2. فایل رو تو ریپوی `MenuProAi` (کنار `index.html`) قرار بده.

---

## مرحله ۴ — دستیار هوش مصنوعی

1. کد `ai-worker.js` رو جایگزین کد فعلی Workerت (`menuproai`) کن.
2. Settings → Bindings همون Worker:
   - KV binding با نام `MENU_KV` → **همون namespace ای که تو مرحله ۱-۲ ساختی** رو انتخاب کن (نه جدید)
   - Workers AI binding با نام `AI` (اگه از قبل نداری اضافه کن)
3. متغیر قدیمی `MENU_URL` (اگه قبلاً تنظیم کرده بودی) رو می‌تونی پاک کنی.
4. تو `public-menu.html`، مطمئن شو این خط درسته:
   ```js
   const AI_WORKER_URL = "https://menuproai.tempmail41245.workers.dev";
   ```
   (یا هر آدرسی که الان این Worker داره)

---

## مرحله ۵ — اتصال نهایی دامنه

### ۵.۱) مطمئن شو GitHub Pages فعلاً درست کار می‌کنه
- تو ریپوی `MenuProAi` → Settings → Pages → باید «DNS check successful» و **Enforce HTTPS** فعال باشه (طبق راهنمای قبلی).

### ۵.۲) فایل‌های استاتیک رو آپلود کن
- `dashboard.html`, `public-menu.html`, `assets/bytelab-auth.js` رو به ریپوی `MenuProAi` اضافه/کامیت کن.

### ۵.۳) Worker مسیریاب رو بساز
1. یه Worker جدید بساز: `menuproai-router`
2. کد `menuproai-router.js` رو بذار توش
3. تو همون کد، این خط رو با یوزرنیم/ریپوی واقعیت چک کن (احتمالاً همینه):
   ```js
   const TEMPLATE_URL = "https://mr-aiza.github.io/MenuProAi/public-menu.html";
   ```
4. دیپلوی کن (فعلاً بدون Route، فقط دیپلوی خام کافیه)

### ۵.۴) پروکسی رو فعال کن
- Cloudflare DNS → رکورد `menuproai` (CNAME → `mr-aiza.github.io`) → روی **Proxied** (ابر نارنجی) کلیکش کن تا از حالت DNS only دربیاد.
- ⚠️ این کار رو فقط بعد از اینکه مطمئن شدی SSL گیت‌هاب‌پیجز (مرحله ۵.۱) درست فعاله انجام بده.

### ۵.۵) Worker Route بساز
- Cloudflare Dashboard → دامنه `bytelabpro.xyz` → Workers Routes (یا از تنظیمات خود Worker → Triggers → Add route)
- Route pattern:
  ```
  menuproai.bytelabpro.xyz/USERS/*
  ```
- Worker مقصد: `menuproai-router`

از این به بعد:
- `menuproai.bytelabpro.xyz/dashboard.html` → از گیت‌هاب‌پیجز میاد (چون مسیرش با `/USERS/` شروع نمی‌شه)
- `menuproai.bytelabpro.xyz/USERS/kafe-boloot/menu.html` → از Worker مسیریاب میاد، که خودش `public-menu.html` رو سرو می‌کنه و اون صفحه سمت مرورگر اسلاگ (`kafe-boloot`) رو از آدرس می‌خونه و منو رو از `menuproai-worker` می‌گیره

---

## چک‌لیست تست نهایی

1. برو `menuproai.bytelabpro.xyz/dashboard.html` → ثبت‌نام کن → یه کافه با اسلاگ تستی بساز → چند دسته و آیتم اضافه کن
2. برو `menuproai.bytelabpro.xyz/USERS/{همون-اسلاگ}/menu.html` → باید منو رو با اسم/آیتم‌های واقعی ببینی
3. رو دکمه‌ی دستیار (☕) بزن و یه سوال بپرس → باید فقط از آیتم‌های همون کافه پیشنهاد بده
4. یه اسلاگ دیگه (که وجود نداره) امتحان کن → باید پیام «این منو پیدا نشد» رو ببینی، نه خطای خام

## نکات امنیتی که رعایت شده
- `menuproai-worker` فقط از `USERS_KV` می‌خونه، هیچ‌وقت چیزی توش نمی‌نویسه — پس نمی‌تونه دیتای کاربرهای سایت اصلی رو خراب کنه.
- هر endpoint نوشتنی (افزودن/ویرایش/حذف) قبل از هر کاری توکن رو با `USERS_KV.get("session:"+token)` چک می‌کنه؛ بدون توکن معتبر هیچ عملیاتی انجام نمی‌شه.
- هر کاربر فقط می‌تونه منوی خودش (بر اساس شماره‌ی تلفنِ توکنش) رو ویرایش کنه، نه منوی بقیه.
