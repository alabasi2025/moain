/**
 * طبقة بيانات المالية: تجمع الأرقام من قاعدة البيانات ثم تمررها لمنطق domain.ts الصافي.
 */
import { allocateInstallments, computeCourseFinance, type CourseFinance, type InstallmentOut, type ShareType } from './domain'
import { todayRiyadh } from './time'

export interface CourseFinanceRow extends CourseFinance {
  id: number
  title: string
  teacher_id: number | null
  teacher_name: string | null
  status: string
}

/** ربح وخسارة كل الدورات (أو دورة واحدة) — استعلامات مجمعة بدون N+1 */
export async function courseFinances(db: D1Database, opts: { courseId?: number; teacherId?: number } = {}): Promise<CourseFinanceRow[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.courseId) {
    where.push('c.id = ?')
    binds.push(opts.courseId)
  }
  if (opts.teacherId) {
    where.push('c.teacher_id = ?')
    binds.push(opts.teacherId)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [courses, enrolls, expenses, payouts] = await db.batch([
    db.prepare(`SELECT c.id, c.title, c.teacher_id, t.name AS teacher_name, c.status, c.teacher_share_type, c.teacher_share_value
                FROM courses c LEFT JOIN users t ON t.id = c.teacher_id ${w} ORDER BY c.status, c.title`).bind(...binds),
    db.prepare(`SELECT e.course_id, e.agreed_price, e.status, COALESCE(p.commission_bps, 0) AS partner_bps,
                  COALESCE((SELECT SUM(amount) FROM payments y WHERE y.enrollment_id = e.id), 0) AS collected
                FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN partners p ON p.id = e.partner_id ${w}`).bind(...binds),
    db.prepare(`SELECT x.course_id, SUM(x.amount) AS total FROM expenses x JOIN courses c ON c.id = x.course_id ${w} GROUP BY x.course_id`).bind(...binds),
    db.prepare(`SELECT o.course_id, o.payee_type, SUM(o.amount) AS total FROM payouts o JOIN courses c ON c.id = o.course_id ${w} GROUP BY o.course_id, o.payee_type`).bind(
      ...binds,
    ),
  ])
  type C = { id: number; title: string; teacher_id: number | null; teacher_name: string | null; status: string; teacher_share_type: ShareType; teacher_share_value: number }
  type E = { course_id: number; agreed_price: number; status: string; partner_bps: number; collected: number }
  const ex = new Map((expenses.results as { course_id: number; total: number }[]).map((r) => [r.course_id, r.total]))
  const po = new Map<string, number>()
  for (const r of payouts.results as { course_id: number; payee_type: string; total: number }[]) po.set(`${r.course_id}:${r.payee_type}`, r.total)
  const byCourse = new Map<number, E[]>()
  for (const e of enrolls.results as E[]) {
    if (!byCourse.has(e.course_id)) byCourse.set(e.course_id, [])
    byCourse.get(e.course_id)!.push(e)
  }
  return (courses.results as C[]).map((c) => ({
    id: c.id,
    title: c.title,
    teacher_id: c.teacher_id,
    teacher_name: c.teacher_name,
    status: c.status,
    ...computeCourseFinance({
      teacher_share_type: c.teacher_share_type,
      teacher_share_value: c.teacher_share_value,
      enrollments: (byCourse.get(c.id) ?? []).map((e) => ({ collected: e.collected, agreed_price: e.agreed_price, partner_bps: e.partner_bps, active: e.status === 'active' })),
      expenses: ex.get(c.id) ?? 0,
      teacher_paid: po.get(`${c.id}:teacher`) ?? 0,
      partner_paid: po.get(`${c.id}:partner`) ?? 0,
    }),
  }))
}

export interface InstallmentView extends InstallmentOut {
  enrollment_id: number
  student_id: number
  student_name: string
  student_phone: string
  student_avatar_v?: number | null
  course_id: number
  course_title: string
}

/** حالة كل الأقساط (بعد توزيع المدفوعات عليها) — اختيارياً لطالب أو تسجيل محدد */
export async function installmentStates(db: D1Database, opts: { studentId?: number; enrollmentId?: number } = {}): Promise<InstallmentView[]> {
  const where: string[] = [`e.status = 'active'`]
  const binds: unknown[] = []
  if (opts.studentId) {
    where.push('e.student_id = ?')
    binds.push(opts.studentId)
  }
  if (opts.enrollmentId) {
    where.push('e.id = ?')
    binds.push(opts.enrollmentId)
  }
  const w = where.join(' AND ')
  const [inst, paid] = await db.batch([
    db.prepare(`SELECT i.id, i.amount, i.due_date, e.id AS enrollment_id, u.id AS student_id, u.name AS student_name, u.phone AS student_phone, u.avatar_v AS student_avatar_v,
                  c.id AS course_id, c.title AS course_title
                FROM installments i JOIN enrollments e ON e.id = i.enrollment_id JOIN users u ON u.id = e.student_id JOIN courses c ON c.id = e.course_id
                WHERE ${w}`).bind(...binds),
    db.prepare(`SELECT y.enrollment_id, SUM(y.amount) AS total FROM payments y JOIN enrollments e ON e.id = y.enrollment_id WHERE ${w} GROUP BY y.enrollment_id`).bind(...binds),
  ])
  const paidBy = new Map((paid.results as { enrollment_id: number; total: number }[]).map((r) => [r.enrollment_id, r.total]))
  const groups = new Map<number, (InstallmentView & { amount: number })[]>()
  for (const r of inst.results as InstallmentView[]) {
    if (!groups.has(r.enrollment_id)) groups.set(r.enrollment_id, [])
    groups.get(r.enrollment_id)!.push(r)
  }
  const today = todayRiyadh()
  const out: InstallmentView[] = []
  for (const [enr, rows] of groups) {
    const allocated = allocateInstallments(rows, paidBy.get(enr) ?? 0, today)
    const meta = new Map(rows.map((r) => [r.id, r]))
    for (const a of allocated) out.push({ ...meta.get(a.id)!, ...a })
  }
  return out.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id))
}

/** ملخص المالية العامة لفترة */
export async function financeSummary(db: D1Database, from: string, to: string) {
  const [pay, exp, pout] = await db.batch([
    db.prepare('SELECT COALESCE(SUM(amount),0) AS v, COUNT(*) AS n FROM payments WHERE paid_on BETWEEN ? AND ?').bind(from, to),
    db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE spent_on BETWEEN ? AND ?').bind(from, to),
    db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM payouts WHERE paid_on BETWEEN ? AND ?').bind(from, to),
  ])
  const collected = (pay.results[0] as { v: number; n: number }).v
  const count = (pay.results[0] as { v: number; n: number }).n
  const expenses = (exp.results[0] as { v: number }).v
  const payouts = (pout.results[0] as { v: number }).v
  return { collected, count, expenses, payouts, cashNet: collected - expenses - payouts }
}

/** التحصيل الشهري لآخر n شهر (لرسم بياني بسيط) */
export async function monthlyCollections(db: D1Database, months = 6) {
  const r = await db
    .prepare(
      `SELECT substr(paid_on, 1, 7) AS ym, SUM(amount) AS v FROM payments
       WHERE paid_on >= date('now', '+3 hours', 'start of month', ?) GROUP BY ym ORDER BY ym`,
    )
    .bind(`-${months - 1} months`)
    .all<{ ym: string; v: number }>()
  return r.results
}
