/**
 * الواجبات: إنشاء (المعلمة/الإدارة) — تسليم (الطالب) — تصحيح ودرجات وملاحظات.
 * الملفات تُخزن في R2 وتُنزَّل عبر الـ Worker بعد التحقق من الصلاحية.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { canAccessCourse, canManageCourse, requireRole } from '../lib/auth'
import { back, form, go, int, str } from '../lib/http'
import { coursesFor } from '../lib/queries'
import { notFound, page } from '../lib/render'
import { randomHex } from '../lib/security'
import { fmtDateTime, nowSec, parseLocalDateTime, toLocalInput } from '../lib/time'
import type { AppEnv, SessionUser } from '../lib/types'
import { Empty, PageHead, Pager } from '../views/layout'
import { paginate } from '../lib/paging'
import { Icon } from '../views/icons'

export const assignmentRoutes = new Hono<AppEnv>()

const MAX_FILE = 25 * 1024 * 1024
const ALLOWED_EXT = /\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|webp|heic|txt|zip|mp3|m4a|mp4)$/i

async function saveFile(c: Context<AppEnv>, file: unknown, prefix: string): Promise<{ key: string; name: string } | { error: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null
  if (file.size > MAX_FILE) return { error: 'حجم الملف أكبر من 25MB.' }
  const name = file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-120) || 'file'
  if (!ALLOWED_EXT.test(name)) return { error: 'نوع الملف غير مسموح. المسموح: PDF، Word، PowerPoint، Excel، صور، ZIP، صوت.' }
  const key = `${prefix}/${randomHex(12)}-${name}`
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } })
  return { key, name }
}

interface AsgRow {
  id: number
  course_id: number
  course_title: string
  title: string
  description: string | null
  due_at: number | null
  file_key: string | null
  file_name: string | null
  max_grade: number
  created_at: number
  submitted: number
  graded: number
  students: number
  my_submitted_at: number | null
  my_grade: number | null
}

async function listFor(db: D1Database, user: SessionUser): Promise<AsgRow[]> {
  let where = '1=1'
  const binds: unknown[] = [user.id]
  if (user.role === 'teacher') {
    where = 'c.teacher_id = ?2'
    binds.push(user.id)
  } else if (user.role === 'student') {
    where = `EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = a.course_id AND e.student_id = ?2 AND e.status = 'active')`
    binds.push(user.id)
  }
  return (
    await db
      .prepare(
        `SELECT a.*, c.title AS course_title,
          (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted,
          (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.grade IS NOT NULL) AS graded,
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = a.course_id AND e.status = 'active') AS students,
          (SELECT submitted_at FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?1) AS my_submitted_at,
          (SELECT grade FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?1) AS my_grade
         FROM assignments a JOIN courses c ON c.id = a.course_id
         WHERE ${where} ORDER BY COALESCE(a.due_at, a.created_at) DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<AsgRow>()
  ).results
}

async function getAsg(db: D1Database, id: number) {
  return db.prepare(`SELECT a.*, c.title AS course_title FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.id = ?`).bind(id).first<AsgRow>()
}

function DueBadge({ due, now }: { due: number | null; now: number }) {
  if (!due) return <span class="badge gray">بدون موعد</span>
  if (due < now) return <span class="badge gray">انتهى {fmtDateTime(due)}</span>
  if (due - now < 86400) return <span class="badge bad"><Icon name="calendar-clock" /> آخر موعد {fmtDateTime(due)}</span>
  return <span class="badge warn">آخر موعد {fmtDateTime(due)}</span>
}

// ============ القائمة ============
export async function assignmentsPage(c: Context<AppEnv>) {
  const user = c.get('user')!
  const list = await listFor(c.env.DB, user)
  const now = nowSec()
  const isStaff = user.role !== 'student'
  const courses = isStaff ? await coursesFor(c.env.DB, user) : []
  const pending = list.filter((a) => !a.my_submitted_at && (!a.due_at || a.due_at > now))
  const { items, info } = paginate(list, c.req.url)
  return page(
    c,
    'الواجبات',
    <>
      <PageHead title="الواجبات" sub={isStaff ? 'أنشئي الواجبات وتابعي التسليم والتصحيح' : `لديك ${pending.length} واجب بانتظار التسليم`} />
      {isStaff && courses.length > 0 && (
        <details class="drop">
          <summary>واجب جديد</summary>
          <div>
            <form method="post" action="/assignments" enctype="multipart/form-data">
              <div class="form-grid">
                <div class="field">
                  <label>الدورة</label>
                  <select name="course_id" required>
                    {courses.map((co) => (
                      <option value={co.id}>{co.title}</option>
                    ))}
                  </select>
                </div>
                <div class="field">
                  <label>العنوان</label>
                  <input name="title" required maxlength={150} />
                </div>
                <div class="field">
                  <label>آخر موعد للتسليم</label>
                  <input type="datetime-local" name="due_at" value={toLocalInput(now + 3 * 86400)} />
                </div>
                <div class="field">
                  <label>الدرجة العظمى</label>
                  <input type="number" name="max_grade" value="10" min="1" max="100" />
                </div>
              </div>
              <div class="field">
                <label>التعليمات</label>
                <textarea name="description" maxlength={4000}></textarea>
              </div>
              <div class="field">
                <label>ملف مرفق (اختياري)</label>
                <input type="file" name="file" />
                <div class="hint">PDF، Word، صور… حتى 25MB</div>
              </div>
              <button class="btn">نشر الواجب</button>
            </form>
          </div>
        </details>
      )}
      {list.length ? (
        <>
        <div class="list">
          {items.map((a) => (
            <a class="item" href={`/assignments/${a.id}`} style="color:inherit;text-decoration:none">
              <div class="dot"><Icon name="notebook-pen" /></div>
              <div class="grow">
                <div class="title">{a.title}</div>
                <div class="meta">
                  <span><Icon name="book-open" /> {a.course_title}</span>
                  {isStaff && (
                    <span>
                      <Icon name="inbox" /> سلّم {a.submitted}/{a.students} • <Icon name="circle-check" /> صُحح {a.graded}
                    </span>
                  )}
                </div>
                <div class="flex" style="margin-top:.3rem">
                  <DueBadge due={a.due_at} now={now} />
                  {!isStaff &&
                    (a.my_grade !== null ? (
                      <span class="badge ok">
                        الدرجة: {a.my_grade}/{a.max_grade}
                      </span>
                    ) : a.my_submitted_at ? (
                      <span class="badge ok"><Icon name="check" /> تم التسليم</span>
                    ) : (
                      <span class="badge bad">لم يُسلَّم</span>
                    ))}
                </div>
              </div>
              <span class="btn btn-ghost btn-sm">فتح</span>
            </a>
          ))}
        </div>
        <Pager info={info} url={c.req.url} />
        </>
      ) : (
        <div class="card">
          <Empty icon="notebook-pen" text="لا توجد واجبات بعد." />
        </div>
      )}
    </>,
  )
}

assignmentRoutes.post('/assignments', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user')!
  const f = await form(c)
  const courseId = int(f.course_id)
  if (!(await canManageCourse(c.env.DB, user, courseId))) return back(c, 'bad', 'غير مصرح.')
  const title = str(f.title, 150)
  if (!title) return back(c, 'bad', 'العنوان مطلوب.')
  const saved = await saveFile(c, f.file, `assignments/${courseId}`)
  if (saved && 'error' in saved) return back(c, 'bad', saved.error)
  const due = parseLocalDateTime(f.due_at)
  const res = await c.env.DB.prepare(
    `INSERT INTO assignments (course_id, title, description, due_at, file_key, file_name, max_grade) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(courseId, title, str(f.description, 4000) || null, due, saved?.key ?? null, saved?.name ?? null, Math.min(Math.max(int(f.max_grade, 10), 1), 100))
    .first<{ id: number }>()
  return go(c, `/assignments/${res!.id}`, 'ok', 'تم نشر الواجب للطلاب.')
})

// ============ صفحة الواجب ============
assignmentRoutes.get('/assignments/:id', requireRole(), async (c) => {
  const user = c.get('user')!
  const a = await getAsg(c.env.DB, int(c.req.param('id')))
  if (!a || !(await canAccessCourse(c.env.DB, user, a.course_id))) return notFound(c)
  const now = nowSec()
  const isStaff = user.role !== 'student'
  const back_ = user.role === 'admin' ? '/admin/courses/' + a.course_id : user.role === 'teacher' ? '/teacher/assignments' : '/student/assignments'

  if (!isStaff) {
    const mine = await c.env.DB.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?')
      .bind(a.id, user.id)
      .first<{ body: string | null; file_name: string | null; submitted_at: number; grade: number | null; feedback: string | null }>()
    const closed = !!a.due_at && a.due_at < now
    const locked = mine?.grade !== null && mine?.grade !== undefined
    return page(
      c,
      a.title,
      <>
        <PageHead title={a.title} sub={`${a.course_title}`}>
          <a class="btn btn-ghost" href={back_}>
            رجوع
          </a>
        </PageHead>
        <div class="grid grid-2">
          <div class="card">
            <div class="flex" style="margin-bottom:.8rem">
              <DueBadge due={a.due_at} now={now} />
              <span class="badge gray">الدرجة من {a.max_grade}</span>
            </div>
            <p style="white-space:pre-wrap">{a.description || 'لا توجد تعليمات إضافية.'}</p>
            {a.file_key && (
              <a class="btn btn-soft" href={`/files/assignment/${a.id}`}>
                <Icon name="paperclip" /> {a.file_name}
              </a>
            )}
          </div>
          <div class="card">
            <h3>تسليمي</h3>
            {mine?.grade !== null && mine?.grade !== undefined && (
              <div class="alert ok">
                الدرجة: <b>{mine.grade}</b> من {a.max_grade}
                {mine.feedback && (
                  <div style="margin-top:.4rem;white-space:pre-wrap">
                    <b>ملاحظة المعلمة:</b> {mine.feedback}
                  </div>
                )}
              </div>
            )}
            {mine && (
              <p class="muted">
                آخر تسليم: {fmtDateTime(mine.submitted_at)}
                {mine.file_name && ` • ${mine.file_name}`}
              </p>
            )}
            {locked ? (
              <p class="muted">تم تصحيح الواجب.</p>
            ) : closed ? (
              <div class="alert warn">انتهى موعد التسليم.</div>
            ) : (
              <form method="post" action={`/assignments/${a.id}/submit`} enctype="multipart/form-data">
                <div class="field">
                  <label>إجابتك</label>
                  <textarea name="body" maxlength={8000}>
                    {mine?.body ?? ''}
                  </textarea>
                </div>
                <div class="field">
                  <label>ملف (صورة الحل، PDF…)</label>
                  <input type="file" name="file" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.zip,.mp3,.m4a" />
                </div>
                <button class="btn btn-block">{mine ? 'تحديث التسليم' : 'تسليم الواجب'}</button>
              </form>
            )}
          </div>
        </div>
      </>,
    )
  }

  const subs = (
    await c.env.DB.prepare(
      `SELECT u.id AS student_id, u.name, s.id, s.body, s.file_name, s.submitted_at, s.grade, s.feedback
       FROM enrollments e JOIN users u ON u.id = e.student_id
       LEFT JOIN submissions s ON s.assignment_id = ?1 AND s.student_id = u.id
       WHERE e.course_id = ?2 AND e.status = 'active' ORDER BY s.submitted_at IS NULL, u.name`,
    )
      .bind(a.id, a.course_id)
      .all<{ student_id: number; name: string; id: number | null; body: string | null; file_name: string | null; submitted_at: number | null; grade: number | null; feedback: string | null }>()
  ).results
  return page(
    c,
    a.title,
    <>
      <PageHead title={a.title} sub={`${a.course_title} • سلّم ${subs.filter((s) => s.id).length} من ${subs.length}`}>
        <a class="btn btn-ghost" href={back_}>
          رجوع
        </a>
        <form method="post" action={`/assignments/${a.id}/delete`} data-confirm="حذف الواجب وكل التسليمات؟">
          <button class="btn btn-danger">حذف الواجب</button>
        </form>
      </PageHead>
      <div class="card">
        <div class="flex" style="margin-bottom:.6rem">
          <DueBadge due={a.due_at} now={now} />
        </div>
        <p style="white-space:pre-wrap;margin:0">{a.description || '—'}</p>
        {a.file_key && (
          <a class="btn btn-soft mt" href={`/files/assignment/${a.id}`}>
            <Icon name="paperclip" /> {a.file_name}
          </a>
        )}
      </div>
      <div class="list">
        {subs.map((s) => (
          <div class="card" style="margin:0">
            <div class="flex between">
              <b>{s.name}</b>
              {s.id ? (
                s.grade !== null ? (
                  <span class="badge ok">
                    {s.grade}/{a.max_grade}
                  </span>
                ) : (
                  <span class="badge warn">بانتظار التصحيح</span>
                )
              ) : (
                <span class="badge bad">لم يسلّم</span>
              )}
            </div>
            {s.id && (
              <>
                <p class="muted" style="font-size:.84rem;margin:.3rem 0">
                  {fmtDateTime(s.submitted_at!)}
                  {a.due_at && s.submitted_at! > a.due_at && <span class="badge bad" style="margin-inline-start:.4rem">متأخر</span>}
                </p>
                {s.body && <p style="white-space:pre-wrap;background:var(--bg);padding:.7rem;border-radius:10px">{s.body}</p>}
                {s.file_name && (
                  <a class="btn btn-soft btn-sm" href={`/files/submission/${s.id}`}>
                    <Icon name="paperclip" /> {s.file_name}
                  </a>
                )}
                <form method="post" action={`/submissions/${s.id}/grade`} class="form-grid mt" style="align-items:end">
                  <div class="field" style="margin:0">
                    <label>الدرجة من {a.max_grade}</label>
                    <input type="number" name="grade" min="0" max={a.max_grade} value={s.grade ?? ''} required />
                  </div>
                  <div class="field" style="margin:0;grid-column:span 2">
                    <label>ملاحظة</label>
                    <input name="feedback" value={s.feedback ?? ''} maxlength={1000} />
                  </div>
                  <button class="btn">حفظ</button>
                </form>
              </>
            )}
          </div>
        ))}
        {subs.length === 0 && (
          <div class="card">
            <Empty icon="backpack" text="لا يوجد طلاب مسجلون في هذه الدورة." />
          </div>
        )}
      </div>
    </>,
  )
})

assignmentRoutes.post('/assignments/:id/submit', requireRole('student'), async (c) => {
  const user = c.get('user')!
  const a = await getAsg(c.env.DB, int(c.req.param('id')))
  if (!a || !(await canAccessCourse(c.env.DB, user, a.course_id))) return notFound(c)
  if (a.due_at && a.due_at < nowSec()) return back(c, 'bad', 'انتهى موعد التسليم.')
  const existing = await c.env.DB.prepare('SELECT grade, file_key FROM submissions WHERE assignment_id = ? AND student_id = ?')
    .bind(a.id, user.id)
    .first<{ grade: number | null; file_key: string | null }>()
  if (existing && existing.grade !== null) return back(c, 'bad', 'تم تصحيح الواجب ولا يمكن تعديله.')
  const f = await form(c)
  const body = str(f.body, 8000)
  const saved = await saveFile(c, f.file, `submissions/${a.id}/${user.id}`)
  if (saved && 'error' in saved) return back(c, 'bad', saved.error)
  if (!body && !saved && !existing?.file_key) return back(c, 'bad', 'اكتب إجابتك أو ارفع ملفاً.')
  if (saved && existing?.file_key) await c.env.MEDIA.delete(existing.file_key).catch(() => {})
  await c.env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, body, file_key, file_name) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET body = ?3, submitted_at = unixepoch(),
       file_key = COALESCE(?4, file_key), file_name = COALESCE(?5, file_name)`,
  )
    .bind(a.id, user.id, body || null, saved?.key ?? null, saved?.name ?? null)
    .run()
  return go(c, `/assignments/${a.id}`, 'ok', 'تم تسليم الواجب')
})

assignmentRoutes.post('/submissions/:id/grade', requireRole('admin', 'teacher'), async (c) => {
  const sub = await c.env.DB.prepare(
    `SELECT s.id, s.assignment_id, a.course_id, a.max_grade FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?`,
  )
    .bind(int(c.req.param('id')))
    .first<{ id: number; assignment_id: number; course_id: number; max_grade: number }>()
  if (!sub || !(await canManageCourse(c.env.DB, c.get('user')!, sub.course_id))) return notFound(c)
  const f = await form(c)
  const grade = int(f.grade, -1)
  if (grade < 0 || grade > sub.max_grade) return back(c, 'bad', `الدرجة بين 0 و ${sub.max_grade}.`)
  await c.env.DB.prepare('UPDATE submissions SET grade = ?, feedback = ?, graded_at = unixepoch() WHERE id = ?')
    .bind(grade, str(f.feedback, 1000) || null, sub.id)
    .run()
  return back(c, 'ok', 'تم حفظ الدرجة.')
})

assignmentRoutes.post('/assignments/:id/delete', requireRole('admin', 'teacher'), async (c) => {
  const a = await getAsg(c.env.DB, int(c.req.param('id')))
  if (!a || !(await canManageCourse(c.env.DB, c.get('user')!, a.course_id))) return notFound(c)
  const files = (await c.env.DB.prepare('SELECT file_key FROM submissions WHERE assignment_id = ? AND file_key IS NOT NULL').bind(a.id).all<{ file_key: string }>()).results.map(
    (r) => r.file_key,
  )
  if (a.file_key) files.push(a.file_key)
  if (files.length) await c.env.MEDIA.delete(files).catch(() => {})
  await c.env.DB.prepare('DELETE FROM assignments WHERE id = ?').bind(a.id).run()
  return go(c, c.get('user')!.role === 'teacher' ? '/teacher/assignments' : `/admin/courses/${a.course_id}`, 'ok', 'تم حذف الواجب.')
})

// ============ تنزيل الملفات (بعد التحقق) ============
assignmentRoutes.get('/files/:kind/:id', requireRole(), async (c) => {
  const user = c.get('user')!
  const kind = c.req.param('kind')
  const id = int(c.req.param('id'))
  let key: string | null = null
  let name = 'file'
  if (kind === 'assignment') {
    const a = await getAsg(c.env.DB, id)
    if (a && a.file_key && (await canAccessCourse(c.env.DB, user, a.course_id))) {
      key = a.file_key
      name = a.file_name ?? name
    }
  } else if (kind === 'submission') {
    const s = await c.env.DB.prepare(
      `SELECT s.file_key, s.file_name, s.student_id, a.course_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?`,
    )
      .bind(id)
      .first<{ file_key: string | null; file_name: string | null; student_id: number; course_id: number }>()
    if (s?.file_key && (s.student_id === user.id || (await canManageCourse(c.env.DB, user, s.course_id)))) {
      key = s.file_key
      name = s.file_name ?? name
    }
  }
  if (!key) return notFound(c)
  const obj = await c.env.MEDIA.get(key)
  if (!obj) return notFound(c)
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
