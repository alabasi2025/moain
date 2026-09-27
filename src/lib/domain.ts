/**
 * منطق الأعمال الصافي (بدون قاعدة بيانات) — قابل للاختبار بالكامل.
 */
import { applyBps } from './money'

// ================= الأقساط =================
export type InstallmentState = 'paid' | 'partial' | 'overdue' | 'due_soon' | 'upcoming'

export interface InstallmentIn {
  id: number
  amount: number
  due_date: string
}
export interface InstallmentOut extends InstallmentIn {
  covered: number
  remaining: number
  state: InstallmentState
}

/**
 * توزيع المدفوع على الأقساط بالأقدم استحقاقاً أولاً (FIFO).
 * - مدفوع بالكامل ⇐ paid
 * - تاريخه فات ولم يكتمل ⇐ overdue
 * - يستحق خلال `soonDays` ⇐ due_soon (أو partial إذا دُفع جزء منه)
 */
export function allocateInstallments(
  installments: InstallmentIn[],
  totalPaid: number,
  today: string,
  soonDays = 7,
): InstallmentOut[] {
  const soonLimit = addDays(today, soonDays)
  let pool = Math.max(0, totalPaid)
  return [...installments]
    .sort((a, b) => (a.due_date === b.due_date ? a.id - b.id : a.due_date < b.due_date ? -1 : 1))
    .map((i) => {
      const covered = Math.min(i.amount, pool)
      pool -= covered
      const remaining = i.amount - covered
      let state: InstallmentState
      if (remaining === 0) state = 'paid'
      else if (i.due_date < today) state = 'overdue'
      else if (covered > 0) state = 'partial'
      else if (i.due_date <= soonLimit) state = 'due_soon'
      else state = 'upcoming'
      return { ...i, covered, remaining, state }
    })
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** تقسيم مبلغ على عدد أقساط بالتساوي (الفرق يُضاف للقسط الأخير) بفاصل شهري */
export function splitInstallments(total: number, count: number, firstDue: string, everyDays = 30) {
  const n = Math.max(1, Math.min(24, Math.floor(count)))
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, k) => ({
    amount: k === n - 1 ? total - base * (n - 1) : base,
    due_date: addDays(firstDue, k * everyDays),
  })).filter((x) => x.amount > 0)
}

// ================= ربح وخسارة الدورة =================
export type ShareType = 'percent' | 'per_student' | 'fixed'

export interface CourseFinanceInput {
  teacher_share_type: ShareType
  teacher_share_value: number
  /** لكل تسجيل: المحصّل منه + نسبة الجهة التي جلبته (0 إن لم توجد) + هل هو نشط */
  enrollments: { collected: number; agreed_price: number; partner_bps: number; active: boolean }[]
  expenses: number
  teacher_paid: number
  partner_paid: number
}

export interface CourseFinance {
  expected: number // إجمالي المتفق عليه للتسجيلات النشطة
  collected: number // المحصّل فعلياً
  outstanding: number // المتبقي على الطلاب
  teacher_due: number // مستحق المعلمة
  partner_due: number // مستحق الجهات
  expenses: number
  net: number // صافي الربح (سالب = خسارة)
  margin_bps: number // هامش الربح من المحصّل
  teacher_paid: number
  teacher_balance: number // المتبقي للمعلمة
  partner_paid: number
  partner_balance: number
  students: number
}

export function teacherDue(type: ShareType, value: number, collected: number, activeStudents: number): number {
  switch (type) {
    case 'percent':
      return applyBps(collected, value)
    case 'per_student':
      return value * activeStudents
    case 'fixed':
      return value
  }
}

export function computeCourseFinance(i: CourseFinanceInput): CourseFinance {
  const active = i.enrollments.filter((e) => e.active)
  const collected = i.enrollments.reduce((s, e) => s + e.collected, 0)
  const expected = active.reduce((s, e) => s + e.agreed_price, 0)
  const outstanding = active.reduce((s, e) => s + Math.max(0, e.agreed_price - e.collected), 0)
  const teacher_due = teacherDue(i.teacher_share_type, i.teacher_share_value, collected, active.length)
  const partner_due = i.enrollments.reduce((s, e) => s + applyBps(e.collected, e.partner_bps), 0)
  const net = collected - teacher_due - partner_due - i.expenses
  return {
    expected,
    collected,
    outstanding,
    teacher_due,
    partner_due,
    expenses: i.expenses,
    net,
    margin_bps: collected > 0 ? Math.round((net * 10000) / collected) : 0,
    teacher_paid: i.teacher_paid,
    teacher_balance: teacher_due - i.teacher_paid,
    partner_paid: i.partner_paid,
    partner_balance: partner_due - i.partner_paid,
    students: active.length,
  }
}

// ================= الحصص =================
/** نافذة الدخول للحصة: من 15 دقيقة قبل البداية حتى 30 دقيقة بعد النهاية */
export const JOIN_EARLY_SEC = 15 * 60
export const JOIN_LATE_SEC = 30 * 60

export function canJoinNow(lesson: { starts_at: number; ends_at: number; status: string }, now: number) {
  if (lesson.status === 'cancelled' || lesson.status === 'ended') return false
  if (lesson.status === 'live') return true
  return now >= lesson.starts_at - JOIN_EARLY_SEC && now <= lesson.ends_at + JOIN_LATE_SEC
}

export function lessonPhase(lesson: { starts_at: number; ends_at: number; status: string }, now: number) {
  if (lesson.status === 'cancelled') return 'cancelled' as const
  if (lesson.status === 'ended') return 'ended' as const
  if (lesson.status === 'live') return 'live' as const
  if (now > lesson.ends_at + JOIN_LATE_SEC) return 'ended' as const
  if (now >= lesson.starts_at - JOIN_EARLY_SEC) return 'open' as const
  return 'upcoming' as const
}

/** هل يتداخل مجالان زمنيان نصف مفتوحين [a1,a2) و [b1,b2) */
export const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2

// ================= التسجيلات =================
/** R2: كل الأجزاء بنفس الحجم ما عدا الأخير، والحد الأدنى 5MiB */
export const PART_SIZE = 8 * 1024 * 1024
export const MAX_PARTS = 10_000

export function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number, end: number
  if (m[1] === '' && m[2] === '') return null
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix === 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size || start > end) return null
  return { offset: start, length: end - start + 1 }
}
