/**
 * الحصص: الجدولة (مع توزيع قاعات الزوم تلقائياً)، غرفة الحصة، البدء والإنهاء.
 */
import { Hono } from 'hono'
import { canAccessCourse, canManageCourse, requireRole } from '../lib/auth'
import { canJoinNow, lessonPhase } from '../lib/domain'
import { back, form, go, int, str } from '../lib/http'
import { coursesFor, lessonById, lessonsFor, type LessonRow } from '../lib/queries'
import { notFound, page } from '../lib/render'
import { allocate, newRoomKey } from '../lib/scheduling'
import { jitsiToken } from '../lib/security'
import { fmtDateTime, fmtDuration, fmtTime, nowSec, parseLocalDateTime, toLocalInput } from '../lib/time'
import type { AppEnv, SessionUser } from '../lib/types'
import { Empty, PageHead, Pager } from '../views/layout'
import { paginate } from '../lib/paging'
import { Icon, IconTile } from '../views/icons'

export const lessonRoutes = new Hono<AppEnv>()

// ============ مكونات ============
export function PhaseBadge({ l, now }: { l: LessonRow; now: number }) {
  const p = lessonPhase(l, now)
  if (p === 'live') return <span class="badge live">مباشر الآن</span>
  if (p === 'open') return <span class="badge warn">تبدأ قريباً</span>
  if (p === 'ended') return <span class="badge gray">انتهت</span>
  if (p === 'cancelled') return <span class="badge bad">ملغاة</span>
  return <span class="badge">مجدولة</span>
}

export const ProviderBadge = ({ l }: { l: LessonRow }) =>
  l.provider === 'zoom' ? <span class="badge zoom"><Icon name="video" /> زوم • {l.room_name}</span> : <span class="badge ok"><Icon name="radio-tower" /> بث المنصة</span>

export function LessonItem({ l, now, user }: { l: LessonRow; now: number; user: SessionUser }) {
  const phase = lessonPhase(l, now)
  const joinable = canJoinNow(l, now)
  return (
    <div class={`item ${phase === 'live' ? 'live' : ''}`}>
      <div class="dot"><Icon name={l.provider === 'zoom' ? 'video' : 'radio-tower'} /></div>
      <div class="grow">
        <div class="title">{l.title}</div>
        <div class="meta">
          <span><Icon name="book-open" /> {l.course_title}</span>
          {user.role !== 'teacher' && l.teacher_name && <span><Icon name="presentation" /> {l.teacher_name}</span>}
          <span>
            <Icon name="clock" /> {fmtDateTime(l.starts_at)} ({fmtDuration(l.ends_at - l.starts_at)})
          </span>
          {user.role !== 'student' && <span><Icon name="users" /> {l.students}</span>}
        </div>
        <div class="flex mt-0" style="margin-top:.35rem">
          <PhaseBadge l={l} now={now} />
          <ProviderBadge l={l} />
          {l.recordings > 0 && <span class="badge teal"><Icon name="clapperboard" /> {l.recordings} تسجيل</span>}
        </div>
      </div>
      <div class="actions">
        {joinable ? (
          <a class={`btn ${phase === 'live' ? 'btn-ok' : ''}`} href={`/lessons/${l.id}`}>
            {user.role === 'student' ? 'دخول الحصة' : phase === 'live' ? 'العودة للحصة' : 'ابدأ الحصة'}
          </a>
        ) : (
          <a class="btn btn-ghost" href={`/lessons/${l.id}`}>
            التفاصيل
          </a>
        )}
      </div>
    </div>
  )
}

