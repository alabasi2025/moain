/** لوحات المعلمة والطالب */
import { Hono } from 'hono'
import { requireRole } from '../lib/auth'
import { lessonPhase } from '../lib/domain'
import { courseFinances, installmentStates } from '../lib/finance'
import { formatSAR } from '../lib/money'
import { lessonsFor, recordingsFor } from '../lib/queries'
import { page } from '../lib/render'
import { fmtDate, fmtDateTime, fmtRemaining, nowSec } from '../lib/time'
import type { AppEnv } from '../lib/types'
import { Empty, Money, PageHead, Pager, Stat } from '../views/layout'
import { paginate } from '../lib/paging'
import { Icon } from '../views/icons'
import { assignmentsPage } from './assignments'
import { LessonItem } from './lessons'
import { recordingsPage } from './recordings'

export const portalRoutes = new Hono<AppEnv>()

// ============ المعلمة ============
portalRoutes.get('/teacher', requireRole('teacher'), async (c) => {
  const user = c.get('user')!
  const now = nowSec()
  const [lessons, pendingGrading, fins] = await Promise.all([
    lessonsFor(c.env.DB, user, now - 3 * 3600, now + 7 * 86400),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id WHERE c.teacher_id = ? AND s.grade IS NULL`,
    )
      .bind(user.id)
      .first<{ n: number }>(),
    courseFinances(c.env.DB, { teacherId: user.id }),
  ])
  const active = lessons.filter((l) => !['ended', 'cancelled'].includes(lessonPhase(l, now)))
  const today = active.filter((l) => l.starts_at < now + 18 * 3600)
  const students = fins.reduce((s, f) => s + f.students, 0)
  return page(
    c,
    'الرئيسية',
    <>
      <PageHead title={`أهلاً أ. ${user.name.split(' ')[0]}`} sub={fmtDateTime(now)}>
        <a class="btn" href="/lessons">
          + جدولة حصة
        </a>
      </PageHead>
      <div class="stats">
        <Stat label="حصص اليوم" value={<span class="num">{today.length}</span>} tone="teal" />
        <Stat label="هذا الأسبوع" value={<span class="num">{active.length}</span>} />
        <Stat label="طلابي" value={<span class="num">{students}</span>} sub={`${fins.length} دورة`} tone="ok" />
        <Stat label="بانتظار التصحيح" value={<span class="num">{pendingGrading?.n ?? 0}</span>} tone={pendingGrading?.n ? 'warn' : undefined} />
      </div>
      <div class="card">
        <div class="card-head">
          <h2>حصصي القادمة</h2>
          <a href="/lessons">الجدول الكامل</a>
        </div>
        {active.length ? (
          <div class="list">
            {active.slice(0, 8).map((l) => (
              <LessonItem l={l} now={now} user={user} />
            ))}
          </div>
        ) : (
          <Empty icon="calendar-days" text="لا توجد حصص مجدولة هذا الأسبوع.">
            <a class="btn btn-soft" href="/lessons">
              جدولة حصة
            </a>
          </Empty>
        )}
      </div>
      <div class="alert info">
        <Icon name="lightbulb" /> <b>طريقة التسجيل:</b> في غرفة الحصة اضغطي «ابدأ التسجيل» واختاري «هذا التبويب» مع تفعيل «مشاركة صوت التبويب». التسجيل يُرفع تلقائياً أثناء الحصة ويظهر للطلاب 48 ساعة.
      </div>
    </>,
  )
})

portalRoutes.get('/teacher/lessons', requireRole('teacher'), (c) => c.redirect('/lessons'))
portalRoutes.get('/teacher/assignments', requireRole('teacher'), (c) => assignmentsPage(c))
portalRoutes.get('/teacher/recordings', requireRole('teacher'), (c) => recordingsPage(c))

portalRoutes.get('/teacher/earnings', requireRole('teacher'), async (c) => {
  const user = c.get('user')!
  const fins = await courseFinances(c.env.DB, { teacherId: user.id })
  const payouts = (
    await c.env.DB.prepare(
      `SELECT o.amount, o.paid_on, o.note, c.title FROM payouts o JOIN courses c ON c.id = o.course_id WHERE o.payee_type = 'teacher' AND o.payee_id = ? ORDER BY o.paid_on DESC LIMIT 50`,
    )
      .bind(user.id)
      .all<{ amount: number; paid_on: string; note: string | null; title: string }>()
  ).results
  const due = fins.reduce((s, f) => s + f.teacher_due, 0)
  const paid = fins.reduce((s, f) => s + f.teacher_paid, 0)
  return page(
    c,
    'مستحقاتي',
    <>
      <PageHead title="مستحقاتي" sub="تُحسب تلقائياً من المبالغ المحصّلة فعلياً من طلابك حسب اتفاق كل دورة" />
      <div class="stats">
        <Stat label="إجمالي المستحق" value={<Money v={due} />} />
        <Stat label="تم صرفه" value={<Money v={paid} />} tone="ok" />
        <Stat label="المتبقي لي" value={<Money v={due - paid} />} tone="teal" />
      </div>
      <div class="card">
        <h2>حسب الدورة</h2>
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
                  <td>{f.title}</td>
                  <td>{f.students}</td>
                  <td class="money">
                    <Money v={f.teacher_due} />
                  </td>
                  <td class="money">
                    <Money v={f.teacher_paid} />
                  </td>
                  <td class="money">
                    <b>
                      <Money v={f.teacher_balance} />
                    </b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h2>سجل الصرف</h2>
        {payouts.length ? (
          <div class="table-wrap">
            <table>
              <tbody>
                {payouts.map((p) => (
                  <tr>
                    <td>{fmtDate(p.paid_on)}</td>
                    <td>{p.title}</td>
                    <td class="money">
                      <Money v={p.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="banknote" text="لا توجد عمليات صرف بعد." />
        )}
      </div>
    </>,
  )
})

// ============ الطالب ============
portalRoutes.get('/student', requireRole('student'), async (c) => {
  const user = c.get('user')!
  const now = nowSec()
  const [lessons, recs, asg, insts] = await Promise.all([
    lessonsFor(c.env.DB, user, now - 3 * 3600, now + 7 * 86400),
    recordingsFor(c.env.DB, user),
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.due_at, c.title AS course_title FROM assignments a JOIN courses c ON c.id = a.course_id
       JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ?1 AND e.status = 'active'
       WHERE (a.due_at IS NULL OR a.due_at > unixepoch()) AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?1)
       ORDER BY a.due_at LIMIT 5`,
    )
      .bind(user.id)
      .all<{ id: number; title: string; due_at: number | null; course_title: string }>(),
    installmentStates(c.env.DB, { studentId: user.id }),
  ])
  const active = lessons.filter((l) => !['ended', 'cancelled'].includes(lessonPhase(l, now)))
  const live = active.filter((l) => ['live', 'open'].includes(lessonPhase(l, now)))
  const overdue = insts.filter((i) => i.state === 'overdue')
  return page(
    c,
    'الرئيسية',
    <>
      <PageHead title={`أهلاً ${user.name.split(' ')[0]}`} sub="جاهز لحصة اليوم؟" />
      {overdue.length > 0 && (
        <div class="alert warn">
          <Icon name="credit-card" /> عليك قسط متأخر بقيمة <b>{formatSAR(overdue.reduce((s, i) => s + i.remaining, 0))}</b>. <a href="/student/payments">التفاصيل</a>
        </div>
      )}
      {live.length > 0 && (
        <div class="card" style="border-color:#f7b4b6;background:linear-gradient(135deg,#fff,#fff4f4)">
          <h2><Icon name="radio" /> حصتك الآن</h2>
          <div class="list">
            {live.map((l) => (
              <LessonItem l={l} now={now} user={user} />
            ))}
          </div>
        </div>
      )}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head">
            <h2><Icon name="calendar-days" /> حصصي هذا الأسبوع</h2>
          </div>
          {active.filter((l) => !live.includes(l)).length ? (
            <div class="list">
              {active
                .filter((l) => !live.includes(l))
                .slice(0, 6)
                .map((l) => (
                  <LessonItem l={l} now={now} user={user} />
                ))}
            </div>
          ) : (
            <Empty icon="calendar-days" text="لا توجد حصص قادمة هذا الأسبوع." />
          )}
        </div>
        <div>
          <div class="card">
            <div class="card-head">
              <h2><Icon name="notebook-pen" /> واجبات مطلوبة</h2>
              <a href="/student/assignments">الكل</a>
            </div>
            {asg.results.length ? (
              <div class="list">
                {asg.results.map((a) => (
                  <a class="item" href={`/assignments/${a.id}`} style="color:inherit">
                    <div class="grow">
                      <div class="title">{a.title}</div>
                      <div class="meta">
                        {a.course_title}
                        {a.due_at && ` • حتى ${fmtDateTime(a.due_at)}`}
                      </div>
                    </div>
                    <span class="btn btn-sm">حل</span>
                  </a>
                ))}
              </div>
            ) : (
              <Empty icon="party-popper" text="ما عليك واجبات حالياً." />
            )}
          </div>
          <div class="card">
            <div class="card-head">
              <h2><Icon name="clapperboard" /> فاتتك حصة؟</h2>
              <a href="/student/recordings">الكل</a>
            </div>
            {recs.length ? (
              <div class="list">
                {recs.slice(0, 3).map((r) => (
                  <a class="item" href={`/recordings/${r.id}`} style="color:inherit">
                    <div class="grow">
                      <div class="title">{r.lesson_title}</div>
                      <div class="meta"><Icon name="hourglass" /> متاح {fmtRemaining(r.expires_at - now)}</div>
                    </div>
                    <span class="btn btn-soft btn-sm">▶</span>
                  </a>
                ))}
              </div>
            ) : (
              <Empty icon="clapperboard" text="لا توجد تسجيلات متاحة." />
            )}
          </div>
        </div>
      </div>
    </>,
  )
})

