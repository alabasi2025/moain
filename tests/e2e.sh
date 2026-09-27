#!/usr/bin/env bash
# اختبار شامل من البداية للنهاية على الخادم المحلي: الصفحات، الصلاحيات، الأمان، الحصص، التسجيلات، الواجبات، الرسائل، المالية.
# الاستخدام: bash tests/e2e.sh [BASE_URL]
set -u
BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0; J=$(mktemp -d)
RUN=$(printf "%06d" $(( $(date +%s%N) % 1000000 )))   # معرّف فريد لكل تشغيل حتى لا تتداخل بيانات التشغيلات المتكررة
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗ %s\033[0m\n' "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
expect() { local want="$1" desc="$2"; shift 2; local got; got=$(code "$@"); [[ "$got" == "$want" ]] && ok "$desc ($got)" || bad "$desc: توقعت $want وجاء $got"; }
has()  { local desc="$1" pat="$2"; shift 2; curl -s "$@" | grep -q -- "$pat" && ok "$desc" || bad "$desc (لم يوجد: $pat)"; }
login(){ curl -s -o /dev/null -c "$J/$1" -H "Origin: $BASE" -d "phone=$2&password=demo1234" "$BASE/login"; }
H=(-H "Origin: $BASE")
# تصفير عداد محاولات الدخول (الاختبار نفسه يسجل محاولات خاطئة متعمدة)
npx wrangler d1 execute edaat-db --local --command "DELETE FROM login_attempts" >/dev/null 2>&1

echo "▶ عام"
expect 200 "الصفحة الرئيسية" "$BASE/"
has "SEO: عنوان ووصف وبيانات منظمة" 'application/ld+json' "$BASE/"
expect 200 "صفحة الدخول" "$BASE/login"
expect 200 "manifest PWA" "$BASE/manifest.webmanifest"
expect 200 "الأيقونة" "$BASE/static/icon-192.png"
expect 200 "robots.txt" "$BASE/robots.txt"
expect 303 "نموذج الحصة التجريبية" "${H[@]}" -d "name=اختبار&phone=0551112233&grade=متوسط&subject=الرياضيات" "$BASE/lead"
expect 303 "نموذج برقم غير صالح يُرفض بلطف" "${H[@]}" -d "name=x&phone=123" "$BASE/lead"

echo "▶ الأمان"
expect 302 "صفحة محمية بدون دخول ⇐ تحويل للدخول" "$BASE/admin"
expect 401 "API محمي بدون دخول" -X POST "${H[@]}" "$BASE/api/lessons/1/recordings"
expect 401 "كلمة مرور خاطئة" "${H[@]}" -d "phone=0500000001&password=wrong" "$BASE/login"
expect 403 "CSRF: طلب من موقع آخر يُرفض" -H "Origin: https://evil.example" -d "phone=0500000001&password=demo1234" "$BASE/login"
expect 401 "تنظيف Cron بدون سر" -X POST "$BASE/api/cron/cleanup"
curl -s -D - -o /dev/null "$BASE/" | grep -qi 'x-frame-options: SAMEORIGIN' && ok "ترويسات أمان (X-Frame-Options)" || bad "ترويسات الأمان"
login admin 0500000001; login teacher 0510000001; login teacher2 0510000002; login student 0550000001
grep -q edaat_sid "$J/admin" && ok "دخول الإدارة" || bad "دخول الإدارة"
grep -q HttpOnly "$J/admin" 2>/dev/null || grep -q '#HttpOnly_' "$J/admin" && ok "الكوكي HttpOnly" || bad "الكوكي HttpOnly"

A=(-b "$J/admin" "${H[@]}"); T=(-b "$J/teacher" "${H[@]}"); T2=(-b "$J/teacher2" "${H[@]}"); S=(-b "$J/student" "${H[@]}")

echo "▶ الصلاحيات بين الأدوار"
expect 403 "الطالب لا يدخل لوحة الإدارة" "${S[@]}" "$BASE/admin"
expect 403 "المعلمة لا تدخل المالية" "${T[@]}" "$BASE/admin/finance"
expect 403 "الطالب لا يجدول حصصاً" "${S[@]}" "$BASE/lessons"
expect 403 "الطالب لا يبدأ رفع تسجيل" -X POST "${S[@]}" -H 'content-type: application/json' -d '{}' "$BASE/api/lessons/1/recordings"

echo "▶ صفحات الإدارة"
for p in /admin /admin/live /lessons /admin/courses /admin/courses/1 "/admin/users?role=teacher" "/admin/users?role=student" /admin/users/3 /admin/users/17 /admin/rooms /admin/partners /admin/leads /admin/finance /admin/finance/installments /admin/finance/payouts /admin/finance/expenses /admin/finance/course/1 /admin/enrollments/1 /messages /admin/assignments /admin/recordings; do
  expect 200 "الإدارة $p" "${A[@]}" "$BASE$p"
done
has "الحصص المباشرة تظهر" 'مباشر الآن' "${A[@]}" "$BASE/admin/live"
has "القاعات الأربع مشغولة" 'قاعة 4' "${A[@]}" "$BASE/admin/live"
has "تقرير الربح والخسارة" 'صافي' "${A[@]}" "$BASE/admin/finance/course/1"
has "الأقساط المتأخرة تظهر" 'متأخر' "${A[@]}" "$BASE/admin/finance/installments"
has "طلب الموقع وصل للإدارة" 'اختبار' "${A[@]}" "$BASE/admin/leads"
curl -s "${A[@]}" "$BASE/admin/finance/export/courses.csv" | head -c 3 | od -An -tx1 | grep -q 'ef bb bf' && ok "تصدير CSV بترميز يفتح في Excel" || bad "CSV"

echo "▶ المعلمة"
for p in /teacher /lessons /teacher/assignments /teacher/recordings /teacher/earnings /lessons/1 /assignments/1; do expect 200 "المعلمة $p" "${T[@]}" "$BASE$p"; done
has "المعلمة ترى مفتاح المضيف" 'مفتاح المضيف' "${T[@]}" "$BASE/lessons/1"
expect 404 "المعلمة لا ترى حصة دورة غيرها" "${T[@]}" "$BASE/lessons/2"
expect 404 "المعلمة لا ترى واجب دورة غيرها" "${T[@]}" "$BASE/assignments/3"

echo "▶ الطالب"
for p in /student /student/recordings /student/assignments /student/payments /messages; do expect 200 "الطالب $p" "${S[@]}" "$BASE$p"; done
has "الطالب يرى حصته المباشرة" 'حصتك الآن' "${S[@]}" "$BASE/student"
has "الطالب يرى رابط الزوم لحصته" 'zoom.us' "${S[@]}" "$BASE/lessons/1"
curl -s "${S[@]}" "$BASE/lessons/1" | grep -q 'مفتاح المضيف' && bad "الطالب يرى مفتاح المضيف!" || ok "الطالب لا يرى مفتاح المضيف"
expect 404 "الطالب لا يدخل حصة دورة غير مسجل بها" "${S[@]}" "$BASE/lessons/2"
expect 404 "الطالب لا يفتح رسائل مع غير المسموح" "${S[@]}" "$BASE/messages?with=4"

echo "▶ جدولة الحصص وتوزيع القاعات"
FUT=$(TZ=Asia/Riyadh date -d "+$((RANDOM % 3000 + 30)) days 10:00" +%Y-%m-%dT%H:%M)
for i in 1 2 3 4 5; do curl -s -o /dev/null "${A[@]}" -d "course_id=$i&title=اختبار توزيع $RUN-$i&starts_at=$FUT&duration=60&provider=auto&repeat=1" "$BASE/lessons"; done
R=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT provider, zoom_room_id FROM lessons WHERE title LIKE 'اختبار توزيع $RUN-%' ORDER BY id" 2>/dev/null | tr -d ' \n')
ZOOMS=$(echo "$R" | grep -o '"provider":"zoom"' | wc -l); JITSI=$(echo "$R" | grep -o '"provider":"jitsi"' | wc -l)
ROOMS=$(echo "$R" | grep -oE "\"zoom_room_id\":[0-9]+" | sort -u | wc -l)
[[ $ZOOMS == 4 && $JITSI == 1 && $ROOMS == 4 ]] && ok "5 حصص متزامنة ⇐ 4 قاعات زوم مختلفة + 1 بث المنصة" || bad "التوزيع: zoom=$ZOOMS jitsi=$JITSI rooms=$ROOMS ($R)"
curl -s -o /dev/null "${A[@]}" -d "course_id=6&title=زوم فقط ممتلئ $RUN&starts_at=$FUT&duration=60&provider=zoom&repeat=1" "$BASE/lessons"
N=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT COUNT(*) n FROM lessons WHERE title='زوم فقط ممتلئ $RUN'" 2>/dev/null | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[[ "$N" == 0 ]] && ok "«زوم فقط» مع امتلاء القاعات يُرفض بدل التعارض" || bad "حُجزت قاعة متعارضة"
expect 303 "المعلمة لا تجدول لدورة غيرها" "${T[@]}" -d "course_id=2&title=x&starts_at=$FUT&duration=60&provider=auto&repeat=1" "$BASE/lessons"
N2=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT COUNT(*) n FROM lessons WHERE title='x'" 2>/dev/null | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[[ "$N2" == 0 ]] && ok "…ولم تُنشأ الحصة" || bad "أنشأت المعلمة حصة لدورة غيرها"

echo "▶ غرفة بث المنصة"
has "غرفة البث تُضمَّن داخل المنصة" 'id="jitsiRoom"' "${A[@]}" "$BASE/lessons/5"

echo "▶ التسجيل: رفع مجزّأ ⇐ مشاهدة محمية ⇐ Range ⇐ انتهاء"
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=320x240:rate=10 -f lavfi -i sine=frequency=440 -t 3 -c:v libvpx -b:v 200k -c:a libopus "$J/t.webm" 2>/dev/null
SIZE=$(stat -c %s "$J/t.webm")
RID=$(curl -s "${T[@]}" -H 'content-type: application/json' -d '{"mime":"video/webm","source":"upload"}' "$BASE/api/lessons/1/recordings" | grep -o '"id":[0-9]*' | cut -d: -f2)
[[ -n "$RID" ]] && ok "إنشاء رفع مجزّأ (id=$RID)" || bad "إنشاء الرفع"
expect 404 "معلمة أخرى لا تكمل رفع غيرها" -X PUT "${T2[@]}" --data-binary @"$J/t.webm" "$BASE/api/recordings/$RID/parts/1"
expect 200 "رفع الجزء 1" -X PUT "${T[@]}" --data-binary @"$J/t.webm" "$BASE/api/recordings/$RID/parts/1"
expect 200 "إكمال الرفع" -X POST "${T[@]}" "$BASE/api/recordings/$RID/complete"
expect 200 "الطالب يفتح صفحة المشاهدة" "${S[@]}" "$BASE/recordings/$RID"
has "العلامة المائية باسم الطالب ورقمه" '0550000001' "${S[@]}" "$BASE/recordings/$RID"
has "المشغل بدون زر تحميل" 'nodownload' "${S[@]}" "$BASE/recordings/$RID"
expect 200 "بث الفيديو داخل الصفحة" "${S[@]}" -H 'Sec-Fetch-Dest: video' "$BASE/media/recordings/$RID"
expect 206 "دعم التقديم (Range)" "${S[@]}" -H 'Sec-Fetch-Dest: video' -H 'Range: bytes=0-99' "$BASE/media/recordings/$RID"
expect 403 "فتح رابط الفيديو مباشرة في المتصفح مرفوض" "${S[@]}" -H 'Sec-Fetch-Dest: document' "$BASE/media/recordings/$RID"
curl -s -D - -o /dev/null "${S[@]}" -H 'Sec-Fetch-Dest: video' "$BASE/media/recordings/$RID" | grep -qi 'cache-control: private, no-store' && ok "لا تخزين مؤقت للفيديو" || bad "cache-control"
expect 404 "طالب غير مسجل لا يشاهد" -b "$J/teacher2" -H 'Sec-Fetch-Dest: video' "$BASE/media/recordings/$RID"
npx wrangler d1 execute edaat-db --local --command "UPDATE recordings SET expires_at = unixepoch() - 1 WHERE id = $RID" >/dev/null 2>&1
expect 404 "بعد 48 ساعة: التسجيل لا يُعرض" "${S[@]}" "$BASE/recordings/$RID"
expect 404 "…ولا يُبث" "${S[@]}" -H 'Sec-Fetch-Dest: video' "$BASE/media/recordings/$RID"

echo "▶ الواجبات"
expect 303 "المعلمة تنشر واجباً بملف" "${T[@]}" -F course_id=1 -F title="واجب اختبار $RUN" -F due_at="$FUT" -F max_grade=10 -F "file=@$J/t.webm;filename=sheet.pdf" "$BASE/assignments"
AID=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT id FROM assignments WHERE title='واجب اختبار $RUN'" 2>/dev/null | grep -o '"id": *[0-9]*' | grep -o '[0-9]*$')
expect 200 "الطالب يحمّل ملف الواجب" "${S[@]}" "$BASE/files/assignment/$AID"
expect 303 "الطالب يسلّم" "${S[@]}" -F body="إجابتي" "$BASE/assignments/$AID/submit"
SID=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT id FROM submissions WHERE assignment_id=$AID" 2>/dev/null | grep -o '"id": *[0-9]*' | grep -o '[0-9]*$')
expect 303 "المعلمة تصحح" "${T[@]}" -d "grade=9&feedback=ممتاز" "$BASE/submissions/$SID/grade"
has "الطالب يرى درجته" '9</b> من 10' "${S[@]}" "$BASE/assignments/$AID"
expect 303 "رفع ملف بامتداد خطير يُرفض" "${T[@]}" -F course_id=1 -F title="خبيث" -F "file=@$J/t.webm;filename=x.exe" "$BASE/assignments"
N3=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT COUNT(*) n FROM assignments WHERE title='خبيث'" 2>/dev/null | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[[ "$N3" == 0 ]] && ok "…ولم يُحفظ" || bad "حُفظ ملف exe"

echo "▶ الرسائل"
expect 303 "الطالب يراسل معلمته" "${S[@]}" -d "to=3&body=سؤال عن الواجب" "$BASE/messages"
has "المعلمة تستلم الرسالة" 'سؤال عن الواجب' "${T[@]}" "$BASE/messages?with=17"
expect 303 "الطالب يحاول مراسلة معلمة ليست معلمته" "${S[@]}" -d "to=4&body=hack" "$BASE/messages"
N4=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT COUNT(*) n FROM messages WHERE body='hack'" 2>/dev/null | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[[ "$N4" == 0 ]] && ok "…ورُفضت" || bad "رسالة غير مسموحة وصلت"

echo "▶ المالية"
expect 303 "تسجيل تحويل" "${A[@]}" -d "amount=150&paid_on=$(date +%F)&method=transfer&reference=E2E-$RUN" "$BASE/admin/enrollments/2/payments"
expect 303 "تكرار نفس التحويل خلال دقيقتين" "${A[@]}" -d "amount=150&paid_on=$(date +%F)&method=transfer&reference=E2E-$RUN" "$BASE/admin/enrollments/2/payments"
N5=$(npx wrangler d1 execute edaat-db --local --json --command "SELECT COUNT(*) n FROM payments WHERE reference='E2E-$RUN'" 2>/dev/null | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[[ "$N5" == 1 ]] && ok "منع تكرار التحويل العرضي" || bad "تكرر التحويل ($N5)"
expect 303 "صرف مستحق معلمة" "${A[@]}" -d "payee_type=teacher&payee_id=3&course_id=1&amount=100" "$BASE/admin/finance/payouts"
expect 303 "إضافة مصروف" "${A[@]}" -d "category=اختبار&amount=50&spent_on=$(date +%F)&course_id=1" "$BASE/admin/finance/expenses"
expect 303 "تذكير قسط داخل المنصة" -X POST "${A[@]}" "$BASE/admin/installments/1/remind"
expect 303 "إنشاء دورة" "${A[@]}" -d "title=دورة اختبار&price=500&teacher_share_type=percent&teacher_share_value=40&teacher_id=3" "$BASE/admin/courses"
expect 303 "إنشاء طالب" "${A[@]}" -d "role=student&name=طالب جديد&phone=0590$RUN&password=secret123" "$BASE/admin/users"
curl -s -o /dev/null -c "$J/new" "${H[@]}" -d "phone=0590$RUN&password=secret123" "$BASE/login"
expect 200 "الطالب الجديد يدخل" -b "$J/new" "$BASE/student"

echo "▶ الملف الشخصي والصور وترقيم الصفحات"
expect 200 "صفحة ملفي" "${S[@]}" "$BASE/me"
expect 302 "ملفي بدون دخول ⇐ الدخول" "$BASE/me"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00' > "$J/a.jpg"
expect 303 "رفع صورة JPEG صالحة" "${S[@]}" -F "avatar=@$J/a.jpg;type=image/jpeg" "$BASE/me/avatar"
printf '<svg onload=alert(1)>..............' > "$J/x.png"
expect 400 "رفض ملف متنكر كصورة" "${S[@]}" -H "Accept: application/json" -F "avatar=@$J/x.png;type=image/png" "$BASE/me/avatar"
SID=$(curl -s "${S[@]}" "$BASE/me" | grep -o '/avatars/[0-9]*' | head -1)
expect 200 "عرض الصورة لمستخدم مسجل" "${A[@]}" "$BASE$SID"
expect 302 "الصورة محمية عن الزوار" "$BASE$SID"
expect 403 "الطالب لا يغيّر صورة غيره" "${S[@]}" -F "avatar=@$J/a.jpg;type=image/jpeg" "$BASE/admin/users/1/avatar"
expect 303 "حذف الصورة" -X POST "${S[@]}" "$BASE/me/avatar/delete"
expect 303 "كلمة مرور حالية خاطئة تُرفض بلطف" "${S[@]}" -d "current=nope&password=newpass123&password2=newpass123" "$BASE/me/password"
has "ترقيم: الأقساط مقسّمة لصفحات" 'aria-label="ترقيم الصفحات"' "${A[@]}" "$BASE/admin/finance/installments?filter=all"
expect 200 "ترقيم: صفحة خارج النطاق تُقيَّد بآخر صفحة" "${A[@]}" "$BASE/admin/users?role=student&page=9999"
has "بحث المستخدمين" 'cell-user' "${A[@]}" "$BASE/admin/users?role=student&q=05"

echo "▶ الخروج"
expect 303 "تسجيل الخروج" -X POST "${S[@]}" "$BASE/logout"
expect 302 "الجلسة أُلغيت فعلاً" -b "$J/student" "$BASE/student"

echo
echo "════════════════════════════"
printf "النتيجة: \033[32m%d نجح\033[0m / \033[31m%d فشل\033[0m\n" $PASS $FAIL
rm -rf "$J"
[[ $FAIL == 0 ]]
