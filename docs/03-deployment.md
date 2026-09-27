# دليل النشر خطوة بخطوة

## المتطلبات
- حساب Cloudflare (مجاني)
- سيرفر سحابي Ubuntu 22.04/24.04 للبث: 4 أنوية و8GB رام (مثال: Contabo Cloud VPS، حوالي 20 إلى 26 ريال/شهر، في موقع أوروبا)
- دومين (حوالي 40 إلى 60 ريال/سنة)، مثل `edaat.sa`، مع نطاق فرعي للبث `meet.edaat.sa`

---

## الجزء 1: المنصة على Cloudflare

```bash
git clone https://github.com/alabasi2025/moain.git && cd moain
npm install
npx wrangler login
```

### 1. إنشاء قاعدة البيانات والتخزين
```bash
npx wrangler d1 create edaat-db
# انسخ database_id الناتج وضعه في wrangler.jsonc مكان local-dev-placeholder

npx wrangler r2 bucket create edaat-media
# (اختياري) شبكة أمان: حذف أي تسجيل أقدم من 3 أيام
npx wrangler r2 bucket lifecycle set edaat-media --file deploy/r2-lifecycle.json
```

### 2. الجداول
```bash
npm run db:migrate:prod
```

### 3. أول حساب إدارة
البيانات التجريبية **لا تُرفع للإنتاج**. أنشئ حساب الإدارة الأول هكذا:
```bash
node -e "
const c=require('crypto');const s=c.randomBytes(16).toString('hex');
const h=c.pbkdf2Sync(process.argv[1],Buffer.from(s,'hex'),100000,32,'sha256').toString('hex');
console.log(\`INSERT INTO users (role,name,phone,password_hash,password_salt) VALUES ('admin','\${process.argv[2]}','\${process.argv[3]}','\${h}','\${s}');\`)
" 'كلمة-مرور-قوية' 'أ. سامية الراشد' '05xxxxxxxx' > admin.sql
npx wrangler d1 execute edaat-db --remote --file=admin.sql && rm admin.sql
```

### 4. النشر
```bash
npx wrangler pages project create edaat-platform --production-branch main
npm run deploy
```

### 5. الأسرار
```bash
npx wrangler pages secret put CRON_SECRET --project-name edaat-platform       # نص عشوائي طويل
npx wrangler pages secret put JITSI_APP_SECRET --project-name edaat-platform  # من الجزء 2
```
> **لا تضع `DEMO_MODE` في الإنتاج.**

### 6. الدومين
Cloudflare Dashboard ⇐ Workers & Pages ⇐ edaat-platform ⇐ Custom domains ⇐ أضف `edaat.sa`.

---

## الجزء 2: سيرفر البث الخاص (Jitsi)

1. اشترِ السيرفر، واختر Ubuntu 24.04.
2. في DNS الدومين: سجل **A** باسم `meet` يشير إلى IP السيرفر (على Cloudflare خله **DNS only**، السحابة الرمادية، لأن البث يحتاج اتصال UDP مباشر).
3. ادخل على السيرفر وشغّل:
```bash
ssh root@IP
curl -fsSL https://raw.githubusercontent.com/alabasi2025/moain/main/deploy/jitsi/install.sh -o install.sh
DOMAIN=meet.edaat.sa EMAIL=admin@edaat.sa bash install.sh
```
4. السكربت يطبع **JITSI_APP_SECRET**. ضعه كسر في Cloudflare (الخطوة 5 أعلاه).
5. في `wrangler.jsonc`:
```jsonc
"vars": { "JITSI_DOMAIN": "meet.edaat.sa", "JITSI_APP_ID": "edaat", ... }
```
6. `npm run deploy`

### التحقق
- افتح `https://meet.edaat.sa`: يجب أن يطلب مصادقة، لأن الضيوف معطلون.
- من المنصة: ادخل كمعلمة ⇐ حصة على «بث المنصة» ⇐ تفتح الغرفة داخل الصفحة بدون تنبيه «وضع المعاينة».

> **وضع المعاينة:** إذا كان `JITSI_DOMAIN` فارغاً، تستخدم المنصة خادم `meet.jit.si` العام للتجربة فقط، وقد يقطع التضمين بعد 5 دقائق. للإنتاج لازم السيرفر الخاص.

---

## الجزء 3: قاعات الزوم
من لوحة الإدارة ⇐ **قاعات الزوم**: لكل مستخدم مرخص في الزوم ضع:
- **رابط الاجتماع الشخصي (PMI)** أو اجتماع متكرر «بدون وقت محدد»
- رمز الدخول، و**مفتاح المضيف** (Host Key، من إعدادات ملف الزوم الشخصي)، حتى تستلم المعلمة صلاحية المضيف

> كل حساب زوم Business يسمح بقاعتين متزامنتين حسب ما ذكره العميل. أدخل كل قاعة كسجل مستقل.

---

## الجزء 4 (اختياري): التنظيف المجدول
المنصة تنظف تلقائياً مع الزيارات. لضمان إضافي:
```bash
npx wrangler deploy deploy/cleanup-cron-worker.js --name edaat-cleanup \
  --compatibility-date 2026-09-01 --triggers "0 * * * *" --var SITE_URL:https://edaat.sa
npx wrangler secret put CRON_SECRET --name edaat-cleanup
```

---

## التكلفة الشهرية المتوقعة

| البند | التكلفة |
|---|---|
| Cloudflare Pages + D1 + R2 | 0 (ضمن الحدود المجانية: 5GB قاعدة بيانات، 10GB تخزين) |
| سيرفر البث (VPS) | حوالي 20 إلى 26 ريال |
| الدومين | حوالي 4 ريال/شهر (50 ريال/سنة) |
| اشتراكات الزوم الحالية | كما هي عند العميل |
| **الإجمالي الإضافي** | **حوالي 30 ريال/شهر** |

> التسجيلات تُحذف بعد 48 ساعة، فالتخزين يبقى صغيراً دائماً. تقدير: 14 حصة × ساعة × 400MB تقريباً = 5.6GB كحد أقصى في أي لحظة.
