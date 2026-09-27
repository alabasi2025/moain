/**
 * لوحة الإدارة: الرئيسية، الحصص الآن، المستخدمون، الدورات والتسجيل، قاعات الزوم، الجهات، طلبات التسجيل.
 */
import { Hono } from 'hono'
import { isValidPhone, newPasswordRecord, normalizePhone, requireRole } from '../lib/auth'
import { lessonPhase, splitInstallments, type ShareType } from '../lib/domain'
import { courseFinances, financeSummary, installmentStates } from '../lib/finance'
import { back, form, go, int, str } from '../lib/http'
import { formatPercent, formatSAR, parsePercent, parseSAR } from '../lib/money'
import { lessonsFor } from '../lib/queries'
import { notFound, page } from '../lib/render'
import { fmtDate, fmtDateTime, isDate, nowSec, todayRiyadh } from '../lib/time'
import type { AppEnv, Role } from '../lib/types'
import { Empty, Money, PageHead, Pager, Person, Stat, Toolbar } from '../views/layout'
import { pageInfo, readPage } from '../lib/paging'
import { AvatarEditor } from './profile'
import { Icon } from '../views/icons'
import { LessonItem } from './lessons'

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('/admin/*', requireRole('admin'))
adminRoutes.use('/admin', requireRole('admin'))

const shareLabel = (t: ShareType, v: number) => (t === 'percent' ? `${formatPercent(v)} من المحصّل` : t === 'per_student' ? `${formatSAR(v)} لكل طالب` : `${formatSAR(v)} ثابت`)

