# التشغيل والصيانة

## المراقبة
| ماذا | كيف |
|---|---|
| المنصة تعمل؟ | `GET /health` ⇐ `{"ok":true}`. اربطه بمراقب مجاني مثل UptimeRobot كل 5 دقائق |
| أخطاء المنصة | `npx wrangler pages deployment tail --project-name edaat-platform` |
| سيرفر البث | `ssh root@IP` ثم `cd /opt/jitsi && docker compose ps` و`docker stats` |
| سجلات البث | `docker compose logs -f --tail=100 jvb` (أو `web` / `prosody` / `jicofo`) |

## النسخ الاحتياطي
قاعدة D1 فيها **Time Travel** (استرجاع لأي لحظة خلال آخر 30 يوماً):
```bash
npx wrangler d1 time-travel info edaat-db
npx wrangler d1 time-travel restore edaat-db --timestamp=2026-09-27T10:00:00Z
```
نسخة يدوية أسبوعية (تنحفظ على كمبيوتر الإدارة، زي ما اتفقنا مع العميل):
```bash
npx wrangler d1 export edaat-db --remote --output=backup-$(date +%F).sql
```
> التسجيلات لا تحتاج نسخ احتياطي لأنها مؤقتة (48 ساعة) بطبيعتها. ملفات الواجبات موجودة في R2.

## التحديث
```bash
git pull && npm ci && npm test && npm run db:migrate:prod && npm run deploy
```
**سيرفر البث:**
```bash
cd /opt/jitsi && docker compose pull && docker compose up -d
```

## إضافة ترحيل (Migration) جديد
```bash
# migrations/0002_xxx.sql
npm run db:migrate:local && npm test && bash tests/e2e.sh
npm run db:migrate:prod
```

## استكشاف الأخطاء

| المشكلة | السبب المحتمل | الحل |
|---|---|---|
| غرفة البث لا تفتح / «Authentication failed» | `JITSI_APP_SECRET` مختلف بين المنصة والسيرفر | قارن مع `/opt/jitsi/.jwt_secret` |
| الصوت/الفيديو لا يصل بين المشاركين | منفذ UDP 10000 مغلق، أو IP غير صحيح | `ufw status` + `JVB_ADVERTISE_IPS` في `.env`، وسجل DNS «DNS only» |
| شهادة SSL لم تصدر | DNS لم ينتشر، أو المنفذ 80 مغلق | انتظر ثم `docker compose restart web` |
| التسجيل عالق «جارِ الرفع» | انقطاع نت المعلمة | الأجزاء المرفوعة محفوظة، والرفوعات المعلقة أكثر من 24 ساعة تُلغى تلقائياً. ارفعي الملف من «رفع ملف» إن كان محفوظاً محلياً |
| الطالب يرى «غير متاح» للتسجيل | مرت 48 ساعة، أو ليس مسجلاً في الدورة | طبيعي / سجّله في الدورة |
| «محاولات كثيرة» عند الدخول | 8 محاولات خاطئة لنفس الرقم (أو 40 من نفس الشبكة) خلال 15 دقيقة | انتظر 15 دقيقة، أو أعد تعيين كلمة المرور من الإدارة |
| البث يتقطع وقت الذروة | موارد السيرفر | `docker stats`. رقّ الباقة (Contabo تسمح بالترقية بدقائق) |

## سعة السيرفر (تقدير)
Jitsi Videobridge يمرر الفيديو بدون معالجة ثقيلة. سيرفر 4 أنوية و8GB يتحمل عادة **عشرات المشاركين المتزامنين** في فصول صغيرة (2–7 طلاب). مع 14 معلمة × 7 طلاب = حوالي 112 مشارك في أسوأ حالة، وهو ضمن الممكن بجودة 720p وسرعة منفذ 500Mbit/s. **راقب أول أسبوع** ورقّ الباقة إذا تجاوز استهلاك CPU نسبة 70%.

## الأمان الدوري
- [ ] تحديث السيرفر تلقائياً (`unattended-upgrades` مفعّل من السكربت).
- [ ] تغيير كلمات مرور الحسابات الإدارية كل 6 أشهر.
- [ ] مراجعة المستخدمين الموقوفين والمعلمات اللي خلص تعاقدهن.
- [ ] مراجعة «سجل المشاهدات» عند الاشتباه في تسريب تسجيل.
