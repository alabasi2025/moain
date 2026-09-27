/**
 * التسجيلات
 *  - رفع مجزّأ (Multipart) إلى R2 أثناء الحصة: create ⇐ part × N ⇐ complete
 *  - بث محمي عبر الـ Worker مع دعم Range (للتقديم والتأخير) بعد التحقق من الصلاحية والصلاحية الزمنية
 *  - مشغل بعلامة مائية متحركة باسم الطالب ورقمه
 *  - تنظيف تلقائي بعد 48 ساعة
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { canAccessCourse, canManageCourse, requireRole } from '../lib/auth'
import { MAX_PARTS, PART_SIZE, parseRange } from '../lib/domain'
import { back, int } from '../lib/http'
import { lessonById, recordingsFor } from '../lib/queries'
import { notFound, page } from '../lib/render'
import { randomHex } from '../lib/security'
import { fmtDateTime, fmtRemaining, nowSec } from '../lib/time'
import type { AppEnv, Env, SessionUser } from '../lib/types'
import { Empty, PageHead, Pager } from '../views/layout'
import { paginate } from '../lib/paging'
import { Icon } from '../views/icons'

export const recordingRoutes = new Hono<AppEnv>()

const ttlSec = (env: Env) => Math.max(1, int(env.RECORDING_TTL_HOURS, 48)) * 3600
const MAX_TOTAL = 20 * 1024 * 1024 * 1024 // 20GB حد أعلى لكل تسجيل
const ALLOWED_MIME = /^video\/(webm|mp4|quicktime|x-matroska)$/

interface RecRow {
  id: number
  lesson_id: number
  course_id: number
  r2_key: string
  upload_id: string | null
  mime: string
  size: number
  status: string
  created_by: number | null
  expires_at: number | null
}

async function getRec(db: D1Database, id: number) {
  return db
    .prepare(`SELECT r.*, l.course_id FROM recordings r JOIN lessons l ON l.id = r.lesson_id WHERE r.id = ?`)
    .bind(id)
    .first<RecRow>()
}

/** صاحب الرفع فقط (أو الإدارة) يكمل الرفع */
async function ownUpload(db: D1Database, user: SessionUser, id: number) {
  const rec = await getRec(db, id)
  if (!rec || rec.status !== 'uploading' || !rec.upload_id) return null
  if (user.role !== 'admin' && rec.created_by !== user.id) return null
  return rec
}