portalRoutes.get('/student/recordings', requireRole('student'), (c) => recordingsPage(c))
portalRoutes.get('/student/assignments', requireRole('student'), (c) => assignmentsPage(c))

const stateLabel = { paid: ['مدفوع', 'ok'], partial: ['مدفوع جزئياً', 'warn'], overdue: ['متأخر', 'bad'], due_soon: ['يستحق قريباً', 'warn'], upcoming: ['قادم', 'gray'] } as const

portalRoutes.get('/student/payments', requireRole('student'), async (c) => {
  const user = c.get('user')!
  const insts = await installmentStates(c.env.DB, { studentId: user.id })
  const pays = (
    await c.env.DB.prepare(
      `SELECT y.amount, y.paid_on, c.title FROM payments y JOIN enrollments e ON e.id = y.enrollment_id JOIN courses c ON c.id = e.course_id WHERE e.student_id = ? ORDER BY y.paid_on DESC`,
    )
      .bind(user.id)
      .all<{ amount: number; paid_on: string; title: string }>()
  ).results
  const remaining = insts.reduce((s, i) => s + i.remaining, 0)
  const { items: payPage, info: payInfo } = paginate(pays, c.req.url, 10)
  return page(
    c,
    'مدفوعاتي',
    <>
      <PageHead title="مدفوعاتي" sub="جدول الأقساط والتحويلات المسجلة" />
      <div class="stats">
        <Stat label="المدفوع" value={<Money v={pays.reduce((s, p) => s + p.amount, 0)} />} tone="ok" />
        <Stat label="المتبقي" value={<Money v={remaining} />} tone={remaining ? 'warn' : 'ok'} />
      </div>
      <div class="card">
        <h2>الأقساط</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الدورة</th>
                <th>الاستحقاق</th>
                <th class="money">المبلغ</th>
                <th class="money">المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {insts.map((i) => (
                <tr>
                  <td>{i.course_title}</td>
                  <td>{fmtDate(i.due_date)}</td>
                  <td class="money">
                    <Money v={i.amount} />
                  </td>
                  <td class="money">
                    <Money v={i.remaining} />
                  </td>
                  <td>
                    <span class={`badge ${stateLabel[i.state][1]}`}>{stateLabel[i.state][0]}</span>
                  </td>
                </tr>
              ))}
              {!insts.length && (
                <tr>
                  <td colspan={5} class="muted">
                    لا توجد أقساط.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p class="muted mt" style="font-size:.85rem">
          بعد التحويل أرسل صورة الإيصال للإدارة من صفحة <a href="/messages">الرسائل</a>.
        </p>
      </div>
      <div class="card">
        <h2>التحويلات المسجلة</h2>
        {pays.length ? (
          <div class="table-wrap">
            <table>
              <tbody>
                {payPage.map((p) => (
                  <tr>
                    <td>{fmtDate(p.paid_on)}</td>
                    <td>{p.title}</td>
                    <td class="money">
                      <Money v={p.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="credit-card" text="لا توجد تحويلات." />
        )}
        {pays.length > 0 && <Pager info={payInfo} url={c.req.url} />}
      </div>
    </>,
  )
})
