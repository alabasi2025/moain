/**
 * الملف الشخصي + صور المستخدمين
 * - كل مستخدم: /me لتغيير صورته وكلمة مروره.
 * - الإدارة: تغيير صورة أي مستخدم من صفحته (/admin/users/:id/avatar).
 * - الصورة تُقص وتُصغّر في المتصفح (320×320 WebP ≈ 15–40KB) ثم يتحقق الخادم من النوع والحجم والتوقيع (magic bytes).
 * - التخزين في R2: avatars/{id}.  رقم النسخة avatar_v في الجدول يكسر التخزين المؤقت عند التغيير.
 */
import { Hono, type Context } from 'hono'
import { newPasswordRecord, requireRole } from '../lib/auth'
import { back, form, int } from '../lib/http'
import { page } from '../lib/render'
import { sha256Hex, verifyPassword } from '../lib/security'
import { fmtDateTime, nowSec } from '../lib/time'
import type { AppEnv } from '../lib/types'
import { Icon } from '../views/icons'
import { Avatar, PageHead, roleLabel } from '../views/layout'
import { getCookie } from 'hono/cookie'
import { SESSION_COOKIE } from '../lib/auth'

export const profileRoutes = new Hono<AppEnv>()

export const AVATAR_MAX_BYTES = 400 * 1024
const ALLOWED = ['image/webp', 'image/jpeg', 'image/png'] as const

/** يتحقق من توقيع الملف الفعلي (لا نثق بنوع المتصفح وحده) */
export function sniffImage(b: Uint8Array): (typeof ALLOWED)[number] | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

const avatarKey = (id: number) => `avatars/${id}`

async function saveAvatar(c: Context<AppEnv>, userId: number): Promise<string | null> {
  const f = await form(c)
  const file = f.avatar
  if (!(file instanceof File) || file.size === 0) return 'اختر صورة أولاً.'
  if (file.size > AVATAR_MAX_BYTES) return 'حجم الصورة كبير (الحد 400KB بعد القص).'
  const buf = new Uint8Array(await file.arrayBuffer())
  const type = sniffImage(buf)
  if (!type) return 'صيغة غير مدعومة. استخدم JPG أو PNG أو WebP.'
  await c.env.MEDIA.put(avatarKey(userId), buf, { httpMetadata: { contentType: type } })
  await c.env.DB.prepare('UPDATE users SET avatar_v = ?, avatar_type = ? WHERE id = ?').bind(nowSec(), type, userId).run()
  return null
}

async function removeAvatar(c: Context<AppEnv>, userId: number) {
  await c.env.MEDIA.delete(avatarKey(userId)).catch(() => {})
  await c.env.DB.prepare('UPDATE users SET avatar_v = NULL, avatar_type = NULL WHERE id = ?').bind(userId).run()
}

const wantsJson = (c: Context<AppEnv>) => (c.req.header('accept') ?? '').includes('application/json')

// ---- عرض الصورة (للمستخدمين المسجلين فقط) ----
profileRoutes.get('/avatars/:id', requireRole(), async (c) => {
  const obj = await c.env.MEDIA.get(avatarKey(int(c.req.param('id'))))
  if (!obj) return c.body(null, 404)
  return c.body(obj.body, 200, {
    'content-type': obj.httpMetadata?.contentType ?? 'image/webp',
    // الرابط يحمل ?v=نسخة، لذا آمن تخزينه طويلاً؛ private لأنه خلف تسجيل الدخول
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  })
})