// ============ واجهة الرفع (JSON) ============
recordingRoutes.post('/api/lessons/:id/recordings', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user')!
  const l = await lessonById(c.env.DB, int(c.req.param('id')))
  if (!l || !(await canManageCourse(c.env.DB, user, l.course_id))) return c.json({ error: 'غير مصرح' }, 403)
  if (l.status === 'cancelled') return c.json({ error: 'الحصة ملغاة' }, 400)
  const body = await c.req.json<{ mime?: string; source?: string }>().catch(() => ({}) as { mime?: string; source?: string })
  const mime = String(body.mime ?? 'video/webm').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_MIME.test(mime)) return c.json({ error: 'نوع الملف غير مدعوم. المسموح: فيديو WebM أو MP4.' }, 400)
  const source = body.source === 'upload' ? 'upload' : 'browser'
  const ext = mime.includes('mp4') || mime.includes('quicktime') ? 'mp4' : mime.includes('matroska') ? 'mkv' : 'webm'
  const key = `recordings/${l.course_id}/${l.id}/${randomHex(12)}.${ext}`
  const mpu = await c.env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: mime } })
  const res = await c.env.DB.prepare(
    `INSERT INTO recordings (lesson_id, r2_key, upload_id, mime, source, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(l.id, key, mpu.uploadId, mime, source, user.id)
    .first<{ id: number }>()
  return c.json({ id: res!.id, partSize: PART_SIZE })
})

recordingRoutes.put('/api/recordings/:id/parts/:n', requireRole('admin', 'teacher'), async (c) => {
  const rec = await ownUpload(c.env.DB, c.get('user')!, int(c.req.param('id')))
  if (!rec) return c.json({ error: 'الرفع غير موجود أو انتهى' }, 404)
  const n = int(c.req.param('n'))
  if (n < 1 || n > MAX_PARTS) return c.json({ error: 'رقم جزء غير صالح' }, 400)
  const len = int(c.req.header('content-length'), -1)
  if (len <= 0 || len > PART_SIZE) return c.json({ error: `حجم الجزء يجب ألا يتجاوز ${PART_SIZE} بايت` }, 400)
  if (!c.req.raw.body) return c.json({ error: 'جسم فارغ' }, 400)
  const mpu = c.env.MEDIA.resumeMultipartUpload(rec.r2_key, rec.upload_id!)
  const part = await mpu.uploadPart(n, c.req.raw.body)
  await c.env.DB.prepare(
    `INSERT INTO recording_parts (recording_id, part_number, etag, size) VALUES (?, ?, ?, ?)
     ON CONFLICT(recording_id, part_number) DO UPDATE SET etag = excluded.etag, size = excluded.size`,
  )
    .bind(rec.id, n, part.etag, len)
    .run()
  return c.json({ ok: true, part: n })
})

recordingRoutes.post('/api/recordings/:id/complete', requireRole('admin', 'teacher'), async (c) => {
  const rec = await ownUpload(c.env.DB, c.get('user')!, int(c.req.param('id')))
  if (!rec) return c.json({ error: 'الرفع غير موجود أو انتهى' }, 404)
  const parts = (
    await c.env.DB.prepare('SELECT part_number, etag, size FROM recording_parts WHERE recording_id = ? ORDER BY part_number')
      .bind(rec.id)
      .all<{ part_number: number; etag: string; size: number }>()
  ).results
  if (!parts.length) return c.json({ error: 'لا توجد أجزاء مرفوعة' }, 400)
  // تحقق: أرقام متتالية، وكل الأجزاء بنفس الحجم ما عدا الأخير (شرط R2)
  const ok = parts.every((p, i) => p.part_number === i + 1 && (i === parts.length - 1 || p.size === PART_SIZE))
  if (!ok) return c.json({ error: 'أجزاء ناقصة أو غير متسلسلة، أعد المحاولة' }, 409)
  const size = parts.reduce((s, p) => s + p.size, 0)
  if (size > MAX_TOTAL) return c.json({ error: 'حجم التسجيل كبير جداً' }, 413)
  const mpu = c.env.MEDIA.resumeMultipartUpload(rec.r2_key, rec.upload_id!)
  await mpu.complete(parts.map((p) => ({ partNumber: p.part_number, etag: p.etag })))
  const now = nowSec()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE recordings SET status = 'ready', size = ?, ready_at = ?, expires_at = ?, upload_id = NULL WHERE id = ?`).bind(
      size,
      now,
      now + ttlSec(c.env),
      rec.id,
    ),
    c.env.DB.prepare('DELETE FROM recording_parts WHERE recording_id = ?').bind(rec.id),
  ])
  return c.json({ ok: true, id: rec.id, size, expiresAt: now + ttlSec(c.env) })
})

recordingRoutes.post('/api/recordings/:id/abort', requireRole('admin', 'teacher'), async (c) => {
  const rec = await ownUpload(c.env.DB, c.get('user')!, int(c.req.param('id')))
  if (!rec) return c.json({ ok: true })
  await c.env.MEDIA.resumeMultipartUpload(rec.r2_key, rec.upload_id!).abort().catch(() => {})
  await c.env.DB.prepare(`UPDATE recordings SET status = 'failed', upload_id = NULL WHERE id = ?`).bind(rec.id).run()
  return c.json({ ok: true })
})

// ============ البث المحمي ============
async function viewable(c: { env: Env }, user: SessionUser, id: number) {
  const rec = await getRec(c.env.DB, id)
  if (!rec || rec.status !== 'ready' || !rec.expires_at || rec.expires_at <= nowSec()) return null
  if (!(await canAccessCourse(c.env.DB, user, rec.course_id))) return null
  return rec
}

