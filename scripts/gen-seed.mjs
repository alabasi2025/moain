/**
 * يولّد seed.sql ببيانات تجريبية واقعية للمعاينة:
 * 14 معلمة، ~40 طالب، دورات بأسعار واتفاقات مختلفة، جهات، أقساط (مدفوعة/متأخرة/قادمة)، حصص اليوم (زوم + بث المنصة)، واجبات، رسائل.
 * كلمة مرور كل الحسابات: demo1234
 *
 * الأوقات نسبية لوقت التشغيل حتى تظهر حصص "مباشرة الآن" دائماً.
 * الاستخدام: node scripts/gen-seed.mjs && wrangler d1 execute edaat-db --local --file=./seed.sql
 */
import { webcrypto as crypto } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const PASSWORD = 'demo1234'
const ITER = 100_000
const enc = new TextEncoder()
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

// ملح واحد وتجزئة واحدة لكل الحسابات التجريبية (التجزئة مكلفة عمداً). في الإنتاج لكل حساب ملح مختلف.
const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
const key = await crypto.subtle.importKey('raw', enc.encode(PASSWORD), 'PBKDF2', false, ['deriveBits'])
const hash = hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(salt, 'hex'), iterations: ITER }, key, 256))

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const out = []
const ins = (table, row) => out.push(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`)

const now = Math.floor(Date.now() / 1000)
const RIYADH = 3 * 3600
const day = (offset) => new Date((now + RIYADH + offset * 86400) * 1000).toISOString().slice(0, 10)
const rid = () => hex(crypto.getRandomValues(new Uint8Array(10)))
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = (a) => a[Math.floor(rnd() * a.length)]

// ============ المستخدمون ============
let uid = 0
const users = []
const user = (role, name, phone, extra = {}) => {
  uid++
  users.push({ id: uid, role, name, phone })
  ins('users', { id: uid, role, name, phone, password_hash: hash, password_salt: salt, ...extra })
  return uid
}
const admin = user('admin', 'أ. سامية الراشد', '0500000001')
user('admin', 'مشرفة الحسابات', '0500000002')

const teacherNames = ['نورة القحطاني', 'ريم العتيبي', 'هيفاء الشمري', 'منيرة الدوسري', 'أمل الحربي', 'عبير الزهراني', 'لمى المطيري', 'سارة الغامدي', 'مها السبيعي', 'دلال العنزي', 'وعد الشهري', 'غادة المالكي', 'بشرى القرني', 'جواهر السلمي']
const teachers = teacherNames.map((n, i) => user('teacher', n, `05100000${String(i + 1).padStart(2, '0')}`))

const first = ['ريماس', 'جود', 'لين', 'تالا', 'رهف', 'سديم', 'غلا', 'ديم', 'جنى', 'لمار', 'يارا', 'حور', 'ميار', 'شهد', 'رتيل', 'أسيل', 'ليان', 'مرام', 'دانة', 'وتين', 'عبدالله', 'فيصل', 'سلطان', 'تركي', 'نواف', 'محمد', 'خالد', 'سعود', 'بندر', 'راكان', 'يزيد', 'مشاري', 'عمر', 'زياد', 'فهد', 'ماجد', 'ريان', 'حمد', 'سلمان', 'بدر']
const last = ['العتيبي', 'القحطاني', 'الشهري', 'الدوسري', 'الحربي', 'المطيري', 'الزهراني', 'الغامدي', 'العنزي', 'السبيعي']
const students = first.map((n, i) => user('student', `${n} ${last[i % last.length]}`, `05500000${String(i + 1).padStart(2, '0')}`, { guardian_name: `أبو ${pick(first.slice(20))}` }))

// ============ الجهات ============
ins('partners', { id: 1, name: 'مدارس رواد المعرفة', contact_phone: '0555111222', commission_bps: 1500 })
ins('partners', { id: 2, name: 'مسوّقة: أم فيصل', contact_phone: '0555333444', commission_bps: 1000 })
ins('partners', { id: 3, name: 'مركز بداية للتدريب', contact_phone: '0555777888', commission_bps: 2000 })

// ============ قاعات الزوم ============
ins('zoom_rooms', { id: 1, name: 'قاعة 1', account_label: 'حساب زوم (أ)', join_url: 'https://us05web.zoom.us/j/81234567890', passcode: 'Edaat1', host_key: '123456' })
ins('zoom_rooms', { id: 2, name: 'قاعة 2', account_label: 'حساب زوم (أ)', join_url: 'https://us05web.zoom.us/j/82234567890', passcode: 'Edaat2', host_key: '223456' })
ins('zoom_rooms', { id: 3, name: 'قاعة 3', account_label: 'حساب زوم (ب)', join_url: 'https://us05web.zoom.us/j/83234567890', passcode: 'Edaat3', host_key: '323456' })
ins('zoom_rooms', { id: 4, name: 'قاعة 4', account_label: 'حساب زوم (ب)', join_url: 'https://us05web.zoom.us/j/84234567890', passcode: 'Edaat4', host_key: '423456' })

// ============ الدورات ============
const courseDefs = [
  ['رياضيات — ثالث متوسط', 'الرياضيات', 60000, 'percent', 4000, 1],
  ['إنجليزي — تأسيس', 'اللغة الإنجليزية', 45000, 'percent', 4500, 2],
  ['فيزياء — ثاني ثانوي', 'الفيزياء', 70000, 'per_student', 25000, null],
  ['قدرات — كمي', 'القدرات والتحصيلي', 90000, 'percent', 3500, 3],
  ['كيمياء — ثالث ثانوي', 'الكيمياء', 70000, 'percent', 4000, null],
  ['تأسيس قراءة وكتابة', 'التأسيس والقراءة', 40000, 'fixed', 150000, 2],
  ['علوم — سادس ابتدائي', 'العلوم', 40000, 'percent', 4000, 1],
  ['إنجليزي — محادثة', 'اللغة الإنجليزية', 55000, 'percent', 5000, null],
  ['رياضيات — أول ثانوي', 'الرياضيات', 65000, 'per_student', 22000, 1],
  ['لغتي — رابع ابتدائي', 'اللغة العربية', 35000, 'percent', 4000, 2],
  ['تحصيلي — علمي', 'القدرات والتحصيلي', 95000, 'percent', 3500, 3],
  ['رياضيات — خامس ابتدائي', 'الرياضيات', 38000, 'percent', 4000, null],
  ['أحياء — ثاني ثانوي', 'الأحياء', 65000, 'fixed', 120000, null],
  ['إنجليزي — ستيب', 'اللغة الإنجليزية', 85000, 'percent', 4000, 3],
]
const courses = courseDefs.map(([title, subject, price, st, sv, partner], i) => {
  const id = i + 1
  ins('courses', { id, title, subject, teacher_id: teachers[i], partner_id: partner, price, teacher_share_type: st, teacher_share_value: sv, start_date: day(-45), end_date: day(45) })
  return { id, price, partner, teacher: teachers[i] }
})

// ============ التسجيلات والأقساط والدفعات ============
let eid = 0
const enrollments = []
students.forEach((s, i) => {
  const courseIdx = [i % courses.length, (i * 3 + 5) % courses.length].slice(0, i % 3 === 0 ? 2 : 1)
  for (const ci of courseIdx) {
    const co = courses[ci]
    if (enrollments.some((e) => e.student === s && e.course === co.id)) continue
    eid++
    const discount = i % 5 === 0 ? 0.9 : 1
    const agreed = Math.round((co.price * discount) / 100) * 100
    const partner = i % 4 === 0 ? co.partner : null
    enrollments.push({ id: eid, student: s, course: co.id, agreed })
    ins('enrollments', { id: eid, course_id: co.id, student_id: s, agreed_price: agreed, partner_id: partner })
    // 3 أقساط شهرية: الأول قبل 40 يوماً، الثاني قبل 10 أيام، الثالث بعد 20 يوماً
    const parts = [Math.floor(agreed / 3), Math.floor(agreed / 3), agreed - 2 * Math.floor(agreed / 3)]
    const dues = [day(-40), day(i % 6 === 1 ? -10 : 3), day(20)]
    parts.forEach((amount, k) => ins('installments', { enrollment_id: eid, amount, due_date: dues[k] }))
    // أنماط دفع: ملتزم / متأخر في القسط الثاني / دفع جزئي / دفع كامل
    const pattern = i % 6
    const pays = pattern === 5 ? [agreed] : pattern === 1 ? [parts[0]] : pattern === 3 ? [parts[0], Math.round(parts[1] / 2)] : [parts[0], ...(pattern === 0 ? [parts[1]] : [])]
    pays.forEach((amount, k) =>
      ins('payments', {
        enrollment_id: eid,
        amount,
        paid_on: day(-40 + k * 28 + (i % 4)),
        method: k % 3 === 2 ? 'cash' : 'transfer',
        reference: `TRX${100000 + eid * 10 + k}`,
        recorded_by: admin,
      }),
    )
  }
})

// ============ المصروفات والمستحقات المصروفة ============
ins('expenses', { course_id: null, category: 'اشتراك زوم', amount: 14800, spent_on: day(-20), note: 'حسابين × 74 ريال' })
ins('expenses', { course_id: null, category: 'سيرفر البث', amount: 2500, spent_on: day(-18), note: 'Contabo Cloud VPS' })
ins('expenses', { course_id: 1, category: 'إعلانات', amount: 30000, spent_on: day(-30), note: 'حملة سناب' })
ins('expenses', { course_id: 4, category: 'مواد تعليمية', amount: 45000, spent_on: day(-25), note: 'بنك أسئلة قدرات' })
ins('expenses', { course_id: 11, category: 'إعلانات', amount: 60000, spent_on: day(-15), note: 'حملة تحصيلي' })
ins('payouts', { payee_type: 'teacher', payee_id: teachers[0], course_id: 1, amount: 50000, paid_on: day(-5), note: 'دفعة أولى' })
ins('payouts', { payee_type: 'teacher', payee_id: teachers[3], course_id: 4, amount: 60000, paid_on: day(-5) })
ins('payouts', { payee_type: 'partner', payee_id: 1, course_id: 1, amount: 10000, paid_on: day(-3) })

// ============ الحصص ============
// حصص جارية الآن + لاحقاً اليوم + الأيام القادمة + سابقة
let lid = 0
const lesson = (courseIdx, title, startOffsetMin, durMin, provider, room, status) => {
  lid++
  const s = Math.floor((now + startOffsetMin * 60) / 60) * 60
  ins('lessons', {
    id: lid,
    course_id: courses[courseIdx].id,
    title,
    starts_at: s,
    ends_at: s + durMin * 60,
    provider,
    zoom_room_id: room,
    room_key: `edaat-${rid()}`,
    status,
    started_at: status === 'live' || status === 'ended' ? s : null,
    ended_at: status === 'ended' ? s + durMin * 60 : null,
  })
  return lid
}
// الآن: 4 قاعات زوم مشغولة + 2 بث المنصة (مثل واقعهم: القاعات لا تكفي)
lesson(0, 'حل المعادلات التربيعية', -20, 60, 'zoom', 1, 'live')
lesson(1, 'Present Simple — تدريبات', -15, 60, 'zoom', 2, 'live')
lesson(3, 'مسائل النسبة والتناسب', -30, 90, 'zoom', 3, 'live')
lesson(4, 'الاتزان الكيميائي', -10, 60, 'zoom', 4, 'live')
lesson(2, 'قوانين نيوتن — تطبيقات', -25, 60, 'jitsi', null, 'live')
lesson(6, 'الخلية ومكوناتها', -5, 45, 'jitsi', null, 'scheduled')
// تبدأ قريباً (نافذة الدخول مفتوحة)
lesson(7, 'Daily conversation', 10, 60, 'jitsi', null, 'scheduled')
// لاحقاً اليوم وبكرة
lesson(8, 'الدوال ورسمها', 150, 60, 'zoom', 1, 'scheduled')
lesson(9, 'درس الإملاء: الهمزة المتوسطة', 180, 45, 'zoom', 2, 'scheduled')
lesson(10, 'مراجعة الكيمياء العضوية', 200, 90, 'jitsi', null, 'scheduled')
for (let d = 1; d <= 6; d++) {
  lesson(d % courses.length, `حصة الأسبوع — ${d}`, d * 1440 + 60, 60, d % 2 ? 'zoom' : 'jitsi', d % 2 ? ((d % 4) + 1) : null, 'scheduled')
}
// سابقة (للأمس) مع تسجيلات
const past1 = lesson(0, 'تحليل العبارات الجبرية', -1440 + 60, 60, 'zoom', 1, 'ended')
const past2 = lesson(1, 'Vocabulary — Unit 3', -1440 + 180, 60, 'jitsi', null, 'ended')
const past3 = lesson(3, 'مراجعة القدرات — الجزء الأول', -2600, 90, 'jitsi', null, 'ended')

// ============ الواجبات والتسليمات ============
let aid = 0
const asg = (courseIdx, title, desc, dueOffsetH) => {
  aid++
  ins('assignments', { id: aid, course_id: courses[courseIdx].id, title, description: desc, due_at: now + dueOffsetH * 3600, max_grade: 10 })
  return aid
}
const a1 = asg(0, 'واجب: المعادلات التربيعية', 'حل التمارين من 1 إلى 10 صفحة 45، مع كتابة خطوات الحل كاملة.\nصوّر الحل وارفعه هنا.', 48)
asg(0, 'واجب: تحليل العبارات', 'حل ورقة العمل المرفقة.', -20)
const a3 = asg(1, 'Homework: Unit 3', 'Write 10 sentences using the present simple tense.', 30)
asg(3, 'اختبار قصير: النسبة', 'حل 15 سؤال قدرات كمي خلال 20 دقيقة وأرسل الإجابات.', 72)
const sub = (a, s, body, grade) =>
  ins('submissions', { assignment_id: a, student_id: s, body, submitted_at: now - 3600 * (grade === null ? 2 : 20), grade, feedback: grade !== null ? 'ممتاز، استمر 👏' : null, graded_at: grade !== null ? now - 3600 : null })
for (const e of enrollments.filter((e) => e.course === 1).slice(0, 3)) sub(a1, e.student, 'الحل مرفق: س = −2 أو س = −3', null)
for (const e of enrollments.filter((e) => e.course === 2).slice(0, 2)) sub(a3, e.student, 'I go to school every day...', 9)

// ============ الرسائل ============
const firstStudentC1 = enrollments.find((e) => e.course === 1).student
const msg = (from, to, body, agoMin, read = true) => ins('messages', { sender_id: from, recipient_id: to, body, created_at: now - agoMin * 60, read_at: read ? now - agoMin * 60 + 30 : null })
msg(firstStudentC1, teachers[0], 'أستاذة، ما فهمت خطوة إكمال المربع في السؤال الرابع 🙏', 180)
msg(teachers[0], firstStudentC1, 'ولا يهمك، راجع التسجيل من الدقيقة 25 وبنحلها سوا في الحصة الجاية بإذن الله 🌷', 170)
msg(firstStudentC1, teachers[0], 'تمام شكراً أستاذة', 165, false)
msg(teachers[0], admin, 'السلام عليكم، ممكن نضيف حصة مراجعة يوم الخميس لطلاب الثالث متوسط؟', 90, false)
msg(students[1], admin, 'السلام عليكم، حولت القسط الثاني اليوم رقم الحوالة TRX55821', 40, false)

// ============ طلبات من الموقع ============
ins('leads', { name: 'جود العتيبي', phone: '0551234567', grade: 'متوسط', subject: 'الرياضيات', created_at: now - 7200 })
ins('leads', { name: 'فيصل القحطاني', phone: '0559876543', grade: 'ثانوي', subject: 'القدرات والتحصيلي', created_at: now - 86400 })

// ============ ملاحظة للتسجيلات ============
// ملفات الفيديو التجريبية تُرفع لـ R2 عبر scripts/seed-media.mjs (بعد تشغيل الخادم) لأنها تحتاج R2 فعلي.
out.push(`INSERT INTO settings (key, value) VALUES ('seed_past_lessons', '${[past1, past2, past3].join(',')}');`)
out.push(`INSERT INTO settings (key, value) VALUES ('last_cleanup', '${now}');`)

writeFileSync(new URL('../seed.sql', import.meta.url), out.join('\n') + '\n')
console.log(`seed.sql: ${users.length} users, ${courses.length} courses, ${enrollments.length} enrollments, ${lid} lessons`)
