// =======================================================================
// Pages Function هوش مصنوعی کافه بلوط
// این فایل باید داخل همون پروژه‌ی Cloudflare Pages سایت، در مسیر دقیق زیر باشه:
//   /functions/api/recommend.js
// یعنی از ریشه‌ی ریپو یک پوشه‌ی functions بساز، داخلش پوشه‌ی api،
// و این فایل رو با همین اسم (recommend.js) داخلش بذار.
//
// نیازمندی فقط یک مورد است:
//   در تنظیمات همین پروژه‌ی Pages (نه یک Worker جدا) برو به
//   Settings > Functions > AI bindings > Add binding، نامش رو AI بذار.
//
// دیگه نیازی به تنظیم MENU_URL نیست — خودش از روی همون دامنه‌ای که
// درخواست بهش اومده، menu.json رو پیدا می‌کند.
// دیگه نیازی به آدرس workers.dev هم نیست — چون همین پروژه، هم سایت رو
// سرو می‌کند و هم این تابع را، آدرس چت هم می‌شود همون دامنه‌ی خود سایت
// + "/api/recommend" (نمونه در index.html).
// =======================================================================

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function loadMenu(request) {
  const menuUrl = new URL("/menu.json", request.url).toString();
  const res = await fetch(menuUrl, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) throw new Error("دریافت منو ناموفق بود");
  return res.json();
}

function buildSystemPrompt(menu) {
  const compactItems = menu.items.map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category,
    price: it.price,
    tags: it.tags,
    desc: it.desc,
    ...(it.recipe ? { ingredients: it.recipe.ingredients } : {}),
  }));

  return `تو دستیار سفارش‌گیری «${menu.cafeName}» هستی. فقط و فقط از آیتم‌های زیر که در منوی واقعی کافه هستند پیشنهاد بده و هیچ‌وقت چیزی خارج از این لیست اختراع نکن.

منوی کامل (JSON):
${JSON.stringify(compactItems)}

قوانین پاسخ:
- همیشه به فارسی، بسیار مؤدبانه و محترمانه پاسخ بده (مثلاً با «لطفاً»، «بله حتماً»، «با کمال میل»)، و راهنمایی‌ات را با احترام کامل ارائه کن.
- پاسخ باید کوتاه و دقیق باشد؛ حداکثر یک جمله، بدون حاشیه یا توضیح اضافه.
- بر اساس ترجیح کاربر (گرم/سرد، شیرین/ترش/تلخ، با کافئین یا بدون، همراه با دسر و غیره) از میان آیتم‌های بالا ۱ تا ۳ مورد را انتخاب کن.
- اگر خواسته کاربر مبهم است، فقط یک سوال کوتاه و مؤدبانه بپرس تا انتخابش را محدود کند، ولی اگر می‌توانی حدس معقولی بزنی همان را پیشنهاد بده.
- خروجی را دقیقاً و فقط به‌صورت یک شیء JSON با این ساختار برگردان، بدون هیچ متن اضافه یا Markdown:
{"reply": "حداکثر یک جمله کوتاه، دقیق و بسیار مؤدبانه", "suggestions": [{"id": "شناسه دقیق از لیست بالا", "reason": "دلیل مناسب بودن این گزینه، در حداکثر چند کلمه کوتاه"}]}
- فیلد id باید دقیقاً یکی از شناسه‌های موجود در منو باشد، هیچ‌وقت شناسه جدید نساز.
- اگر فقط سوال می‌پرسی و هنوز پیشنهادی نداری، suggestions را آرایه خالی [] بگذار.`;
}

function safeParseModelJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/```json|```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "بدنه درخواست نامعتبر است" }, 400);
  }

  const message = (body.message || "").toString().slice(0, 500);
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  if (!message.trim()) {
    return json({ error: "پیام خالی است" }, 400);
  }

  let menu;
  try {
    menu = await loadMenu(request);
  } catch (e) {
    return json({ reply: "منو در حال حاضر در دسترس نیست، لطفاً بعداً امتحان کن.", suggestions: [] }, 200);
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(menu) },
    ...history.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: String(h.content).slice(0, 500) })),
    { role: "user", content: message },
  ];

  let aiResult;
  try {
    aiResult = await env.AI.run(MODEL, { messages, max_tokens: 600 });
  } catch (e) {
    return json({ reply: "با عرض پوزش، دستیار موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.", suggestions: [] }, 200);
  }

  const raw = aiResult.response || "";
  const parsed = safeParseModelJson(raw);

  if (!parsed || !parsed.reply) {
    return json({
      reply: raw.slice(0, 300) || "متوجه نشدم، می‌شه یه‌جور دیگه بگی چی می‌خوای؟",
      suggestions: [],
    });
  }

  const validIds = new Set(menu.items.map((it) => it.id));
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((s) => s && validIds.has(s.id)).slice(0, 3)
    : [];

  return json({ reply: parsed.reply, suggestions });
}

export async function onRequestGet() {
  return json({ error: "فقط POST مجاز است" }, 405);
}