// ============ الجدولة (الإدارة والمعلمات) ============
lessonRoutes.get('/lessons', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user')!
  const now = nowSec()
  const view = c.req.query('view') === 'past' ? 'past' : 'upcoming'
  const lessons =
    view === 'past'
      ? (await lessonsFor(c.env.DB, user, now - 30 * 86400, now, 300)).filter((l) => lessonPhase(l, now) === 'ended' || l.status === 'cancelled').reverse()
      : (await lessonsFor(c.env.DB, user, now - 3 * 3600, now + 60 * 86400, 300)).filter((l) => !['ended', 'cancelled'].includes(lessonPhase(l, now)))
  const { items: pageLessons, info } = paginate(lessons, c.req.url)
  const courses = await coursesFor(c.env.DB, user)
  const rooms = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM zoom_rooms WHERE active = 1').first<{ n: number }>()
  const nextHour = Math.ceil((now + 3600) / 1800) * 1800
  return page(
    c,
    'جدول الحصص',
    <>
      <PageHead title="جدول الحصص" sub={`قاعات الزوم المتاحة: ${rooms?.n ?? 0} — عند امتلائها تتحول الحصة تلقائياً لبث المنصة`} />
      <details class="drop" open={lessons.length === 0}>
        <summary>جدولة حصة جديدة</summary>
        <div>
          {courses.length === 0 ? (
            <p class="muted">لا توجد دورات نشطة.</p>
          ) : (
            <form method="post" action="/lessons">
              <div class="form-grid">
                <div class="field">
                  <label>الدورة</label>
                  <select name="course_id" required>
                    {courses.map((co) => (
                      <option value={co.id}>
                        {co.title}
                        {user.role === 'admin' && co.teacher_name ? ` — ${co.teacher_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="field">
                  <label>عنوان الحصة</label>
                  <input name="title" required maxlength={120} placeholder="مثال: حل المعادلات التربيعية" />
                </div>
                <div class="field">
                  <label>وقت البداية (توقيت السعودية)</label>
                  <input type="datetime-local" name="starts_at" required value={toLocalInput(nextHour)} />
                </div>
                <div class="field">
                  <label>المدة</label>
                  <select name="duration">
                    {[30, 45, 60, 75, 90, 120].map((m) => (
                      <option value={m} selected={m === 60}>
                        {fmtDuration(m * 60)}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="field">
                  <label>طريقة البث</label>
                  <select name="provider">
                    <option value="auto">تلقائي (زوم إن توفرت قاعة، وإلا بث المنصة)</option>
                    <option value="zoom">زوم فقط</option>
                    <option value="jitsi">بث المنصة</option>
                  </select>
                </div>
                <div class="field">
                  <label>التكرار الأسبوعي</label>
                  <select name="repeat">
                    <option value="1">مرة واحدة</option>
                    {[2, 4, 8, 12].map((n) => (
                      <option value={n}>{n} أسابيع</option>
                    ))}
                  </select>
                </div>
              </div>
              <button class="btn">جدولة</button>
            </form>
          )}
        </div>
      </details>
      <div class="tabs">
        <a href="/lessons" class={view === 'upcoming' ? 'active' : ''}>
          القادمة والجارية
        </a>
        <a href="/lessons?view=past" class={view === 'past' ? 'active' : ''}>
          السابقة (30 يوم)
        </a>
      </div>
      {lessons.length ? (
        <>
          <div class="list">
            {pageLessons.map((l) => (
              <LessonItem l={l} now={now} user={user} />
            ))}
          </div>
          <Pager info={info} url={c.req.url} />
        </>
      ) : (
        <div class="card">
          <Empty icon="calendar-days" text="لا توجد حصص هنا." />
        </div>
      )}
    </>,
  )
})

lessonRoutes.post('/lessons', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user')!
  const f = await form(c)
  const courseId = int(f.course_id)
  if (!(await canManageCourse(c.env.DB, user, courseId))) return back(c, 'bad', 'لا تملكين صلاحية على هذه الدورة.')
  const title = str(f.title, 120)
  const start = parseLocalDateTime(f.starts_at)
  const duration = Math.min(Math.max(int(f.duration, 60), 15), 240) * 60
  const pref = (['auto', 'zoom', 'jitsi'].includes(String(f.provider)) ? f.provider : 'auto') as 'auto' | 'zoom' | 'jitsi'
  const repeat = Math.min(Math.max(int(f.repeat, 1), 1), 12)
  if (!title || !start) return back(c, 'bad', 'أكمل العنوان ووقت البداية.')
  if (start < nowSec() - 3600) return back(c, 'bad', 'وقت البداية في الماضي.')

  const created: string[] = []
  const failed: string[] = []
  for (let k = 0; k < repeat; k++) {
    const s = start + k * 7 * 86400
    const e = s + duration
    const alloc = await allocate(c.env.DB, pref, s, e)
    if ('error' in alloc) {
      failed.push(fmtDateTime(s))
      continue
    }
    // الإدراج مشروط بعدم وجود تعارض للقاعة (حماية من السباق بين طلبين متزامنين)
    const res = await c.env.DB.prepare(
      `INSERT INTO lessons (course_id, title, starts_at, ends_at, provider, zoom_room_id, room_key)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
       WHERE ?6 IS NULL OR NOT EXISTS (
         SELECT 1 FROM lessons WHERE zoom_room_id = ?6 AND status != 'cancelled' AND starts_at < ?4 AND ?3 < ends_at)`,
    )
      .bind(courseId, title, s, e, alloc.provider, alloc.zoom_room_id, newRoomKey())
      .run()
    if (res.meta.changes) created.push(alloc.provider === 'zoom' ? 'زوم' : 'بث المنصة')
    else failed.push(fmtDateTime(s))
  }
  if (!created.length) return back(c, 'bad', failed.length ? `تعذرت الجدولة: كل قاعات الزوم محجوزة (${failed.join('، ')}).` : 'تعذرت الجدولة.')
  const zoomN = created.filter((x) => x === 'زوم').length
  let msg = `تمت جدولة ${created.length} حصة`
  msg += zoomN === created.length ? ' على قاعات الزوم.' : zoomN === 0 ? ' على بث المنصة.' : ` (${zoomN} زوم، ${created.length - zoomN} بث المنصة).`
  if (failed.length) msg += ` تعذّر: ${failed.join('، ')}.`
  return go(c, '/lessons', failed.length ? 'warn' : 'ok', msg)
})

lessonRoutes.post('/lessons/:id/cancel', requireRole('admin', 'teacher'), async (c) => {
  const l = await lessonById(c.env.DB, int(c.req.param('id')))
  if (!l || !(await canManageCourse(c.env.DB, c.get('user')!, l.course_id))) return notFound(c)
  if (l.status === 'live') return back(c, 'bad', 'الحصة جارية الآن، أنهيها أولاً.')
  await c.env.DB.prepare(`UPDATE lessons SET status = 'cancelled', zoom_room_id = NULL WHERE id = ?`).bind(l.id).run()
  return go(c, '/lessons', 'ok', 'تم إلغاء الحصة وتحرير القاعة.')
})

lessonRoutes.post('/lessons/:id/start', requireRole('admin', 'teacher'), async (c) => {
  const l = await lessonById(c.env.DB, int(c.req.param('id')))
  if (!l || !(await canManageCourse(c.env.DB, c.get('user')!, l.course_id))) return notFound(c)
  if (!canJoinNow(l, nowSec())) return back(c, 'bad', 'لا يمكن بدء الحصة في هذا الوقت.')
  await c.env.DB.prepare(`UPDATE lessons SET status = 'live', started_at = COALESCE(started_at, unixepoch()) WHERE id = ? AND status = 'scheduled'`).bind(l.id).run()
  return go(c, `/lessons/${l.id}`)
})

lessonRoutes.post('/lessons/:id/end', requireRole('admin', 'teacher'), async (c) => {
  const l = await lessonById(c.env.DB, int(c.req.param('id')))
  if (!l || !(await canManageCourse(c.env.DB, c.get('user')!, l.course_id))) return notFound(c)
  // تحرير القاعة مبكراً: نقصّر ends_at لو انتهت الحصة قبل موعدها
  await c.env.DB.prepare(`UPDATE lessons SET status = 'ended', ended_at = unixepoch(), ends_at = MIN(ends_at, MAX(unixepoch(), starts_at + 60)) WHERE id = ?`)
    .bind(l.id)
    .run()
  return go(c, c.get('user')!.role === 'admin' ? '/admin/live' : '/teacher', 'ok', 'تم إنهاء الحصة. التسجيل (إن وجد) متاح للطلاب 48 ساعة.')
})

// ============ غرفة الحصة ============
lessonRoutes.get('/lessons/:id', requireRole(), async (c) => {
  const user = c.get('user')!
  const l = await lessonById(c.env.DB, int(c.req.param('id')))
  if (!l || !(await canAccessCourse(c.env.DB, user, l.course_id))) return notFound(c)
  const now = nowSec()
  const phase = lessonPhase(l, now)
  const joinable = canJoinNow(l, now)
  const isHost = user.role !== 'student'

  const recs = (
    await c.env.DB.prepare(`SELECT id, ready_at, expires_at, size FROM recordings WHERE lesson_id = ? AND status = 'ready' AND expires_at > unixepoch() ORDER BY id`)
      .bind(l.id)
      .all<{ id: number; ready_at: number; expires_at: number; size: number }>()
  ).results

  // تفاصيل الوصول لا تُرسل إلا إذا كانت الحصة مفتوحة الآن
  let zoom: { join_url: string; passcode: string | null; host_key: string | null } | null = null
  let jitsi: { domain: string; room: string; jwt: string | null; preview: boolean } | null = null
  if (joinable && l.provider === 'zoom' && l.zoom_room_id) {
    zoom = await c.env.DB.prepare('SELECT join_url, passcode, host_key FROM zoom_rooms WHERE id = ?').bind(l.zoom_room_id).first()
    if (zoom && !isHost) zoom.host_key = null
  }
  if (joinable && l.provider === 'jitsi') {
    const domain = c.env.JITSI_DOMAIN || 'meet.jit.si'
    const preview = !c.env.JITSI_DOMAIN
    let jwt: string | null = null
    if (!preview && c.env.JITSI_APP_SECRET) {
      jwt = await jitsiToken({
        appId: c.env.JITSI_APP_ID,
        secret: c.env.JITSI_APP_SECRET,
        domain,
        room: l.room_key,
        user: { id: user.id, name: user.name, moderator: isHost },
        expiresAt: l.ends_at + 2 * 3600,
      })
    }
    jitsi = { domain, room: l.room_key, jwt, preview }
  }

  const waitingForTeacher = !isHost && l.provider === 'jitsi' && l.status !== 'live' && phase === 'open'

  return page(
    c,
    l.title,
    <>
      <div class="page-head">
        <div>
          <h1>{l.title}</h1>
          <p>
            <Icon name="book-open" /> {l.course_title}
            {l.teacher_name && ` • ${l.teacher_name}`} • <Icon name="clock" /> {fmtDateTime(l.starts_at)} – {fmtTime(l.ends_at)}
          </p>
          <div class="flex" style="margin-top:.4rem">
            <PhaseBadge l={l} now={now} />
            <ProviderBadge l={l} />
          </div>
        </div>
        {isHost && (
          <div class="actions">
            {l.status === 'scheduled' && joinable && (
              <form method="post" action={`/lessons/${l.id}/start`}>
                <button class="btn btn-ok">▶ ابدأ الحصة</button>
              </form>
            )}
            {l.status === 'live' && (
              <form method="post" action={`/lessons/${l.id}/end`} data-confirm="إنهاء الحصة للجميع؟">
                <button class="btn btn-danger"><Icon name="square" /> إنهاء الحصة</button>
              </form>
            )}
            {l.status === 'scheduled' && (
              <form method="post" action={`/lessons/${l.id}/cancel`} data-confirm="إلغاء هذه الحصة؟">
                <button class="btn btn-ghost">إلغاء الحصة</button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* شريط التسجيل للمعلمة */}
      {isHost && (l.status === 'live' || joinable || phase === 'ended') && (
        <div class="rec-bar" id="recBar" data-lesson={l.id} data-provider={l.provider}>
          <span class="rec-dot" id="recDot"></span>
          <div class="grow" style="flex:1;min-width:200px">
            <b id="recTitle">{phase === 'ended' ? 'رفع تسجيل الحصة' : 'تسجيل الحصة'}</b>
            <div class="muted" id="recStatus" style="font-size:.84rem">
              {phase === 'ended'
                ? 'ارفعي ملف التسجيل (من الزوم أو جهازك) ليظهر للطلاب 48 ساعة.'
                : l.provider === 'jitsi'
                  ? 'اضغطي «ابدأ التسجيل» واختاري «هذا التبويب» مع تفعيل مشاركة الصوت. يُرفع تلقائياً أثناء الحصة.'
                  : 'سجّلي من الزوم (تسجيل على الجهاز)، وبعد الحصة ارفعي الملف من هنا.'}
            </div>
          </div>
          <div class="progress hide-sm" id="recProgWrap" hidden>
            <i id="recProg"></i>
          </div>
          <div class="actions">
            {l.provider === 'jitsi' && phase !== 'ended' && (
              <>
                <button class="btn btn-danger" id="recStart" type="button">
                  <Icon name="circle-dot" /> ابدأ التسجيل
                </button>
                <button class="btn btn-ghost" id="recStop" type="button" hidden>
                  <Icon name="square" /> إيقاف وحفظ
                </button>
              </>
            )}
            <label class="btn btn-soft" style="margin:0">
              <Icon name="upload" /> رفع ملف
              <input type="file" id="recFile" accept="video/*" hidden />
            </label>
          </div>
        </div>
      )}

      {/* منطقة الحصة */}
      {phase === 'cancelled' ? (
        <div class="card">
          <Empty icon="ban" text="تم إلغاء هذه الحصة." />
        </div>
      ) : !joinable ? (
        <div class="card">
          {phase === 'upcoming' ? (
            <Empty icon="hourglass" text={`الحصة تبدأ ${fmtDateTime(l.starts_at)}. يُفتح الدخول قبل الموعد بـ 15 دقيقة.`} />
          ) : (
            <Empty icon="circle-check" text="انتهت هذه الحصة." />
          )}
        </div>
      ) : l.provider === 'zoom' && zoom ? (
        <div class="card" style="text-align:center;padding:2.5rem 1.25rem">
          <IconTile name="video" tone="info" size="lg" />
          <h2>الحصة على زوم — {l.room_name}</h2>
          <p class="muted">اضغط الزر للدخول. الرابط خاص بطلاب هذه الدورة فقط، لا تشاركه.</p>
          <a class="btn btn-lg" href={zoom.join_url} target="_blank" rel="noopener noreferrer">
            {isHost ? 'افتحي قاعة الزوم' : 'دخول الحصة على زوم'}
          </a>
          <div class="flex" style="justify-content:center;margin-top:1rem">
            {zoom.passcode && (
              <span class="badge gray">
                رمز الدخول: <b class="num">{zoom.passcode}</b>
              </span>
            )}
            {isHost && zoom.host_key && (
              <span class="badge warn">
                مفتاح المضيف: <b class="num">{zoom.host_key}</b>
              </span>
            )}
          </div>
        </div>
      ) : l.provider === 'jitsi' && jitsi ? (
        waitingForTeacher ? (
          <div class="card">
            <Empty icon="hourglass" text="بانتظار المعلمة لبدء الحصة… ستفتح الغرفة تلقائياً.">
              <script dangerouslySetInnerHTML={{ __html: 'setTimeout(()=>location.reload(),15000)' }} />
            </Empty>
          </div>
        ) : (
          <>
            {jitsi.preview && (
              <div class="alert info">
                <b>وضع المعاينة:</b> البث يعمل حالياً على خادم Jitsi العام (قد ينقطع بعد 5 دقائق داخل الإطار). بعد تركيب سيرفر المنصة الخاص تعمل الحصص بلا حدود وبحماية كاملة.
              </div>
            )}
            <div class="room" id="jitsiRoom" data-domain={jitsi.domain} data-room={jitsi.room} data-jwt={jitsi.jwt ?? ''} data-name={user.name} data-host={isHost ? '1' : '0'}></div>
            <script src={`https://${jitsi.domain}/external_api.js`} defer></script>
          </>
        )
      ) : (
        <div class="card">
          <Empty icon="triangle-alert" text="تعذر تحميل بيانات الغرفة." />
        </div>
      )}

      {recs.length > 0 && (
        <div class="card mt">
          <h3><Icon name="clapperboard" /> تسجيلات هذه الحصة</h3>
          <div class="list">
            {recs.map((r, i) => (
              <div class="item">
                <div class="grow">
                  <div class="title">التسجيل {i + 1}</div>
                  <div class="meta">
                    <span>متاح حتى {fmtDateTime(r.expires_at)}</span>
                  </div>
                </div>
                <a class="btn btn-soft" href={`/recordings/${r.id}`}>
                  ▶ مشاهدة
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>,
    { scripts: ['/static/lesson.js'] },
  )
})
