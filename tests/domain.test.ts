import { describe, expect, it } from 'vitest'
import { allocateInstallments, canJoinNow, computeCourseFinance, lessonPhase, overlaps, parseRange, splitInstallments, teacherDue } from '../src/lib/domain'
import { applyBps, formatSAR, parsePercent, parseSAR } from '../src/lib/money'
import { jitsiToken, hashPassword, verifyPassword } from '../src/lib/security'
import { normalizePhone, isValidPhone } from '../src/lib/auth'
import { parseLocalDateTime, toLocalInput } from '../src/lib/time'

describe('المال', () => {
  it('يحوّل الريال إلى هللات بدقة', () => {
    expect(parseSAR('1,250.50')).toBe(125050)
    expect(parseSAR('١٢٥٠')).toBe(125000)
    expect(parseSAR('0.1')).toBe(10)
    expect(parseSAR('abc')).toBeNull()
    expect(parseSAR('-5')).toBeNull()
    expect(parseSAR('1.234')).toBeNull()
  })
  it('النسب بنقاط الأساس', () => {
    expect(parsePercent('25')).toBe(2500)
    expect(parsePercent('12.5')).toBe(1250)
    expect(parsePercent('101')).toBeNull()
    expect(applyBps(100000, 2500)).toBe(25000)
  })
  it('التنسيق', () => {
    expect(formatSAR(125050)).toBe('1,250.50 ر.س')
    expect(formatSAR(-5000, false)).toBe('−50')
  })
})

describe('الأقساط', () => {
  const inst = [
    { id: 1, amount: 20000, due_date: '2026-08-01' },
    { id: 2, amount: 20000, due_date: '2026-09-25' },
    { id: 3, amount: 20000, due_date: '2026-10-02' },
    { id: 4, amount: 20000, due_date: '2026-11-01' },
  ]
  it('يوزع المدفوع على الأقدم أولاً ويحدد الحالات', () => {
    const r = allocateInstallments(inst, 30000, '2026-09-27')
    expect(r.map((x) => x.state)).toEqual(['paid', 'overdue', 'due_soon', 'upcoming'])
    expect(r[1].remaining).toBe(10000)
  })
  it('الدفع الجزئي لقسط لم يحن', () => {
    const r = allocateInstallments(inst, 50000, '2026-09-27')
    expect(r.map((x) => x.state)).toEqual(['paid', 'paid', 'partial', 'upcoming'])
  })
  it('الدفع الزائد لا يكسر الحساب', () => {
    const r = allocateInstallments(inst, 999999, '2026-09-27')
    expect(r.every((x) => x.state === 'paid' && x.remaining === 0)).toBe(true)
  })
  it('تقسيم المبلغ: المجموع مطابق تماماً', () => {
    const p = splitInstallments(100000, 3, '2026-09-01')
    expect(p.reduce((s, x) => s + x.amount, 0)).toBe(100000)
    expect(p.map((x) => x.due_date)).toEqual(['2026-09-01', '2026-10-01', '2026-10-31'])
  })
})

describe('ربح وخسارة الدورة', () => {
  const base = {
    enrollments: [
      { collected: 60000, agreed_price: 60000, partner_bps: 1500, active: true },
      { collected: 30000, agreed_price: 60000, partner_bps: 0, active: true },
      { collected: 20000, agreed_price: 60000, partner_bps: 0, active: false }, // منسحب دفع جزءاً
    ],
    expenses: 10000,
    teacher_paid: 20000,
    partner_paid: 0,
  }
  it('نسبة من المحصّل', () => {
    const f = computeCourseFinance({ ...base, teacher_share_type: 'percent', teacher_share_value: 4000 })
    expect(f.collected).toBe(110000)
    expect(f.teacher_due).toBe(44000)
    expect(f.partner_due).toBe(9000) // 15% من 60000 فقط
    expect(f.net).toBe(110000 - 44000 - 9000 - 10000)
    expect(f.outstanding).toBe(30000) // المنسحب لا يُحسب عليه متبقٍ
    expect(f.students).toBe(2)
    expect(f.teacher_balance).toBe(24000)
  })
  it('مبلغ لكل طالب نشط', () => {
    expect(teacherDue('per_student', 25000, 0, 3)).toBe(75000)
  })
  it('مبلغ ثابت قد يسبب خسارة', () => {
    const f = computeCourseFinance({ ...base, teacher_share_type: 'fixed', teacher_share_value: 150000 })
    expect(f.net).toBeLessThan(0)
    expect(f.margin_bps).toBeLessThan(0)
  })
})