// ============ الرئيسية ============
adminRoutes.get('/admin', async (c) => {
  const db = c.env.DB
  const user = c.get('user')!
  const now = nowSec()
  const monthStart = todayRiyadh().slice(0, 8) + '01'
  const [counts, lessonsToday, insts, fin, leads] = await Promise.all([
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM users WHERE role='teacher' AND active=1) AS teachers,
                (SELECT COUNT(*) FROM users WHERE role='student' AND active=1) AS students,
                (SELECT COUNT(*) FROM courses WHERE status='active') AS courses,
                (SELECT COUNT(*) FROM zoom_rooms WHERE active=1) AS rooms`,
      )
      .first<{ teachers: number; students: number; courses: number; rooms: number }>(),
    lessonsFor(db, user, now - 3 * 3600, now + 18 * 3600),
    installmentStates(db),
    financeSummary(db, monthStart, todayRiyadh()),
    db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE status = 'new'`).first<{ n: number }>(),
  ])
  const live = lessonsToday.filter((l) => lessonPhase(l, now) === 'live')
  const upcoming = lessonsToday.filter((l) => ['open', 'upcoming'].includes(lessonPhase(l, now))).slice(0, 6)
  const overdue = insts.filter((i) => i.state === 'overdue')
  const soon = insts.filter((i) => i.state === 'due_soon' || i.state === 'partial')
  const zoomLive = live.filter((l) => l.provider === 'zoom').length
  return page(
    c,
    'لوحة الإدارة',
    <>
      <PageHead title={`أهلاً ${user.name}`} sub={fmtDateTime(now)}>
        <a class="btn" href="/admin/lessons">
          + جدولة حصة
        </a>
      </PageHead>
      <div class="stats">
        <Stat label="حصص مباشرة الآن" value={<span class="num">{live.length}</span>} sub={`زوم ${zoomLive}/${counts?.rooms ?? 0} • بث المنصة ${live.length - zoomLive}`} tone="bad" />
        <Stat label="المحصّل هذا الشهر" value={<Money v={fin.collected} />} sub={`${fin.count} دفعة`} tone="ok" />
        <Stat label="أقساط متأخرة" value={<Money v={overdue.reduce((s, i) => s + i.remaining, 0)} />} sub={`${overdue.length} قسط`} tone="warn" />
        <Stat label="الطلاب / المعلمات" value={<span class="num">{`${counts?.students ?? 0} / ${counts?.teachers ?? 0}`}</span>} sub={`${counts?.courses ?? 0} دورة نشطة`} tone="teal" />
      </div>
      {!!leads?.n && (
        <div class="alert info flex between">
          <span><Icon name="inbox" /> لديك {leads.n} طلب تسجيل جديد من الموقع.</span>
          <a href="/admin/leads" class="btn btn-sm btn-soft">
            عرض
          </a>
        </div>
      )}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head">
            <h2><Icon name="radio" /> الآن والقادم اليوم</h2>
            <a href="/admin/live">عرض الكل</a>
          </div>
          {live.length + upcoming.length ? (
            <div class="list">
              {[...live, ...upcoming].map((l) => (
                <LessonItem l={l} now={now} user={user} />
              ))}
            </div>
          ) : (
            <Empty icon="coffee" text="لا توجد حصص اليوم." />
          )}
        </div>
        <div class="card">
          <div class="card-head">
            <h2><Icon name="calendar-clock" /> متابعة التحويلات</h2>
            <a href="/admin/finance/installments">الكل</a>
          </div>
          {overdue.length + soon.length ? (
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الدورة</th>
                    <th>الاستحقاق</th>
                    <th class="money">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {[...overdue, ...soon].slice(0, 8).map((i) => (
                    <tr>
                      <td>
                        <a href={`/admin/users/${i.student_id}`}>{i.student_name}</a>
                      </td>
                      <td>{i.course_title}</td>
                      <td>
                        <span class={`badge ${i.state === 'overdue' ? 'bad' : 'warn'}`}>{fmtDate(i.due_date)}</span>
                      </td>
                      <td class="money">
                        <Money v={i.remaining} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="circle-check" text="لا توجد أقساط متأخرة أو مستحقة قريباً." />
          )}
        </div>
      </div>
    </>,
  )
})

// ============ الحصص الآن (مراقبة) ============
adminRoutes.get('/admin/live', async (c) => {
  const user = c.get('user')!
  const now = nowSec()
  const lessons = await lessonsFor(c.env.DB, user, now - 3 * 3600, now + 12 * 3600)
  const rooms = (await c.env.DB.prepare('SELECT id, name FROM zoom_rooms WHERE active = 1 ORDER BY id').all<{ id: number; name: string }>()).results
  const live = lessons.filter((l) => lessonPhase(l, now) === 'live')
  const open = lessons.filter((l) => lessonPhase(l, now) === 'open')
  const later = lessons.filter((l) => lessonPhase(l, now) === 'upcoming')
  const roomNow = (id: number) => lessons.find((l) => l.zoom_room_id === id && ['live', 'open'].includes(lessonPhase(l, now)))
  return page(
    c,
    'الحصص الآن',
    <>
      <PageHead title="الحصص الآن" sub="تتحدث الصفحة تلقائياً كل دقيقة" />
      <div class="stats">
        {rooms.map((r) => {
          const l = roomNow(r.id)
          return <Stat icon="video" label={r.name} value={l ? <span style="font-size:1rem">{l.teacher_name}</span> : <span class="muted" style="font-size:1rem">فاضية</span>} sub={l?.course_title} tone={l ? 'bad' : 'ok'} />
        })}
        <Stat icon="radio-tower" label="بث المنصة" value={<span class="num">{live.filter((l) => l.provider === 'jitsi').length}</span>} sub="حصة جارية" tone="teal" />
      </div>
      <h2>مباشر الآن ({live.length})</h2>
      <div class="list" style="margin-bottom:1.5rem">
        {live.length ? live.map((l) => <LessonItem l={l} now={now} user={user} />) : <div class="card"><Empty icon="video-off" text="لا توجد حصص مباشرة حالياً." /></div>}
      </div>
      {open.length > 0 && (
        <>
          <h2>تبدأ خلال دقائق ({open.length})</h2>
          <div class="list" style="margin-bottom:1.5rem">
            {open.map((l) => (
              <LessonItem l={l} now={now} user={user} />
            ))}
          </div>
        </>
      )}
      <h2>لاحقاً اليوم ({later.length})</h2>
      <div class="list">
        {later.map((l) => (
          <LessonItem l={l} now={now} user={user} />
        ))}
      </div>
      <script dangerouslySetInnerHTML={{ __html: 'setTimeout(()=>location.reload(),60000)' }} />
    </>,
  )
})

adminRoutes.get('/admin/lessons', (c) => c.redirect('/lessons'))

// ============ المستخدمون ============
const roleNames: Record<Role, string> = { admin: 'مشرف', teacher: 'معلمة', student: 'طالب' }

adminRoutes.get('/admin/users', async (c) => {
  const role = (['teacher', 'student', 'admin'].includes(c.req.query('role') ?? '') ? c.req.query('role') : 'student') as Role
  const q = str(c.req.query('q'), 40)
  const status = ['active', 'inactive'].includes(c.req.query('status') ?? '') ? c.req.query('status')! : ''
  const where = `u.role = ?1 AND (?2 = '' OR u.name LIKE '%' || ?2 || '%' OR u.phone LIKE '%' || ?2 || '%') AND (?3 = '' OR u.active = (?3 = 'active'))`
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${where}`).bind(role, q, status).first<{ n: number }>())?.n ?? 0
  const pg = pageInfo(readPage(c.req.url), total)
  const rows = (
    await c.env.DB.prepare(
      `SELECT u.id, u.name, u.phone, u.active, u.guardian_name, u.avatar_v,
        (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id AND e.status='active') AS enrolls,
        (SELECT COUNT(*) FROM courses c WHERE c.teacher_id = u.id AND c.status='active') AS courses
       FROM users u WHERE ${where}
       ORDER BY u.active DESC, u.name LIMIT ?4 OFFSET ?5`,
    )
      .bind(role, q, status, pg.size, pg.offset)
      .all<{ id: number; name: string; phone: string; active: number; guardian_name: string | null; avatar_v: number | null; enrolls: number; courses: number }>()
  ).results
  const title = role === 'teacher' ? 'المعلمات' : role === 'admin' ? 'المشرفون' : 'الطلاب'
  return page(
    c,
    title,
    <>
      <PageHead title={title} sub={`${total} حساب`} />
      <div class="tabs">
        {(['student', 'teacher', 'admin'] as Role[]).map((r) => (
          <a href={`/admin/users?role=${r}`} class={r === role ? 'active' : ''}>
            {r === 'teacher' ? 'المعلمات' : r === 'admin' ? 'المشرفون' : 'الطلاب'}
          </a>
        ))}
      </div>
      <Toolbar q={q} placeholder="بحث بالاسم أو الجوال" hidden={{ role }}>
        <select name="status" aria-label="الحالة">
          <option value="">كل الحالات</option>
          <option value="active" selected={status === 'active'}>
            نشط
          </option>
          <option value="inactive" selected={status === 'inactive'}>
            موقوف
          </option>
        </select>
      </Toolbar>
      <details class="drop">
        <summary>إضافة {roleNames[role]}</summary>
        <div>
          <form method="post" action="/admin/users">
            <input type="hidden" name="role" value={role} />
            <div class="form-grid">
              <div class="field">
                <label>الاسم</label>
                <input name="name" required maxlength={80} />
              </div>
              <div class="field">
                <label>رقم الجوال (اسم الدخول)</label>
                <input name="phone" required dir="ltr" inputmode="tel" placeholder="05xxxxxxxx" />
              </div>
              <div class="field">
                <label>كلمة المرور المبدئية</label>
                <input name="password" required minlength={6} dir="ltr" value={Math.random().toString(36).slice(2, 10)} />
                <div class="hint">أرسلها للمستخدم عبر رسالة، ويمكن تغييرها لاحقاً.</div>
              </div>
              {role === 'student' && (
                <div class="field">
                  <label>ولي الأمر (اختياري)</label>
                  <input name="guardian_name" maxlength={80} />
                </div>
              )}
            </div>
            <button class="btn">إضافة</button>
          </form>
        </div>
      </details>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>{role === 'teacher' ? 'الدورات' : role === 'student' ? 'الدورات المسجل بها' : ''}</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr>
                <td>
                  <Person id={u.id} name={u.name} v={u.avatar_v} href={`/admin/users/${u.id}`} sub={u.guardian_name ? `ولي الأمر: ${u.guardian_name}` : undefined} />
                </td>
                <td class="num">{u.phone}</td>
                <td>{role === 'teacher' ? u.courses : role === 'student' ? u.enrolls : ''}</td>
                <td>{u.active ? <span class="badge ok">نشط</span> : <span class="badge gray">موقوف</span>}</td>
                <td>
                  <a class="btn btn-ghost btn-sm" href={`/admin/users/${u.id}`}>
                    فتح
                  </a>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colspan={5}>
                  <Empty icon="user" text={q || status ? 'لا توجد نتائج مطابقة.' : 'لا يوجد مستخدمون.'} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager info={pg} url={c.req.url} />
    </>,
  )
})

adminRoutes.post('/admin/users', async (c) => {
  const f = await form(c)
  const role = String(f.role) as Role
  if (!['admin', 'teacher', 'student'].includes(role)) return back(c, 'bad', 'دور غير صالح.')
  const name = str(f.name, 80)
  const phone = normalizePhone(f.phone)
  const password = String(f.password ?? '')
  if (name.length < 2) return back(c, 'bad', 'الاسم قصير.')
  if (!isValidPhone(phone)) return back(c, 'bad', 'رقم الجوال يجب أن يكون بصيغة 05xxxxxxxx.')
  if (password.length < 6) return back(c, 'bad', 'كلمة المرور 6 أحرف على الأقل.')
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first()
  if (exists) return back(c, 'bad', 'رقم الجوال مسجل مسبقاً.')
  const pw = await newPasswordRecord(password)
  const r = await c.env.DB.prepare('INSERT INTO users (role, name, phone, password_hash, password_salt, guardian_name) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(role, name, phone, pw.password_hash, pw.password_salt, str(f.guardian_name, 80) || null)
    .first<{ id: number }>()
  return go(c, `/admin/users/${r!.id}`, 'ok', `تم إنشاء الحساب. بيانات الدخول: ${phone} / ${password}`)
})

adminRoutes.get('/admin/users/:id', async (c) => {
  const id = int(c.req.param('id'))
  const u = await c.env.DB.prepare('SELECT id, role, name, phone, guardian_name, notes, active, created_at, avatar_v FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: number; role: Role; name: string; phone: string; guardian_name: string | null; notes: string | null; active: number; created_at: number; avatar_v: number | null }>()
  if (!u) return notFound(c)
  let extra = <></>
  if (u.role === 'student') {
    const enrolls = (
      await c.env.DB.prepare(
        `SELECT e.id, e.agreed_price, e.status, c.id AS course_id, c.title, p.name AS partner_name,
           COALESCE((SELECT SUM(amount) FROM payments y WHERE y.enrollment_id = e.id), 0) AS paid
         FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN partners p ON p.id = e.partner_id WHERE e.student_id = ? ORDER BY e.id DESC`,
      )
        .bind(id)
        .all<{ id: number; agreed_price: number; status: string; course_id: number; title: string; partner_name: string | null; paid: number }>()
    ).results
    const insts = await installmentStates(c.env.DB, { studentId: id })
    extra = (
      <div class="card">
        <h2>الدورات والمدفوعات</h2>
        {enrolls.length ? (
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الدورة</th>
                  <th>الجهة</th>
                  <th class="money">المتفق</th>
                  <th class="money">المدفوع</th>
                  <th class="money">المتبقي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {enrolls.map((e) => (
                  <tr>
                    <td>
                      <a href={`/admin/courses/${e.course_id}`}>{e.title}</a> {e.status !== 'active' && <span class="badge gray">منسحب</span>}
                    </td>
                    <td>{e.partner_name ?? '—'}</td>
                    <td class="money">
                      <Money v={e.agreed_price} />
                    </td>
                    <td class="money">
                      <Money v={e.paid} />
                    </td>
                    <td class="money">
                      <Money v={e.agreed_price - e.paid} color />
                    </td>
                    <td>
                      <a class="btn btn-soft btn-sm" href={`/admin/enrollments/${e.id}`}>
                        الأقساط والدفعات
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="book-open" text="غير مسجل في أي دورة." />
        )}
        {insts.some((i) => i.state === 'overdue') && <div class="alert bad mt"><Icon name="triangle-alert" /> لديه أقساط متأخرة بقيمة {formatSAR(insts.filter((i) => i.state === 'overdue').reduce((s, i) => s + i.remaining, 0))}</div>}
      </div>
    )
  } else if (u.role === 'teacher') {
    const fins = await courseFinances(c.env.DB, { teacherId: id })
    extra = (
      <div class="card">
        <h2>الدورات والمستحقات</h2>
        {fins.length ? (
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الدورة</th>
                  <th>الطلاب</th>
                  <th class="money">المستحق</th>
                  <th class="money">المصروف</th>
                  <th class="money">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {fins.map((f) => (
                  <tr>
                    <td>
                      <a href={`/admin/courses/${f.id}`}>{f.title}</a>
                    </td>
                    <td>{f.students}</td>
                    <td class="money">
                      <Money v={f.teacher_due} />
                    </td>
                    <td class="money">
                      <Money v={f.teacher_paid} />
                    </td>
                    <td class="money">
                      <Money v={f.teacher_balance} color />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="book-open" text="لا توجد دورات." />
        )}
      </div>
    )
  }
  return page(
    c,
    u.name,
    <>
      <div class="user-hero card">
        <AvatarEditor id={u.id} name={u.name} v={u.avatar_v} action={`/admin/users/${u.id}/avatar`} />
        <div class="grow">
          <h1 class="mb-0">{u.name}</h1>
          <p class="muted" style="margin:.25rem 0 0;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
            <span class="badge">{roleNames[u.role]}</span>
            {u.active ? <span class="badge ok">نشط</span> : <span class="badge gray">موقوف</span>}
            <span class="num">{u.phone}</span>
          </p>
        </div>
        <div class="actions">
          <a class="btn btn-soft" href={`/messages?with=${u.id}`}>
            <Icon name="message-circle" /> مراسلة
          </a>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>البيانات</h2>
          <form method="post" action={`/admin/users/${u.id}`}>
            <div class="form-grid">
              <div class="field">
                <label>الاسم</label>
                <input name="name" value={u.name} required />
              </div>
              <div class="field">
                <label>الجوال</label>
                <input name="phone" value={u.phone} dir="ltr" required />
              </div>
              {u.role === 'student' && (
                <div class="field">
                  <label>ولي الأمر</label>
                  <input name="guardian_name" value={u.guardian_name ?? ''} />
                </div>
              )}
            </div>
            <div class="field">
              <label>ملاحظات داخلية</label>
              <textarea name="notes">{u.notes ?? ''}</textarea>
            </div>
            <label class="flex" style="font-weight:500">
              <input type="checkbox" name="active" value="1" checked={!!u.active} /> الحساب نشط
            </label>
            <button class="btn mt">حفظ</button>
          </form>
        </div>
        <div class="card">
          <h2>إعادة تعيين كلمة المرور</h2>
          <form method="post" action={`/admin/users/${u.id}/password`}>
            <div class="field">
              <label>كلمة المرور الجديدة</label>
              <input name="password" required minlength={6} dir="ltr" value={Math.random().toString(36).slice(2, 10)} />
            </div>
            <button class="btn btn-ghost">تعيين وتسجيل الخروج من كل الأجهزة</button>
          </form>
        </div>
      </div>
      {extra}
    </>,
    { scripts: ['/static/avatar.js'] },
  )
})

adminRoutes.post('/admin/users/:id', async (c) => {
  const id = int(c.req.param('id'))
  const f = await form(c)
  const phone = normalizePhone(f.phone)
  if (!isValidPhone(phone)) return back(c, 'bad', 'رقم جوال غير صالح.')
  const dup = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').bind(phone, id).first()
  if (dup) return back(c, 'bad', 'رقم الجوال مستخدم لحساب آخر.')
  const active = f.active === '1' ? 1 : 0
  if (!active && id === c.get('user')!.id) return back(c, 'bad', 'لا يمكنك إيقاف حسابك.')
  await c.env.DB.prepare('UPDATE users SET name = ?, phone = ?, guardian_name = ?, notes = ?, active = ? WHERE id = ?')
    .bind(str(f.name, 80), phone, str(f.guardian_name, 80) || null, str(f.notes, 2000) || null, active, id)
    .run()
  if (!active) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  return back(c, 'ok', 'تم الحفظ.')
})

adminRoutes.post('/admin/users/:id/password', async (c) => {
  const id = int(c.req.param('id'))
  const f = await form(c)
  const password = String(f.password ?? '')
  if (password.length < 6) return back(c, 'bad', 'كلمة المرور 6 أحرف على الأقل.')
  const pw = await newPasswordRecord(password)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(pw.password_hash, pw.password_salt, id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND user_id != ?').bind(id, c.get('user')!.id),
  ])
  return back(c, 'ok', `تم تعيين كلمة المرور الجديدة: ${password}`)
})

// ============ الدورات ============
async function optionLists(db: D1Database) {
  const [t, p] = await db.batch([
    db.prepare(`SELECT id, name FROM users WHERE role = 'teacher' AND active = 1 ORDER BY name`),
    db.prepare(`SELECT id, name, commission_bps FROM partners WHERE active = 1 ORDER BY name`),
  ])
  return { teachers: t.results as { id: number; name: string }[], partners: p.results as { id: number; name: string; commission_bps: number }[] }
}

function CourseFields({ co, teachers, partners }: { co?: Record<string, unknown>; teachers: { id: number; name: string }[]; partners: { id: number; name: string }[] }) {
  const type = (co?.teacher_share_type as string) ?? 'percent'
  const val = (co?.teacher_share_value as number) ?? 4000
  return (
    <div class="form-grid">
      <div class="field">
        <label>اسم الدورة</label>
        <input name="title" required maxlength={120} value={(co?.title as string) ?? ''} />
      </div>
      <div class="field">
        <label>المادة</label>
        <input name="subject" maxlength={60} value={(co?.subject as string) ?? ''} />
      </div>
      <div class="field">
        <label>المعلمة</label>
        <select name="teacher_id">
          <option value="">— بدون —</option>
          {teachers.map((t) => (
            <option value={t.id} selected={co?.teacher_id === t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label>سعر الدورة للطالب (ريال)</label>
        <input name="price" inputmode="decimal" dir="ltr" required value={co ? String((co.price as number) / 100) : ''} />
      </div>
      <div class="field">
        <label>طريقة حساب مستحق المعلمة</label>
        <select name="teacher_share_type">
          <option value="percent" selected={type === 'percent'}>
            نسبة من المحصّل
          </option>
          <option value="per_student" selected={type === 'per_student'}>
            مبلغ لكل طالب
          </option>
          <option value="fixed" selected={type === 'fixed'}>
            مبلغ ثابت للدورة
          </option>
        </select>
      </div>
      <div class="field">
        <label>القيمة (% أو ريال)</label>
        <input name="teacher_share_value" inputmode="decimal" dir="ltr" required value={String(val / 100)} />
      </div>
      <div class="field">
        <label>الجهة الافتراضية (اختياري)</label>
        <select name="partner_id">
          <option value="">— بدون —</option>
          {partners.map((p) => (
            <option value={p.id} selected={co?.partner_id === p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label>تاريخ البداية</label>
        <input type="date" name="start_date" value={(co?.start_date as string) ?? ''} />
      </div>
      <div class="field">
        <label>تاريخ النهاية</label>
        <input type="date" name="end_date" value={(co?.end_date as string) ?? ''} />
      </div>
    </div>
  )
}

function parseCourse(f: Record<string, string | File>) {
  const type = (['percent', 'per_student', 'fixed'].includes(String(f.teacher_share_type)) ? f.teacher_share_type : 'percent') as ShareType
  const value = type === 'percent' ? parsePercent(f.teacher_share_value) : parseSAR(f.teacher_share_value)
  const price = parseSAR(f.price)
  const title = str(f.title, 120)
  if (!title || price === null || value === null) return null
  return {
    title,
    subject: str(f.subject, 60) || null,
    teacher_id: int(f.teacher_id) || null,
    partner_id: int(f.partner_id) || null,
    price,
    teacher_share_type: type,
    teacher_share_value: value,
    start_date: isDate(f.start_date) ? f.start_date : null,
    end_date: isDate(f.end_date) ? f.end_date : null,
  }
}

adminRoutes.get('/admin/courses', async (c) => {
  const fins = await courseFinances(c.env.DB)
  const opts = await optionLists(c.env.DB)
  return page(
    c,
    'الدورات',
    <>
      <PageHead title="الدورات" sub="لكل دورة: الطلاب، التحصيل، مستحقات المعلمة والجهة، وصافي الربح" />
      <details class="drop">
        <summary>دورة جديدة</summary>
        <div>
          <form method="post" action="/admin/courses">
            <CourseFields teachers={opts.teachers} partners={opts.partners} />
            <button class="btn">إنشاء الدورة</button>
          </form>
        </div>
      </details>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الدورة</th>
              <th>المعلمة</th>
              <th>الطلاب</th>
              <th class="money">المحصّل</th>
              <th class="money">المتبقي على الطلاب</th>
              <th class="money">صافي الربح</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fins.map((f) => (
              <tr>
                <td>
                  <a href={`/admin/courses/${f.id}`}>
                    <b>{f.title}</b>
                  </a>
                  {f.status !== 'active' && <span class="badge gray" style="margin-inline-start:.4rem">مؤرشفة</span>}
                </td>
                <td>{f.teacher_name ?? '—'}</td>
                <td>{f.students}</td>
                <td class="money">
                  <Money v={f.collected} />
                </td>
                <td class="money">
                  <Money v={f.outstanding} />
                </td>
                <td class="money">
                  <Money v={f.net} color />
                </td>
                <td>
                  <a class="btn btn-ghost btn-sm" href={`/admin/courses/${f.id}`}>
                    فتح
                  </a>
                </td>
              </tr>
            ))}
            {!fins.length && (
              <tr>
                <td colspan={7}>
                  <Empty icon="book-open" text="لا توجد دورات بعد." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>,
  )
})

adminRoutes.post('/admin/courses', async (c) => {
  const d = parseCourse(await form(c))
  if (!d) return back(c, 'bad', 'تأكد من اسم الدورة والسعر وقيمة مستحق المعلمة.')
  const r = await c.env.DB.prepare(
    `INSERT INTO courses (title, subject, teacher_id, partner_id, price, teacher_share_type, teacher_share_value, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(d.title, d.subject, d.teacher_id, d.partner_id, d.price, d.teacher_share_type, d.teacher_share_value, d.start_date, d.end_date)
    .first<{ id: number }>()
  return go(c, `/admin/courses/${r!.id}`, 'ok', 'تم إنشاء الدورة. أضف الطلاب الآن.')
})

adminRoutes.get('/admin/courses/:id', async (c) => {
  const id = int(c.req.param('id'))
  const co = await c.env.DB.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first<Record<string, unknown> & { id: number; title: string; price: number; status: string; partner_id: number | null; teacher_share_type: ShareType; teacher_share_value: number }>()
  if (!co) return notFound(c)
  const [fin] = await courseFinances(c.env.DB, { courseId: id })
  const opts = await optionLists(c.env.DB)
  const enrolls = (
    await c.env.DB.prepare(
      `SELECT e.id, e.agreed_price, e.status, u.id AS student_id, u.name, u.phone, p.name AS partner_name,
         COALESCE((SELECT SUM(amount) FROM payments y WHERE y.enrollment_id = e.id), 0) AS paid
       FROM enrollments e JOIN users u ON u.id = e.student_id LEFT JOIN partners p ON p.id = e.partner_id
       WHERE e.course_id = ? ORDER BY e.status, u.name`,
    )
      .bind(id)
      .all<{ id: number; agreed_price: number; status: string; student_id: number; name: string; phone: string; partner_name: string | null; paid: number }>()
  ).results
  const students = (
    await c.env.DB.prepare(
      `SELECT id, name, phone FROM users WHERE role = 'student' AND active = 1 AND id NOT IN (SELECT student_id FROM enrollments WHERE course_id = ?) ORDER BY name LIMIT 1000`,
    )
      .bind(id)
      .all<{ id: number; name: string; phone: string }>()
  ).results
  const asgs = (await c.env.DB.prepare('SELECT id, title, due_at FROM assignments WHERE course_id = ? ORDER BY id DESC LIMIT 20').bind(id).all<{ id: number; title: string; due_at: number | null }>())
    .results
  const bar = (v: number) => (fin.collected > 0 ? Math.max(0, (v / fin.collected) * 100) : 0)
  return page(
    c,
    co.title,
    <>
      <PageHead title={co.title} sub={`${fin.teacher_name ?? 'بدون معلمة'} • ${shareLabel(co.teacher_share_type, co.teacher_share_value)} • السعر ${formatSAR(co.price)}`}>
        <a class="btn btn-soft" href={`/admin/finance/course/${id}`}>
          <Icon name="chart-column" /> تقرير الربح والخسارة
        </a>
      </PageHead>
      <div class="stats">
        <Stat label="المحصّل" value={<Money v={fin.collected} />} sub={`من ${formatSAR(fin.expected)} متفق عليه`} tone="ok" />
        <Stat label="المتبقي على الطلاب" value={<Money v={fin.outstanding} />} tone="warn" />
        <Stat label="مستحق المعلمة + الجهات" value={<Money v={fin.teacher_due + fin.partner_due} />} sub={`معلمة ${formatSAR(fin.teacher_due)} • جهات ${formatSAR(fin.partner_due)}`} />
        <Stat label="صافي الربح" value={<Money v={fin.net} color />} sub={`هامش ${formatPercent(fin.margin_bps)}`} tone={fin.net >= 0 ? 'teal' : 'bad'} />
      </div>
      {fin.collected > 0 && (
        <div class="card">
          <div class="bar" title="توزيع المحصّل">
            <span style={`width:${bar(fin.teacher_due)}%;background:#5b3df5`}></span>
            <span style={`width:${bar(fin.partner_due)}%;background:#ffb020`}></span>
            <span style={`width:${bar(fin.expenses)}%;background:#e5484d`}></span>
            <span style={`width:${bar(Math.max(0, fin.net))}%;background:#12a150`}></span>
          </div>
          <div class="legend">
            <span><i style="background:#5b3df5"></i>المعلمة</span>
            <span><i style="background:#ffb020"></i>الجهات</span>
            <span><i style="background:#e5484d"></i>المصروفات</span>
            <span><i style="background:#12a150"></i>صافي الربح</span>
          </div>
        </div>
      )}
      <div class="card">
        <div class="card-head">
          <h2>الطلاب المسجلون ({enrolls.filter((e) => e.status === 'active').length})</h2>
        </div>
        <details class="drop">
          <summary>تسجيل طالب في الدورة</summary>
          <div>
            {students.length ? (
              <form method="post" action={`/admin/courses/${id}/enroll`}>
                <div class="form-grid">
                  <div class="field">
                    <label>الطالب</label>
                    <select name="student_id" required>
                      {students.map((s) => (
                        <option value={s.id}>
                          {s.name} — {s.phone}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="field">
                    <label>السعر المتفق (ريال)</label>
                    <input name="agreed_price" dir="ltr" inputmode="decimal" value={String(co.price / 100)} required />
                  </div>
                  <div class="field">
                    <label>الجهة التي جلبته</label>
                    <select name="partner_id">
                      <option value="">— بدون —</option>
                      {opts.partners.map((p) => (
                        <option value={p.id} selected={co.partner_id === p.id}>
                          {p.name} ({formatPercent(p.commission_bps)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="field">
                    <label>عدد الأقساط</label>
                    <select name="installments">
                      {[1, 2, 3, 4, 6].map((n) => (
                        <option value={n}>{n === 1 ? 'دفعة واحدة' : `${n} أقساط شهرية`}</option>
                      ))}
                    </select>
                  </div>
                  <div class="field">
                    <label>تاريخ أول قسط</label>
                    <input type="date" name="first_due" value={todayRiyadh()} required />
                  </div>
                </div>
                <button class="btn">تسجيل وإنشاء جدول الأقساط</button>
              </form>
            ) : (
              <p class="muted">
                كل الطلاب مسجلون، أو <a href="/admin/users?role=student">أضف طالباً جديداً</a>.
              </p>
            )}
          </div>
        </details>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الطالب</th>
                <th>الجهة</th>
                <th class="money">المتفق</th>
                <th class="money">المدفوع</th>
                <th class="money">المتبقي</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enrolls.map((e) => (
                <tr style={e.status !== 'active' ? 'opacity:.55' : ''}>
                  <td>
                    <a href={`/admin/users/${e.student_id}`}>{e.name}</a>
                    {e.status !== 'active' && <span class="badge gray" style="margin-inline-start:.4rem">منسحب</span>}
                  </td>
                  <td>{e.partner_name ?? '—'}</td>
                  <td class="money">
                    <Money v={e.agreed_price} />
                  </td>
                  <td class="money">
                    <Money v={e.paid} />
                  </td>
                  <td class="money">
                    <Money v={Math.max(0, e.agreed_price - e.paid)} />
                  </td>
                  <td>
                    <a class="btn btn-soft btn-sm" href={`/admin/enrollments/${e.id}`}>
                      الأقساط
                    </a>
                  </td>
                </tr>
              ))}
              {!enrolls.length && (
                <tr>
                  <td colspan={6}>
                    <Empty icon="backpack" text="لا يوجد طلاب بعد." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>تعديل الدورة</h2>
          <form method="post" action={`/admin/courses/${id}`}>
            <CourseFields co={co} teachers={opts.teachers} partners={opts.partners} />
            <label class="flex" style="font-weight:500">
              <input type="checkbox" name="archived" value="1" checked={co.status === 'archived'} /> أرشفة الدورة (إخفاؤها من الجداول)
            </label>
            <button class="btn mt">حفظ التعديلات</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head">
            <h2>الواجبات</h2>
            <a href="/admin/assignments">
              كل الواجبات <Icon name="chevron-left" />
            </a>
          </div>
          {asgs.length ? (
            <div class="list">
              {asgs.map((a) => (
                <a class="item" href={`/assignments/${a.id}`} style="color:inherit">
                  <Icon name="notebook-pen" /> <div class="grow">{a.title}</div>
                  {a.due_at && <small class="muted">{fmtDateTime(a.due_at)}</small>}
                </a>
              ))}
            </div>
          ) : (
            <Empty icon="notebook-pen" text="لا توجد واجبات." />
          )}
        </div>
      </div>
    </>,
  )
})

adminRoutes.post('/admin/courses/:id', async (c) => {
  const id = int(c.req.param('id'))
  const f = await form(c)
  const d = parseCourse(f)
  if (!d) return back(c, 'bad', 'تأكد من البيانات.')
  await c.env.DB.prepare(
    `UPDATE courses SET title=?, subject=?, teacher_id=?, partner_id=?, price=?, teacher_share_type=?, teacher_share_value=?, start_date=?, end_date=?, status=? WHERE id=?`,
  )
    .bind(d.title, d.subject, d.teacher_id, d.partner_id, d.price, d.teacher_share_type, d.teacher_share_value, d.start_date, d.end_date, f.archived === '1' ? 'archived' : 'active', id)
    .run()
  return back(c, 'ok', 'تم حفظ الدورة.')
})

adminRoutes.post('/admin/courses/:id/enroll', async (c) => {
  const courseId = int(c.req.param('id'))
  const f = await form(c)
  const studentId = int(f.student_id)
  const price = parseSAR(f.agreed_price)
  const firstDue = isDate(f.first_due) ? f.first_due : todayRiyadh()
  if (!studentId || price === null) return back(c, 'bad', 'اختر الطالب وأدخل السعر.')
  const st = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ? AND role = 'student'`).bind(studentId).first()
  if (!st) return back(c, 'bad', 'طالب غير صالح.')
  const r = await c.env.DB.prepare(
    `INSERT INTO enrollments (course_id, student_id, agreed_price, partner_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(course_id, student_id) DO UPDATE SET status = 'active' RETURNING id`,
  )
    .bind(courseId, studentId, price, int(f.partner_id) || null)
    .first<{ id: number }>()
  const has = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM installments WHERE enrollment_id = ?').bind(r!.id).first<{ n: number }>()
  if (!has?.n && price > 0) {
    const plan = splitInstallments(price, int(f.installments, 1), firstDue)
    await c.env.DB.batch(plan.map((p) => c.env.DB.prepare('INSERT INTO installments (enrollment_id, amount, due_date) VALUES (?, ?, ?)').bind(r!.id, p.amount, p.due_date)))
  }
  return back(c, 'ok', 'تم تسجيل الطالب وإنشاء جدول الأقساط.')
})

// ============ قاعات الزوم ============
adminRoutes.get('/admin/rooms', async (c) => {
  const now = nowSec()
  const rooms = (
    await c.env.DB.prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM lessons l WHERE l.zoom_room_id = r.id AND l.status != 'cancelled' AND l.ends_at > ?) AS upcoming FROM zoom_rooms r ORDER BY r.id`,
    )
      .bind(now)
      .all<{ id: number; name: string; account_label: string | null; join_url: string; passcode: string | null; host_key: string | null; active: number; upcoming: number }>()
  ).results
  return page(
    c,
    'قاعات الزوم',
    <>
      <PageHead title="قاعات الزوم" sub="القاعات المدفوعة اللي عندكم. المنصة توزع الحصص عليها تلقائياً بدون تعارض، وعند امتلائها تفتح الحصة على بث المنصة." />
      <div class="alert info">
        <Icon name="lightbulb" /> لكل قاعة: استخدموا <b>رابط الاجتماع الشخصي (PMI)</b> أو اجتماعاً متكرراً بدون موعد لكل مستخدم مرخص في الزوم. الرابط لا يظهر للطلاب إلا وقت حصتهم فقط.
      </div>
      <div class="grid grid-2">
        {rooms.map((r) => (
          <div class="card">
            <form method="post" action={`/admin/rooms/${r.id}`}>
              <div class="flex between">
                <h3 class="mb-0"><Icon name="video" /> {r.name}</h3>
                {r.active ? <span class="badge ok">مفعلة</span> : <span class="badge gray">معطلة</span>}
              </div>
              <p class="muted" style="font-size:.84rem">{r.upcoming} حصة قادمة محجوزة عليها</p>
              <div class="form-grid">
                <div class="field">
                  <label>الاسم</label>
                  <input name="name" value={r.name} required />
                </div>
                <div class="field">
                  <label>الحساب</label>
                  <input name="account_label" value={r.account_label ?? ''} />
                </div>
              </div>
              <div class="field">
                <label>رابط الدخول</label>
                <input name="join_url" value={r.join_url} dir="ltr" required />
              </div>
              <div class="form-grid">
                <div class="field">
                  <label>رمز الدخول</label>
                  <input name="passcode" value={r.passcode ?? ''} dir="ltr" />
                </div>
                <div class="field">
                  <label>مفتاح المضيف</label>
                  <input name="host_key" value={r.host_key ?? ''} dir="ltr" />
                </div>
              </div>
              <label class="flex" style="font-weight:500">
                <input type="checkbox" name="active" value="1" checked={!!r.active} /> مفعلة للتوزيع
              </label>
              <button class="btn btn-sm mt">حفظ</button>
            </form>
          </div>
        ))}
      </div>
      <details class="drop">
        <summary>إضافة قاعة</summary>
        <div>
          <form method="post" action="/admin/rooms">
            <div class="form-grid">
              <div class="field">
                <label>الاسم</label>
                <input name="name" required placeholder={`قاعة ${rooms.length + 1}`} />
              </div>
              <div class="field">
                <label>الحساب</label>
                <input name="account_label" />
              </div>
              <div class="field">
                <label>رابط الدخول</label>
                <input name="join_url" required dir="ltr" placeholder="https://us05web.zoom.us/j/..." />
              </div>
              <div class="field">
                <label>رمز الدخول</label>
                <input name="passcode" dir="ltr" />
              </div>
            </div>
            <button class="btn">إضافة</button>
          </form>
        </div>
      </details>
    </>,
  )
})

function roomData(f: Record<string, string | File>) {
  const url = str(f.join_url, 500)
  if (!/^https:\/\/([a-z0-9-]+\.)*zoom\.(us|com)\//i.test(url)) return null
  return { name: str(f.name, 60) || 'قاعة', account_label: str(f.account_label, 60) || null, join_url: url, passcode: str(f.passcode, 40) || null, host_key: str(f.host_key, 20) || null }
}

adminRoutes.post('/admin/rooms', async (c) => {
  const d = roomData(await form(c))
  if (!d) return back(c, 'bad', 'رابط الزوم غير صالح (يجب أن يبدأ بـ https:// ومن نطاق zoom.us).')
  await c.env.DB.prepare('INSERT INTO zoom_rooms (name, account_label, join_url, passcode) VALUES (?, ?, ?, ?)').bind(d.name, d.account_label, d.join_url, d.passcode).run()
  return back(c, 'ok', 'تمت إضافة القاعة.')
})

adminRoutes.post('/admin/rooms/:id', async (c) => {
  const f = await form(c)
  const d = roomData(f)
  if (!d) return back(c, 'bad', 'رابط الزوم غير صالح.')
  await c.env.DB.prepare('UPDATE zoom_rooms SET name=?, account_label=?, join_url=?, passcode=?, host_key=?, active=? WHERE id=?')
    .bind(d.name, d.account_label, d.join_url, d.passcode, d.host_key, f.active === '1' ? 1 : 0, int(c.req.param('id')))
    .run()
  return back(c, 'ok', 'تم حفظ القاعة.')
})

// ============ الجهات ============
adminRoutes.get('/admin/partners', async (c) => {
  const rows = (
    await c.env.DB.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM enrollments e WHERE e.partner_id = p.id AND e.status='active') AS students FROM partners p ORDER BY p.active DESC, p.name`,
    ).all<{ id: number; name: string; contact_phone: string | null; commission_bps: number; notes: string | null; active: number; students: number }>()
  ).results
  return page(
    c,
    'الجهات',
    <>
      <PageHead title="الجهات" sub="الجهات التي تجلب طلاباً للدورات، ونسبة عمولة كل جهة من المحصّل" />
      <details class="drop" open={!rows.length}>
        <summary>جهة جديدة</summary>
        <div>
          <form method="post" action="/admin/partners">
            <div class="form-grid">
              <div class="field">
                <label>اسم الجهة</label>
                <input name="name" required />
              </div>
              <div class="field">
                <label>جوال التواصل</label>
                <input name="contact_phone" dir="ltr" />
              </div>
              <div class="field">
                <label>نسبة العمولة %</label>
                <input name="commission" dir="ltr" inputmode="decimal" value="10" required />
              </div>
            </div>
            <button class="btn">إضافة</button>
          </form>
        </div>
      </details>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الجهة</th>
              <th>الجوال</th>
              <th>العمولة</th>
              <th>طلاب نشطون</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr>
                <td>
                  <b>{p.name}</b> {!p.active && <span class="badge gray">معطلة</span>}
                </td>
                <td class="num">{p.contact_phone ?? '—'}</td>
                <td>{formatPercent(p.commission_bps)}</td>
                <td>{p.students}</td>
                <td>
                  <form method="post" action={`/admin/partners/${p.id}`} class="flex">
                    <input name="commission" value={String(p.commission_bps / 100)} dir="ltr" style="width:80px" aria-label={`نسبة عمولة ${p.name} (%)`} />
                    <input type="hidden" name="name" value={p.name} />
                    <input type="hidden" name="contact_phone" value={p.contact_phone ?? ''} />
                    <label class="flex" style="margin:0;font-weight:500">
                      <input type="checkbox" name="active" value="1" checked={!!p.active} /> مفعلة
                    </label>
                    <button class="btn btn-ghost btn-sm">حفظ</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="muted mt" style="font-size:.85rem">
        ملاحظة: تغيير النسبة يعيد حساب مستحقات الجهة على كل المحصّل من طلابها (الماضي والقادم). المبالغ المصروفة فعلياً لا تتغير.
      </p>
    </>,
  )
})

adminRoutes.post('/admin/partners', async (c) => {
  const f = await form(c)
  const bps = parsePercent(f.commission)
  if (!str(f.name) || bps === null) return back(c, 'bad', 'أدخل الاسم ونسبة صحيحة (0–100).')
  await c.env.DB.prepare('INSERT INTO partners (name, contact_phone, commission_bps) VALUES (?, ?, ?)').bind(str(f.name, 80), str(f.contact_phone, 20) || null, bps).run()
  return back(c, 'ok', 'تمت إضافة الجهة.')
})

adminRoutes.post('/admin/partners/:id', async (c) => {
  const f = await form(c)
  const bps = parsePercent(f.commission)
  if (bps === null) return back(c, 'bad', 'نسبة غير صحيحة.')
  await c.env.DB.prepare('UPDATE partners SET name=?, contact_phone=?, commission_bps=?, active=? WHERE id=?')
    .bind(str(f.name, 80), str(f.contact_phone, 20) || null, bps, f.active === '1' ? 1 : 0, int(c.req.param('id')))
    .run()
  return back(c, 'ok', 'تم الحفظ.')
})

// ============ طلبات التسجيل من الموقع ============
const leadStatus = { new: ['جديد', 'bad'], contacted: ['تم التواصل', 'warn'], enrolled: ['سُجّل', 'ok'], closed: ['مغلق', 'gray'] } as const

adminRoutes.get('/admin/leads', async (c) => {
  const q = str(c.req.query('q'), 40)
  const st = Object.keys(leadStatus).includes(c.req.query('status') ?? '') ? c.req.query('status')! : ''
  const where = `(?1 = '' OR name LIKE '%' || ?1 || '%' OR phone LIKE '%' || ?1 || '%') AND (?2 = '' OR status = ?2)`
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE ${where}`).bind(q, st).first<{ n: number }>())?.n ?? 0
  const pg = pageInfo(readPage(c.req.url), total)
  const rows = (
    await c.env.DB.prepare(`SELECT * FROM leads WHERE ${where} ORDER BY status = 'new' DESC, id DESC LIMIT ?3 OFFSET ?4`).bind(q, st, pg.size, pg.offset).all<{
      id: number
      name: string
      phone: string
      grade: string | null
      subject: string | null
      status: keyof typeof leadStatus
      created_at: number
    }>()
  ).results
  return page(
    c,
    'طلبات التسجيل',
    <>
      <PageHead title="طلبات التسجيل" sub="طلبات الحصة التجريبية من الموقع التعريفي" />
      <Toolbar q={q} placeholder="بحث بالاسم أو الجوال">
        <select name="status" aria-label="الحالة">
          <option value="">كل الحالات</option>
          {Object.entries(leadStatus).map(([k, [label]]) => (
            <option value={k} selected={k === st}>
              {label}
            </option>
          ))}
        </select>
      </Toolbar>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>الصف / المادة</th>
              <th>التاريخ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr>
                <td>
                  <b>{l.name}</b>
                </td>
                <td>
                  <a class="num" href={`https://wa.me/966${l.phone.slice(1)}`} target="_blank" rel="noopener">
                    {l.phone}
                  </a>
                </td>
                <td>
                  {l.grade} • {l.subject}
                </td>
                <td>{fmtDateTime(l.created_at)}</td>
                <td>
                  <form method="post" action={`/admin/leads/${l.id}`} class="flex">
                    <select name="status" style="width:auto;min-height:34px;padding:.2rem .5rem" onchange="this.form.submit()" aria-label={`حالة طلب ${l.name}`}>
                      {Object.entries(leadStatus).map(([k, [label]]) => (
                        <option value={k} selected={k === l.status}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </form>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colspan={5}>
                  <Empty icon="inbox" text="لا توجد طلبات بعد." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager info={pg} url={c.req.url} />
    </>,
  )
})

adminRoutes.post('/admin/leads/:id', async (c) => {
  const f = await form(c)
  if (!(String(f.status) in leadStatus)) return back(c, 'bad', 'حالة غير صالحة.')
  await c.env.DB.prepare('UPDATE leads SET status = ? WHERE id = ?').bind(String(f.status), int(c.req.param('id'))).run()
  return back(c, 'ok', 'تم التحديث.')
})