// ---- صفحتي ----
profileRoutes.get('/me', requireRole(), async (c) => {
  const user = c.get('user')!
  const info = await c.env.DB.prepare(
    `SELECT u.created_at, u.guardian_name, u.avatar_v,
       (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > unixepoch()) AS sessions
     FROM users u WHERE u.id = ?`,
  )
    .bind(user.id)
    .first<{ created_at: number; guardian_name: string | null; avatar_v: number | null; sessions: number }>()
  return page(
    c,
    'ملفي الشخصي',
    <>
      <PageHead title="ملفي الشخصي" sub="صورتك تظهر في الرسائل والقوائم وأعلى الصفحة." />
      <div class="grid grid-main">
        <div class="card profile-card">
          <div class="profile-cover" aria-hidden="true"></div>
          <div class="profile-body">
            <AvatarEditor id={user.id} name={user.name} v={info?.avatar_v} action="/me/avatar" />
            <h2 class="mb-0">{user.name}</h2>
            <p class="muted" style="margin:.2rem 0 1rem">
              <span class="badge">{roleLabel[user.role]}</span>
            </p>
            <dl class="kv">
              <dt>
                <Icon name="smartphone" /> الجوال
              </dt>
              <dd class="num">{user.phone}</dd>
              {info?.guardian_name && (
                <>
                  <dt>
                    <Icon name="users-round" /> ولي الأمر
                  </dt>
                  <dd>{info.guardian_name}</dd>
                </>
              )}
              <dt>
                <Icon name="calendar-days" /> عضو منذ
              </dt>
              <dd>{fmtDateTime(info?.created_at ?? nowSec())}</dd>
              <dt>
                <Icon name="laptop" /> الأجهزة المتصلة
              </dt>
              <dd class="num">{info?.sessions ?? 1}</dd>
            </dl>
            <p class="hint mt">لتعديل الاسم أو رقم الجوال تواصل مع الإدارة.</p>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-head">
              <h2>
                <Icon name="key-round" /> تغيير كلمة المرور
              </h2>
            </div>
            <form method="post" action="/me/password" autocomplete="off">
              <div class="field">
                <label for="cur">كلمة المرور الحالية</label>
                <input id="cur" name="current" type="password" required autocomplete="current-password" />
              </div>
              <div class="form-grid">
                <div class="field">
                  <label for="np">الجديدة</label>
                  <input id="np" name="password" type="password" required minlength={8} autocomplete="new-password" data-strength="pwMeter" />
                </div>
                <div class="field">
                  <label for="np2">تأكيدها</label>
                  <input id="np2" name="password2" type="password" required minlength={8} autocomplete="new-password" />
                </div>
              </div>
              <div class="pw-meter" id="pwMeter" aria-live="polite">
                <i></i>
                <span></span>
              </div>
              <label class="check mt">
                <input type="checkbox" name="logout_others" value="1" checked /> تسجيل الخروج من الأجهزة الأخرى
              </label>
              <div class="mt">
                <button class="btn">
                  <Icon name="check" /> حفظ كلمة المرور
                </button>
              </div>
            </form>
          </div>
          <div class="card">
            <div class="card-head">
              <h2>
                <Icon name="shield-check" /> الخصوصية والأمان
              </h2>
            </div>
            <ul class="checks">
              <li>
                <span class="ck">
                  <Icon name="check" />
                </span>
                كلمة مرورك مشفرة (PBKDF2) ولا يطّلع عليها أحد.
              </li>
              <li>
                <span class="ck">
                  <Icon name="check" />
                </span>
                صورتك لا تظهر إلا لمستخدمي المنصة المسجلين.
              </li>
              <li>
                <span class="ck">
                  <Icon name="check" />
                </span>
                الجلسة تنتهي تلقائياً بعد 30 يوماً من آخر دخول.
              </li>
            </ul>
            <form method="post" action="/logout" class="mt">
              <button class="btn btn-danger">
                <Icon name="log-out" class="flip" /> تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      </div>
    </>,
    { scripts: ['/static/avatar.js'] },
  )
})

/** محرر الصورة: معاينة + أزرار؛ القص الفعلي في avatar.js */
export const AvatarEditor = ({ id, name, v, action }: { id: number; name: string; v?: number | null; action: string }) => (
  <div class="avatar-editor" data-avatar-editor data-action={action}>
    <Avatar name={name} id={id} v={v} size="xl" />
    <label class="avatar-cam" title="تغيير الصورة">
      <Icon name="camera" />
      <span class="sr-only">تغيير الصورة</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" data-avatar-input hidden />
    </label>
    {v && (
      <form method="post" action={`${action}/delete`} data-confirm="حذف الصورة؟" class="avatar-del">
        <button class="icon-btn" title="حذف الصورة" aria-label="حذف الصورة">
          <Icon name="trash-2" />
        </button>
      </form>
    )}
  </div>
)

profileRoutes.post('/me/avatar', requireRole(), async (c) => {
  const err = await saveAvatar(c, c.get('user')!.id)
  if (wantsJson(c)) return c.json(err ? { error: err } : { ok: true }, err ? 400 : 200)
  return back(c, err ? 'bad' : 'ok', err ?? 'تم تحديث صورتك.', '/me')
})

profileRoutes.post('/me/avatar/delete', requireRole(), async (c) => {
  await removeAvatar(c, c.get('user')!.id)
  return back(c, 'ok', 'تم حذف الصورة.', '/me')
})

profileRoutes.post('/admin/users/:id/avatar', requireRole('admin'), async (c) => {
  const err = await saveAvatar(c, int(c.req.param('id')))
  if (wantsJson(c)) return c.json(err ? { error: err } : { ok: true }, err ? 400 : 200)
  return back(c, err ? 'bad' : 'ok', err ?? 'تم تحديث الصورة.')
})

profileRoutes.post('/admin/users/:id/avatar/delete', requireRole('admin'), async (c) => {
  await removeAvatar(c, int(c.req.param('id')))
  return back(c, 'ok', 'تم حذف الصورة.')
})

profileRoutes.post('/me/password', requireRole(), async (c) => {
  const user = c.get('user')!
  const f = await form(c)
  const cur = String(f.current ?? '')
  const pw = String(f.password ?? '')
  if (pw.length < 8) return back(c, 'bad', 'كلمة المرور الجديدة 8 أحرف على الأقل.', '/me')
  if (pw !== String(f.password2 ?? '')) return back(c, 'bad', 'التأكيد لا يطابق كلمة المرور الجديدة.', '/me')
  if (pw === cur) return back(c, 'bad', 'اختر كلمة مرور مختلفة عن الحالية.', '/me')
  const row = await c.env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>()
  if (!row || !(await verifyPassword(cur, row.password_salt, row.password_hash))) return back(c, 'bad', 'كلمة المرور الحالية غير صحيحة.', '/me')
  const rec = await newPasswordRecord(pw)
  const stmts = [c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(rec.password_hash, rec.password_salt, user.id)]
  if (f.logout_others === '1') {
    const mine = await sha256Hex(getCookie(c, SESSION_COOKIE) ?? '')
    stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, mine))
  }
  await c.env.DB.batch(stmts)
  return back(c, 'ok', 'تم تغيير كلمة المرور.', '/me')
})
