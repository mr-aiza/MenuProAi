// ============================================================
// menuproai-router.js — Worker مسیریاب برای صفحه‌ی عمومی منو
// -------------------------------------------------------------
// این Worker هر درخواستی که به الگوی
//   menuproai.bytelabpro.xyz/USERS/{اسلاگ}/menu.html
// بخوره رو می‌گیره، اول از menuproai-worker می‌پرسه این کافه از
// کدوم قالب استفاده می‌کنه (فیلد template تو رکورد منو)، بعد همون
// فایل HTML قالب رو (از گیت‌هاب‌پیجز همین ریپو) برمی‌گردونه.
//
// این Worker باید فقط رو مسیر زیر Route بشه (نه کل دامنه):
//   menuproai.bytelabpro.xyz/USERS/*
// بقیه‌ی مسیرها (/, /dashboard.html و ...) دست‌نخورده می‌رن سمت
// GitHub Pages، چون این Worker فقط رو همین یه الگو فعاله.
// ============================================================

// هر قالب جدیدی که اضافه کردی، فقط یه خط اینجا اضافه کن —
// کلید = همون مقداری که تو TEMPLATES آرایه‌ی dashboard.html و
// فیلد "template" رکورد منو (تو menuproai-worker.js) ذخیره می‌شه.
const TEMPLATE_FILES = {
  "classic-menu": "https://mr-aiza.github.io/MenuProAi/public-menu.html",
  "modern-grid": "https://mr-aiza.github.io/MenuProAi/public-menu-modern.html",
};
const DEFAULT_TEMPLATE = "classic-menu";

// آدرس همون Worker اصلی MenuProAI، برای پرسیدن «این کافه قالبش چیه؟»
const MENUPROAI_API = "https://menuproai-api.bytelab.workers.dev";

async function resolveTemplateKey(slug) {
  try {
    const res = await fetch(
      MENUPROAI_API + "/api/menu/public/" + encodeURIComponent(slug),
      { cf: { cacheTtl: 120, cacheEverything: true } }
    );
    if (!res.ok) return DEFAULT_TEMPLATE;
    const data = await res.json();
    const t = data && data.menu && data.menu.template;
    return TEMPLATE_FILES[t] ? t : DEFAULT_TEMPLATE;
  } catch (e) {
    return DEFAULT_TEMPLATE;
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // فقط الگوی /USERS/{اسلاگ}/menu.html رو جواب بده
    const match = url.pathname.match(/^\/USERS\/([^/]+)\/menu\.html$/i);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }
    const slug = decodeURIComponent(match[1]);

    try {
      const templateKey = await resolveTemplateKey(slug);
      const templateUrl = TEMPLATE_FILES[templateKey] || TEMPLATE_FILES[DEFAULT_TEMPLATE];

      const res = await fetch(templateUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (!res.ok) {
        return new Response("قالب صفحه در دسترس نیست", { status: 502 });
      }
      const html = await res.text();
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      return new Response("خطا در بارگذاری صفحه", { status: 500 });
    }
  },
};