recordingRoutes.get('/media/recordings/:id', requireRole(), async (c) => {
  const user = c.get('user')!
  const rec = await viewable(c, user, int(c.req.param('id')))
  if (!rec) return c.text('غير متاح', 404)
  // منع التحميل المباشر بفتح الرابط: المتصفح يرسل Sec-Fetch-Dest=video لطلبات عنصر الفيديو
  const dest = c.req.header('sec-fetch-dest')
  if (dest && !['video', 'audio', 'empty'].includes(dest)) return c.text('المشاهدة متاحة من داخل المنصة فقط', 403)

  const range = parseRange(c.req.header('range') ?? null, rec.size)
  const obj = await c.env.MEDIA.get(rec.r2_key, range ? { range } : undefined)
  if (!obj) return c.text('غير متاح', 404)
  const headers = new Headers({
    'content-type': rec.mime,
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  })
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${rec.size}`)
    headers.set('content-length', String(range.length))
    return new Response(obj.body, { status: 206, headers })
  }
  headers.set('content-length', String(rec.size))
  return new Response(obj.body, { status: 200, headers })
})

recordingRoutes.get('/recordings/:id', requireRole(), async (c) => {
  const user = c.get('user')!
  const id = int(c.req.param('id'))
  const rec = await viewable(c, user, id)
  if (!rec) return notFound(c, 'هذا التسجيل غير متاح. التسجيلات تبقى 48 ساعة فقط بعد الحصة.')
  const l = await lessonById(c.env.DB, rec.lesson_id)
  // سجل المشاهدة (مرة كل 30 دقيقة للمستخدم)
  await c.env.DB.prepare(
    `INSERT INTO recording_views (recording_id, user_id)
     SELECT ?1, ?2 WHERE NOT EXISTS (SELECT 1 FROM recording_views WHERE recording_id = ?1 AND user_id = ?2 AND viewed_at > unixepoch() - 1800)`,
  )
    .bind(id, user.id)
    .run()
  const mark = `${user.name} • ${user.phone}`
  return page(
    c,
    l?.title ?? 'تسجيل',
    <>
      <PageHead title={l?.title ?? 'تسجيل الحصة'} sub={`${l?.course_title ?? ''} • متاح لمدة ${fmtRemaining(rec.expires_at! - nowSec())}`}>
        <a class="btn btn-ghost" href={user.role === 'student' ? '/student/recordings' : `/lessons/${rec.lesson_id}`}>
          رجوع
        </a>
      </PageHead>
      <div class="player" id="player" data-mark={mark}>
        <video
          id="vid"
          src={`/media/recordings/${id}`}
          controls
          playsinline
          preload="metadata"
          controlslist="nodownload noplaybackrate noremoteplayback"
          disablepictureinpicture
          disableremoteplayback
          oncontextmenu="return false"
        ></video>
        <div class="watermark" id="wm">
          {mark}
        </div>
        <div class="watermark faint" style="top:40%;left:18%">
          {mark}
        </div>
      </div>
      <p class="muted mt" style="font-size:.85rem">
        <Icon name="lock" /> هذا التسجيل خاص بك ومحمي باسمك ورقمك. مشاركته أو نشره مخالف لسياسة المنصة ويمكن تتبع مصدره.
      </p>
    </>,
    { scripts: ['/static/player.js'] },
  )
})

// ============ الحذف (المعلمة/الإدارة) ============
recordingRoutes.post('/recordings/:id/delete', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user')!
  const rec = await getRec(c.env.DB, int(c.req.param('id')))
  if (!rec || !(await canManageCourse(c.env.DB, user, rec.course_id))) return notFound(c)
  await c.env.MEDIA.delete(rec.r2_key).catch(() => {})
  await c.env.DB.prepare(`UPDATE recordings SET status = 'deleted' WHERE id = ?`).bind(rec.id).run()
  return back(c, 'ok', 'تم حذف التسجيل نهائياً.')
})

// ============ قوائم التسجيلات ============
export async function recordingsPage(c: Context<AppEnv>) {
  const user = c.get('user')!
  const recs = await recordingsFor(c.env.DB, user)
  const { items, info } = paginate(recs, c.req.url)
  const now = nowSec()
  return page(
    c,
    'التسجيلات',
    <>
      <PageHead title="التسجيلات" sub="كل تسجيل متاح 48 ساعة من وقت رفعه، ثم يُحذف تلقائياً." />
      {recs.length ? (
        <>
        <div class="list">
          {items.map((r) => {
            const left = r.expires_at - now
            return (
              <div class="item">
                <div class="dot"><Icon name="clapperboard" /></div>
                <div class="grow">
                  <div class="title">{r.lesson_title}</div>
                  <div class="meta">
                    <span><Icon name="book-open" /> {r.course_title}</span>
                    {user.role === 'student' && r.teacher_name && <span><Icon name="presentation" /> {r.teacher_name}</span>}
                    <span>رُفع {fmtDateTime(r.ready_at)}</span>
                    {user.role !== 'student' && <span><Icon name="eye" /> {r.views} مشاهدة</span>}
                  </div>
                  <span class={`badge ${left < 6 * 3600 ? 'bad' : 'warn'}`} style="margin-top:.3rem">
                    <Icon name="hourglass" /> يُحذف بعد {fmtRemaining(left)}
                  </span>
                </div>
                <div class="actions">
                  <a class="btn" href={`/recordings/${r.id}`}>
                    <Icon name="play" /> مشاهدة
                  </a>
                  {user.role !== 'student' && (
                    <form method="post" action={`/recordings/${r.id}/delete`} data-confirm="حذف التسجيل نهائياً؟">
                      <button class="btn btn-danger">حذف</button>
                    </form>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <Pager info={info} url={c.req.url} />
        </>
      ) : (
        <div class="card">
          <Empty icon="clapperboard" text="لا توجد تسجيلات متاحة حالياً." />
        </div>
      )}
    </>,
  )
}

// ============ التنظيف ============
/** يحذف التسجيلات المنتهية + الرفوعات المعلّقة (> 24 ساعة) + الجلسات المنتهية */
export async function cleanup(env: Env): Promise<{ recordings: number; aborted: number }> {
  const now = nowSec()
  const expired = (
    await env.DB.prepare(`SELECT id, r2_key FROM recordings WHERE status = 'ready' AND expires_at <= ? LIMIT 200`).bind(now).all<{ id: number; r2_key: string }>()
  ).results
  if (expired.length) {
    await env.MEDIA.delete(expired.map((r) => r.r2_key))
    await env.DB.prepare(`UPDATE recordings SET status = 'deleted' WHERE id IN (${expired.map(() => '?').join(',')})`)
      .bind(...expired.map((r) => r.id))
      .run()
  }
  const stale = (
    await env.DB.prepare(`SELECT id, r2_key, upload_id FROM recordings WHERE status = 'uploading' AND created_at < ? LIMIT 100`)
      .bind(now - 24 * 3600)
      .all<{ id: number; r2_key: string; upload_id: string | null }>()
  ).results
  for (const s of stale) {
    if (s.upload_id) await env.MEDIA.resumeMultipartUpload(s.r2_key, s.upload_id).abort().catch(() => {})
    await env.DB.prepare(`UPDATE recordings SET status = 'failed', upload_id = NULL WHERE id = ?`).bind(s.id).run()
  }
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run()
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('last_cleanup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(String(now))
    .run()
  return { recordings: expired.length, aborted: stale.length }
}

/**
 * Cloudflare Pages لا يدعم Cron مباشرة، لذلك:
 *  1) كل مشاهدة للتسجيل تتحقق من الصلاحية الزمنية (لا يُعرض المنتهي أبداً)
 *  2) تنظيف "انتهازي" بحد أقصى مرة كل ساعة عند أي طلب
 *  3) نقطة /api/cron/cleanup محمية بسر لربطها بـ Cron Worker أو أي مجدول خارجي
 */
export async function maybeCleanup(env: Env) {
  const last = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'last_cleanup'`).first<{ value: string }>()
  if (last && nowSec() - Number(last.value) < 3600) return
  await cleanup(env)
}

recordingRoutes.post('/api/cron/cleanup', async (c) => {
  const secret = c.env.CRON_SECRET
  const auth = c.req.header('authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) return c.json({ error: 'غير مصرح' }, 401)
  return c.json(await cleanup(c.env))
})