describe('الحصص', () => {
  const l = { starts_at: 10_000, ends_at: 13_600, status: 'scheduled' }
  it('نافذة الدخول: 15 دقيقة قبل حتى 30 بعد', () => {
    expect(canJoinNow(l, 10_000 - 16 * 60)).toBe(false)
    expect(canJoinNow(l, 10_000 - 14 * 60)).toBe(true)
    expect(canJoinNow(l, 13_600 + 29 * 60)).toBe(true)
    expect(canJoinNow(l, 13_600 + 31 * 60)).toBe(false)
    expect(canJoinNow({ ...l, status: 'cancelled' }, 10_500)).toBe(false)
    expect(canJoinNow({ ...l, status: 'live' }, 99_999)).toBe(true) // حصة ممتدة
  })
  it('المراحل', () => {
    expect(lessonPhase(l, 0)).toBe('upcoming')
    expect(lessonPhase(l, 10_500)).toBe('open')
    expect(lessonPhase({ ...l, status: 'live' }, 10_500)).toBe('live')
  })
  it('التداخل الزمني نصف مفتوح (حصة تبدأ عند نهاية أخرى لا تتعارض)', () => {
    expect(overlaps(0, 60, 60, 120)).toBe(false)
    expect(overlaps(0, 61, 60, 120)).toBe(true)
  })
})

describe('Range', () => {
  it('يحلل الطلبات', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ offset: 0, length: 100 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ offset: 900, length: 100 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ offset: 900, length: 100 })
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ offset: 0, length: 1000 })
    expect(parseRange('bytes=2000-', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
  })
})

describe('الأمان', () => {
  it('تجزئة كلمة المرور والتحقق', async () => {
    const salt = '00112233445566778899aabbccddeeff'
    const h = await hashPassword('secret', salt)
    expect(await verifyPassword('secret', salt, h)).toBe(true)
    expect(await verifyPassword('Secret', salt, h)).toBe(false)
  })
  it('JWT للبث: صالح التوقيع والحقول', async () => {
    const t = await jitsiToken({ appId: 'edaat', secret: 's3cret', domain: 'meet.x.com', room: 'r1', user: { id: 5, name: 'نورة', moderator: true }, expiresAt: 2e9 })
    const [h, p, sig] = t.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    expect(payload).toMatchObject({ aud: 'edaat', iss: 'edaat', sub: 'meet.x.com', room: 'r1', moderator: true })
    expect(payload.context.user.affiliation).toBe('owner')
    const { createHmac } = await import('node:crypto')
    expect(createHmac('sha256', 's3cret').update(`${h}.${p}`).digest('base64url')).toBe(sig)
  })
  it('توحيد أرقام الجوال السعودية', () => {
    expect(normalizePhone('+966 55 123 4567')).toBe('0551234567')
    expect(normalizePhone('00966551234567')).toBe('0551234567')
    expect(normalizePhone('551234567')).toBe('0551234567')
    expect(normalizePhone('٠٥٥١٢٣٤٥٦٧')).toBe('0551234567')
    expect(isValidPhone('0551234567')).toBe(true)
    expect(isValidPhone('0451234567')).toBe(false)
  })
})

describe('الوقت (توقيت الرياض)', () => {
  it('ذهاب وإياب', () => {
    const t = parseLocalDateTime('2026-09-28T16:00')!
    expect(new Date(t * 1000).toISOString()).toBe('2026-09-28T13:00:00.000Z')
    expect(toLocalInput(t)).toBe('2026-09-28T16:00')
    expect(parseLocalDateTime('bad')).toBeNull()
  })
})
