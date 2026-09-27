/**
 * منصة إضاءات — نقطة الدخول (Cloudflare Pages Functions عبر Hono)
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { csrfGuard, requireRole, sessionMiddleware } from './lib/auth'
import type { AppEnv } from './lib/types'
import { adminRoutes } from './routes/admin'
import { assignmentRoutes, assignmentsPage } from './routes/assignments'
import { financeRoutes } from './routes/finance'
import { lessonRoutes } from './routes/lessons'
import { messageRoutes } from './routes/messages'
import { portalRoutes } from './routes/portals'
import { profileRoutes } from './routes/profile'
import { publicRoutes } from './routes/public'
import { maybeCleanup, recordingRoutes, recordingsPage } from './routes/recordings'

const app = new Hono<AppEnv>()

app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'SAMEORIGIN',
    referrerPolicy: 'strict-origin-when-cross-origin',
    // الكاميرا والمايك والشاشة مطلوبة لغرفة البث والتسجيل
    permissionsPolicy: { camera: ['self', '*'], microphone: ['self', '*'], displayCapture: ['self', '*'], fullscreen: ['self', '*'], autoplay: ['self', '*'] },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  }),
)
app.use('*', csrfGuard)
app.use('*', sessionMiddleware)

// تنظيف انتهازي للتسجيلات المنتهية (مرة كل ساعة كحد أقصى) بدون إبطاء الطلب
app.use('*', async (c, next) => {
  await next()
  try {
    c.executionCtx.waitUntil(maybeCleanup(c.env).catch(() => {}))
  } catch {
    /* executionCtx غير متوفر في بعض بيئات الاختبار */
  }
})

app.get('/health', (c) => c.json({ ok: true, app: 'edaat', time: new Date().toISOString() }))

app.route('/', publicRoutes)
app.route('/', lessonRoutes)
app.route('/', recordingRoutes)
app.route('/', assignmentRoutes)
app.route('/', messageRoutes)
app.route('/', financeRoutes)
app.route('/', adminRoutes)
app.route('/', portalRoutes)
app.route('/', profileRoutes)

// صفحات مشتركة لدور الإدارة
app.get('/admin/assignments', requireRole('admin'), (c) => assignmentsPage(c))
app.get('/admin/recordings', requireRole('admin'), (c) => recordingsPage(c))

app.notFound((c) => c.text('الصفحة غير موجودة', 404))
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'حدث خطأ غير متوقع' }, 500)
  return c.text('حدث خطأ غير متوقع. حاول مرة أخرى.', 500)
})

export default app
