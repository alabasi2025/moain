/**
 * المصادقة والصلاحيات
 * - جلسة بتوكن عشوائي في كوكي HttpOnly + Secure + SameSite=Lax، وقاعدة البيانات تحفظ SHA-256 للتوكن فقط.
 * - حماية CSRF: كل طلب غير GET يجب أن يأتي من نفس الأصل (Origin/Sec-Fetch-Site).
 * - الصلاحيات تُفرض في الخادم لكل مورد (دورة، حصة، تسجيل، واجب، رسالة).
 */
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, Role, SessionUser } from './types'
import { hashPassword, randomHex, sha256Hex, verifyPassword } from './security'
import { nowSec } from './time'

export const SESSION_COOKIE = 'edaat_sid'
const SESSION_TTL = 30 * 24 * 3600 // 30 يوماً
const LOGIN_WINDOW = 15 * 60
const LOGIN_MAX_PHONE = 8 // لكل رقم: يحمي الحساب من التخمين
const LOGIN_MAX_IP = 40 // لكل IP: أعلى لأن طلاب مدرسة/بيت قد يشتركون في نفس الشبكة

export async function newPasswordRecord(password: string) {
  const salt = randomHex(16)
  return { password_salt: salt, password_hash: await hashPassword(password, salt) }
}

export function normalizePhone(input: unknown): string {
  let s = String(input ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\d+]/g, '')
  if (s.startsWith('+966')) s = '0' + s.slice(4)
  else if (s.startsWith('00966')) s = '0' + s.slice(5)
  else if (s.startsWith('966') && s.length === 12) s = '0' + s.slice(3)
  else if (s.startsWith('5') && s.length === 9) s = '0' + s
  return s
}

export const isValidPhone = (p: string) => /^05\d{8}$/.test(p)

async function rateLimited(db: D1Database, key: string): Promise<boolean> {
  const now = nowSec()
  const row = await db.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?').bind(key).first<{ count: number; window_start: number }>()
  const max = key.startsWith('ip:') ? LOGIN_MAX_IP : LOGIN_MAX_PHONE
  return !!row && now - row.window_start < LOGIN_WINDOW && row.count >= max
}

async function recordFailure(db: D1Database, key: string) {
  const now = nowSec()
  await db
    .prepare(
      `INSERT INTO login_attempts (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ${LOGIN_WINDOW} THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ${LOGIN_WINDOW} THEN ?2 ELSE window_start END`,
    )
    .bind(key, now)
    .run()
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string }

export async function login(c: Context<AppEnv>, phoneRaw: unknown, password: unknown): Promise<LoginResult> {
  const db = c.env.DB
  const phone = normalizePhone(phoneRaw)
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  const keys = [`p:${phone}`, `ip:${ip}`]
  for (const k of keys) if (await rateLimited(db, k)) return { ok: false, error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' }

  const row = await db
    .prepare('SELECT id, role, name, phone, avatar_v, password_hash, password_salt, active FROM users WHERE phone = ?')
    .bind(phone)
    .first<SessionUser & { password_hash: string; password_salt: string; active: number }>()

  const valid = row ? await verifyPassword(String(password ?? ''), row.password_salt, row.password_hash) : false
  if (!row || !valid) {
    for (const k of keys) await recordFailure(db, k)
    return { ok: false, error: 'رقم الجوال أو كلمة المرور غير صحيحة.' }
  }
  if (!row.active) return { ok: false, error: 'الحساب موقوف. تواصل مع الإدارة.' }

  await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(`p:${phone}`).run()
  const token = randomHex(32)
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), row.id, nowSec() + SESSION_TTL)
    .run()
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  })
  return { ok: true, user: { id: row.id, role: row.role, name: row.name, phone: row.phone, avatar_v: row.avatar_v } }
}

export async function logout(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** يحمّل المستخدم من الكوكي (إن وجد) */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null)
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    const user = await c.env.DB.prepare(
      `SELECT u.id, u.role, u.name, u.phone, u.avatar_v FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
      .bind(await sha256Hex(token), nowSec())
      .first<SessionUser>()
    c.set('user', user ?? null)
  }
  await next()
}

/** حماية CSRF: رفض الطلبات المعدِّلة القادمة من موقع آخر */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const site = c.req.header('sec-fetch-site')
    const origin = c.req.header('origin')
    const self = new URL(c.req.url).origin
    const bad = (site && !['same-origin', 'none'].includes(site)) || (origin && origin !== self && origin !== 'null')
    if (bad) return c.text('طلب مرفوض (CSRF)', 403)
  }
  await next()
}

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) {
      if (c.req.method === 'GET' && !c.req.path.startsWith('/api/'))
        return c.redirect('/login?next=' + encodeURIComponent(c.req.path))
      return c.json({ error: 'يلزم تسجيل الدخول' }, 401)
    }
    if (roles.length && !roles.includes(user.role)) {
      return c.req.path.startsWith('/api/') ? c.json({ error: 'غير مصرح' }, 403) : c.text('غير مصرح لك بالوصول لهذه الصفحة', 403)
    }
    await next()
  }
}

export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : role === 'teacher' ? '/teacher' : '/student')

// ============ فحوصات الوصول للموارد ============
/** هل يحق للمستخدم الوصول لدورة: الإدارة دائماً، المعلمة لدوراتها، الطالب لدوراته النشطة */
export async function canAccessCourse(db: D1Database, user: SessionUser, courseId: number): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role === 'teacher') {
    return !!(await db.prepare('SELECT 1 FROM courses WHERE id = ? AND teacher_id = ?').bind(courseId, user.id).first())
  }
  return !!(await db
    .prepare(`SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ? AND status = 'active'`)
    .bind(courseId, user.id)
    .first())
}

/** هل يحق للمستخدم إدارة (تعديل) الدورة: الإدارة أو معلمتها */
export async function canManageCourse(db: D1Database, user: SessionUser, courseId: number): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role !== 'teacher') return false
  return !!(await db.prepare('SELECT 1 FROM courses WHERE id = ? AND teacher_id = ?').bind(courseId, user.id).first())
}

/**
 * من يحق له مراسلة من:
 * - الإدارة ⇐ الجميع، والجميع ⇐ الإدارة
 * - معلمة ⇔ طالب مسجّل (نشط) في إحدى دوراتها
 */
export async function canMessage(db: D1Database, from: SessionUser, toId: number): Promise<boolean> {
  if (from.id === toId) return false
  const to = await db.prepare('SELECT id, role FROM users WHERE id = ? AND active = 1').bind(toId).first<{ id: number; role: Role }>()
  if (!to) return false
  if (from.role === 'admin' || to.role === 'admin') return true
  const [teacherId, studentId] =
    from.role === 'teacher' && to.role === 'student' ? [from.id, to.id] : from.role === 'student' && to.role === 'teacher' ? [to.id, from.id] : [0, 0]
  if (!teacherId) return false
  return !!(await db
    .prepare(
      `SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE c.teacher_id = ? AND e.student_id = ? AND e.status = 'active' LIMIT 1`,
    )
    .bind(teacherId, studentId)
    .first())
}
