/**
 * النظام المالي (الإدارة):
 *  - لوحة المالية + ربح/خسارة كل الدورات
 *  - الأقساط والمتابعة (متأخرات / مستحقة قريباً) + تذكير داخلي
 *  - صفحة تسجيل الطالب: جدول الأقساط + تسجيل التحويلات
 *  - تقرير ربح وخسارة دورة (قابل للطباعة)
 *  - مستحقات المعلمات والجهات وصرفها
 *  - المصروفات
 *  - تصدير CSV
 */
import { Hono } from 'hono'
import { requireRole } from '../lib/auth'
import { courseFinances, financeSummary, installmentStates, monthlyCollections } from '../lib/finance'
import { back, form, int, str } from '../lib/http'
import { formatPercent, formatSAR, parseSAR } from '../lib/money'
import { notFound, page } from '../lib/render'
import { fmtDate, isDate, todayRiyadh } from '../lib/time'
import type { AppEnv } from '../lib/types'
import { Empty, Money, PageHead, Pager, Person, Stat, Toolbar } from '../views/layout'
import { paginate } from '../lib/paging'
import { Icon } from '../views/icons'

export const financeRoutes = new Hono<AppEnv>()
financeRoutes.use('/admin/finance/*', requireRole('admin'))
financeRoutes.use('/admin/finance', requireRole('admin'))
financeRoutes.use('/admin/enrollments/*', requireRole('admin'))
financeRoutes.use('/admin/installments/*', requireRole('admin'))
financeRoutes.use('/admin/payments/*', requireRole('admin'))

const methods = { transfer: 'تحويل بنكي', cash: 'نقداً', card: 'شبكة/بطاقة', other: 'أخرى' } as const
const stateBadge = {
  paid: ['مدفوع', 'ok'],
  partial: ['مدفوع جزئياً', 'warn'],
  overdue: ['متأخر', 'bad'],
  due_soon: ['يستحق قريباً', 'warn'],
  upcoming: ['قادم', 'gray'],
} as const

function period(q: (k: string) => string | undefined) {
  const today = todayRiyadh()
  const from = isDate(q('from')) ? q('from')! : today.slice(0, 8) + '01'
  const to = isDate(q('to')) ? q('to')! : today
  return { from, to }
}

// ============ لوحة المالية ============
financeRoutes.get('/admin/finance', async (c) => {
  const { from, to } = period((k) => c.req.query(k))
  const [sum, fins, insts, monthly] = await Promise.all([financeSummary(c.env.DB, from, to), courseFinances(c.env.DB), installmentStates(c.env.DB), monthlyCollections(c.env.DB, 6)])
  const overdue = insts.filter((i) => i.state === 'overdue')
  const totals = fins.reduce(
    (a, f) => ({
      collected: a.collected + f.collected,
      outstanding: a.outstanding + f.outstanding,
      teacher: a.teacher + f.teacher_balance,
      partner: a.partner + f.partner_balance,
      net: a.net + f.net,
    }),
    { collected: 0, outstanding: 0, teacher: 0, partner: 0, net: 0 },
  )
  const maxM = Math.max(1, ...monthly.map((m) => m.v))
  // جدول الربح والخسارة: بحث + ترتيب (الأكثر ربحاً أولاً، الخاسر مميز) + ترقيم 10 صفوف؛ الإجمالي دائماً للكل
  const cq = str(c.req.query('cq'), 40)
  const sorted = [...fins].filter((f) => !cq || f.title.includes(cq) || (f.teacher_name ?? '').includes(cq)).sort((a, b) => b.net - a.net)
  const { items: finPage, info: finInfo } = paginate(sorted, c.req.url, 10)
  return page(
    c,
    'لوحة المالية',
    <>
      <PageHead title="لوحة المالية" sub="كل الأرقام محسوبة تلقائياً من التحويلات والمصروفات والمستحقات">
        <a class="btn btn-ghost" href={`/admin/finance/export/payments.csv?from=${from}&to=${to}`}>
          <Icon name="download" /> تصدير التحويلات CSV
        </a>
      </PageHead>
      <form class="card flex" method="get" style="padding:.8rem 1rem">
        <b>الفترة:</b>
        <input type="date" name="from" value={from} style="width:auto" aria-label="من تاريخ" />
        <span>إلى</span>
        <input type="date" name="to" value={to} style="width:auto" aria-label="إلى تاريخ" />
        <button class="btn btn-soft btn-sm">عرض</button>
      </form>
      <div class="stats">
        <Stat label="المحصّل في الفترة" value={<Money v={sum.collected} />} sub={`${sum.count} تحويل`} tone="ok" />
        <Stat label="المصروفات" value={<Money v={sum.expenses} />} tone="bad" />
        <Stat label="المستحقات المصروفة" value={<Money v={sum.payouts} />} sub="معلمات + جهات" />
        <Stat label="صافي النقد في الفترة" value={<Money v={sum.cashNet} color />} tone="teal" />
      </div>
      <div class="stats">
        <Stat label="متبقي على الطلاب (كل الدورات)" value={<Money v={totals.outstanding} />} tone="warn" />
        <Stat label="أقساط متأخرة" value={<Money v={overdue.reduce((s, i) => s + i.remaining, 0)} />} sub={`${overdue.length} قسط`} tone="bad" />
        <Stat label="مستحقات معلمات غير مصروفة" value={<Money v={totals.teacher} />} />
        <Stat label="مستحقات جهات غير مصروفة" value={<Money v={totals.partner} />} />
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>التحصيل الشهري</h2>
          {monthly.length ? (
            <div style="display:flex;align-items:flex-end;gap:.6rem;height:180px;padding-top:1rem">
              {monthly.map((m) => (
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.3rem;height:100%;justify-content:flex-end">
                  <small class="num">{formatSAR(m.v, false)}</small>
                  <div style={`width:100%;max-width:48px;height:${Math.max(4, (m.v / maxM) * 130)}px;background:linear-gradient(180deg,#7b61ff,#5b3df5);border-radius:8px 8px 0 0`}></div>
                  <small class="muted num">{m.ym}</small>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="trending-up" text="لا توجد تحويلات بعد." />
          )}
        </div>
        <div class="card">
          <div class="card-head">
            <h2>أعلى المتأخرات</h2>
            <a href="/admin/finance/installments?filter=overdue">الكل</a>
          </div>
          {overdue.length ? (
            <div class="list">
              {overdue
                .sort((a, b) => b.remaining - a.remaining)
                .slice(0, 5)
                .map((i) => (
                  <a class="item" href={`/admin/enrollments/${i.enrollment_id}`} style="color:inherit">
                    <div class="grow">
                      <div class="title">{i.student_name}</div>
                      <div class="meta">
                        {i.course_title} • استحق {fmtDate(i.due_date)}
                      </div>
                    </div>
                    <b class="neg">
                      <Money v={i.remaining} />
                    </b>
                  </a>
                ))}
            </div>
          ) : (
            <Empty icon="circle-check" text="لا توجد متأخرات." />
          )}
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <h2>الربح والخسارة لكل دورة</h2>
          <a class="btn btn-ghost btn-sm" href="/admin/finance/export/courses.csv">
            <Icon name="download" /> CSV
          </a>
        </div>
        <form method="get" class="toolbar" role="search" style="box-shadow:none">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <div class="input-icon grow">
            <Icon name="search" />
            <input type="search" name="cq" value={cq} placeholder="بحث بالدورة أو المعلمة" aria-label="بحث في الدورات" />
          </div>
          <button class="btn btn-soft">
            <Icon name="filter" /> تطبيق
          </button>
        </form>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الدورة</th>
                <th>الطلاب</th>
                <th class="money">المحصّل</th>
                <th class="money">مستحق المعلمة</th>
                <th class="money">مستحق الجهات</th>
                <th class="money">المصروفات</th>
                <th class="money">صافي الربح</th>
                <th>الهامش</th>
              </tr>
            </thead>
            <tbody>
              {finPage.map((f) => (
                <tr>
                  <td>
                    <a href={`/admin/finance/course/${f.id}`}>
                      <b>{f.title}</b>
                    </a>
                    <div class="muted" style="font-size:.78rem">
                      {f.teacher_name ?? '—'}
                    </div>
                  </td>
                  <td>{f.students}</td>
                  <td class="money">
                    <Money v={f.collected} />
                  </td>
                  <td class="money">
                    <Money v={f.teacher_due} />
                  </td>
                  <td class="money">
                    <Money v={f.partner_due} />
                  </td>
                  <td class="money">
                    <Money v={f.expenses} />
                  </td>
                  <td class="money">
                    <b>
                      <Money v={f.net} color />
                    </b>
                  </td>
                  <td>
                    <span class={`badge ${f.net < 0 ? 'bad' : f.margin_bps < 2000 ? 'warn' : 'ok'}`}>{formatPercent(f.margin_bps)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colspan={2}>الإجمالي</td>
                <td class="money">
                  <Money v={totals.collected} />
                </td>
                <td class="money">
                  <Money v={fins.reduce((s, f) => s + f.teacher_due, 0)} />
                </td>
                <td class="money">
                  <Money v={fins.reduce((s, f) => s + f.partner_due, 0)} />
                </td>
                <td class="money">
                  <Money v={fins.reduce((s, f) => s + f.expenses, 0)} />
                </td>
                <td class="money">
                  <Money v={totals.net} color />
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Pager info={finInfo} url={c.req.url} />
      </div>
    </>,
  )
})

// ============ الأقساط والمتابعة ============
financeRoutes.get('/admin/finance/installments', async (c) => {
  const filter = c.req.query('filter') ?? 'attention'
  const all = await installmentStates(c.env.DB)
  const list =
    filter === 'overdue'
      ? all.filter((i) => i.state === 'overdue')
      : filter === 'soon'
        ? all.filter((i) => i.state === 'due_soon' || i.state === 'partial')
        : filter === 'all'
          ? all
          : all.filter((i) => ['overdue', 'due_soon', 'partial'].includes(i.state))
  const q = str(c.req.query('q'), 40)
  const filtered = q ? list.filter((i) => i.student_name.includes(q) || i.student_phone.includes(q) || i.course_title.includes(q)) : list
  const { items, info } = paginate(filtered, c.req.url)
  const sumOf = (s: string[]) => all.filter((i) => s.includes(i.state)).reduce((a, i) => a + i.remaining, 0)
  return page(
    c,
    'الأقساط والمتابعة',
    <>
      <PageHead title="الأقساط والمتابعة" sub="مين حوّل، ومين متأخر، ومين يستحق عليه قسط قريب" />
      <div class="stats">
        <Stat label="متأخر" value={<Money v={sumOf(['overdue'])} />} sub={`${all.filter((i) => i.state === 'overdue').length} قسط`} tone="bad" />
        <Stat label="يستحق خلال 7 أيام" value={<Money v={sumOf(['due_soon', 'partial'])} />} tone="warn" />
        <Stat label="قادم لاحقاً" value={<Money v={sumOf(['upcoming'])} />} />
        <Stat label="مدفوع" value={<Money v={all.filter((i) => i.state === 'paid').reduce((a, i) => a + i.amount, 0)} />} tone="ok" />
      </div>
      <div class="tabs">
        {[
          ['attention', 'يحتاج متابعة'],
          ['overdue', 'المتأخر'],
          ['soon', 'قريب الاستحقاق'],
          ['all', 'الكل'],
        ].map(([k, l]) => (
          <a href={`?filter=${k}`} class={filter === k ? 'active' : ''}>
            {l}
          </a>
        ))}
      </div>
      <Toolbar q={q} placeholder="بحث بالطالب أو الجوال أو الدورة" hidden={{ filter }} />
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الطالب</th>
              <th>الدورة</th>
              <th>تاريخ الاستحقاق</th>
              <th class="money">القسط</th>
              <th class="money">المتبقي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr>
                <td>
                  <Person id={i.student_id} name={i.student_name} v={i.student_avatar_v} href={`/admin/users/${i.student_id}`} sub={<span class="num">{i.student_phone}</span>} />
                </td>
                <td>{i.course_title}</td>
                <td>{fmtDate(i.due_date)}</td>
                <td class="money">
                  <Money v={i.amount} />
                </td>
                <td class="money">
                  <Money v={i.remaining} />
                </td>
                <td>
                  <span class={`badge ${stateBadge[i.state][1]}`}>{stateBadge[i.state][0]}</span>
                </td>
                <td>
                  <div class="flex" style="flex-wrap:nowrap">
                    <a class="btn btn-soft btn-sm" href={`/admin/enrollments/${i.enrollment_id}`}>
                      تسجيل دفعة
                    </a>
                    {i.state !== 'paid' && (
                      <form method="post" action={`/admin/installments/${i.id}/remind`}>
                        <button class="btn btn-ghost btn-sm" title="إرسال تذكير داخل المنصة" aria-label="إرسال تذكير">
                          <Icon name="bell-ring" />
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colspan={7}>
                  <Empty icon="circle-check" text={q ? 'لا توجد نتائج مطابقة.' : 'لا شيء هنا.'} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager info={info} url={c.req.url} />
    </>,
  )
})

financeRoutes.post('/admin/installments/:id/remind', async (c) => {
  const id = int(c.req.param('id'))
  const [i] = (await installmentStates(c.env.DB)).filter((x) => x.id === id)
  if (!i) return notFound(c)
  const body = `السلام عليكم ${i.student_name} 🌹\nتذكير بقسط دورة «${i.course_title}» بمبلغ ${formatSAR(i.remaining)} ${
    i.state === 'overdue' ? `المستحق بتاريخ ${fmtDate(i.due_date)}` : `يستحق بتاريخ ${fmtDate(i.due_date)}`
  }.\nبعد التحويل أرسل لنا صورة الإيصال هنا. شاكرين لك 🙏`
  await c.env.DB.prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)').bind(c.get('user')!.id, i.student_id, body).run()
  return back(c, 'ok', `تم إرسال التذكير إلى ${i.student_name} داخل المنصة.`)
})

// ============ صفحة تسجيل الطالب (الأقساط والدفعات) ============
financeRoutes.get('/admin/enrollments/:id', async (c) => {
  const id = int(c.req.param('id'))
  const e = await c.env.DB.prepare(
    `SELECT e.*, u.name AS student_name, u.phone, c.title AS course_title, p.name AS partner_name, p.commission_bps
     FROM enrollments e JOIN users u ON u.id = e.student_id JOIN courses c ON c.id = e.course_id LEFT JOIN partners p ON p.id = e.partner_id WHERE e.id = ?`,
  )
    .bind(id)
    .first<{ id: number; course_id: number; student_id: number; agreed_price: number; status: string; student_name: string; phone: string; course_title: string; partner_name: string | null; commission_bps: number | null }>()
  if (!e) return notFound(c)
  const insts = await installmentStates(c.env.DB, { enrollmentId: id })
  const pays = (
    await c.env.DB.prepare('SELECT * FROM payments WHERE enrollment_id = ? ORDER BY paid_on DESC, id DESC')
      .bind(id)
      .all<{ id: number; amount: number; paid_on: string; method: keyof typeof methods; reference: string | null; note: string | null }>()
  ).results
  const paid = pays.reduce((s, p) => s + p.amount, 0)
  const scheduled = insts.reduce((s, i) => s + i.amount, 0)
  const nextDue = insts.find((i) => i.state !== 'paid')
  return page(
    c,
    `${e.student_name} — ${e.course_title}`,
    <>
      <PageHead title={e.student_name} sub={`${e.course_title}${e.partner_name ? ` • ${e.partner_name}` : ''} • ${e.phone}`}>
        <a class="btn btn-ghost" href={`/admin/courses/${e.course_id}`}>
          الدورة
        </a>
        <a class="btn btn-soft" href={`/messages?with=${e.student_id}`}>
          <Icon name="message-circle" /> مراسلة
        </a>
      </PageHead>
      <div class="stats">
        <Stat label="السعر المتفق" value={<Money v={e.agreed_price} />} />
        <Stat label="المدفوع" value={<Money v={paid} />} tone="ok" />
        <Stat label="المتبقي" value={<Money v={Math.max(0, e.agreed_price - paid)} />} tone={e.agreed_price - paid > 0 ? 'warn' : 'ok'} />
        <Stat label="القسط القادم" value={nextDue ? <Money v={nextDue.remaining} /> : '—'} sub={nextDue ? fmtDate(nextDue.due_date) : 'مكتمل'} tone="teal" />
      </div>
      {scheduled !== e.agreed_price && (
        <div class="alert warn">
          <Icon name="triangle-alert" /> مجموع الأقساط ({formatSAR(scheduled)}) لا يساوي السعر المتفق ({formatSAR(e.agreed_price)}). عدّل الأقساط أو السعر.
        </div>
      )}
      <div class="grid grid-2">
        <div class="card">
          <h2><Icon name="credit-card" /> تسجيل تحويل / دفعة</h2>
          <form method="post" action={`/admin/enrollments/${id}/payments`}>
            <div class="form-grid">
              <div class="field">
                <label>المبلغ (ريال)</label>
                <input name="amount" dir="ltr" inputmode="decimal" required value={nextDue ? String(nextDue.remaining / 100) : ''} />
              </div>
              <div class="field">
                <label>تاريخ التحويل</label>
                <input type="date" name="paid_on" value={todayRiyadh()} required />
              </div>
              <div class="field">
                <label>الطريقة</label>
                <select name="method">
                  {Object.entries(methods).map(([k, v]) => (
                    <option value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label>رقم الحوالة / المرجع</label>
                <input name="reference" dir="ltr" maxlength={60} />
              </div>
            </div>
            <div class="field">
              <label>ملاحظة</label>
              <input name="note" maxlength={300} />
            </div>
            <button class="btn btn-ok">تسجيل الدفعة</button>
          </form>
        </div>
        <div class="card">
          <h2><Icon name="calendar-days" /> جدول الأقساط</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الاستحقاق</th>
                  <th class="money">القسط</th>
                  <th class="money">المتبقي</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {insts.map((i) => (
                  <tr>
                    <td>{fmtDate(i.due_date)}</td>
                    <td class="money">
                      <Money v={i.amount} />
                    </td>
                    <td class="money">
                      <Money v={i.remaining} />
                    </td>
                    <td>
                      <span class={`badge ${stateBadge[i.state][1]}`}>{stateBadge[i.state][0]}</span>
                    </td>
                    <td>
                      <form method="post" action={`/admin/installments/${i.id}/delete`} data-confirm="حذف هذا القسط من الجدول؟">
                        <button class="btn btn-ghost btn-sm" title="حذف">
                          <Icon name="x" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!insts.length && (
                  <tr>
                    <td colspan={5} class="muted">
                      لا يوجد جدول أقساط.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form method="post" action={`/admin/enrollments/${id}/installments`} class="flex mt">
            <input name="amount" dir="ltr" inputmode="decimal" placeholder="المبلغ" required style="width:120px" />
            <input type="date" name="due_date" required style="width:auto" aria-label="تاريخ الاستحقاق" />
            <button class="btn btn-soft btn-sm">+ إضافة قسط</button>
          </form>
        </div>
      </div>
      <div class="card">
        <h2>سجل التحويلات</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th class="money">المبلغ</th>
                <th>الطريقة</th>
                <th>المرجع</th>
                <th>ملاحظة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr>
                  <td>{fmtDate(p.paid_on)}</td>
                  <td class="money">
                    <b>
                      <Money v={p.amount} />
                    </b>
                  </td>
                  <td>{methods[p.method]}</td>
                  <td class="num">{p.reference ?? '—'}</td>
                  <td>{p.note ?? ''}</td>
                  <td>
                    <form method="post" action={`/admin/payments/${p.id}/delete`} data-confirm="حذف هذه الدفعة؟ سيُعاد حساب الأقساط.">
                      <button class="btn btn-ghost btn-sm" aria-label="حذف" title="حذف"><Icon name="trash-2" /></button>
                    </form>
                  </td>
                </tr>
              ))}
              {!pays.length && (
                <tr>
                  <td colspan={6}>
                    <Empty icon="credit-card" text="لا توجد تحويلات مسجلة." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <details class="drop">
        <summary>تعديل السعر المتفق / الانسحاب</summary>
        <div>
          <form method="post" action={`/admin/enrollments/${id}`} class="flex">
            <input name="agreed_price" dir="ltr" inputmode="decimal" value={String(e.agreed_price / 100)} style="width:140px" aria-label="السعر المتفق (ريال)" />
            <label class="flex" style="margin:0;font-weight:500">
              <input type="checkbox" name="withdrawn" value="1" checked={e.status !== 'active'} /> منسحب من الدورة
            </label>
            <button class="btn btn-ghost btn-sm">حفظ</button>
          </form>
        </div>
      </details>
    </>,
  )
})

financeRoutes.post('/admin/enrollments/:id/payments', async (c) => {
  const id = int(c.req.param('id'))
  const f = await form(c)
  const amount = parseSAR(f.amount)
  if (!amount) return back(c, 'bad', 'أدخل مبلغاً صحيحاً.')
  if (!isDate(f.paid_on)) return back(c, 'bad', 'تاريخ غير صالح.')
  const method = String(f.method) in methods ? String(f.method) : 'transfer'
  const exists = await c.env.DB.prepare('SELECT 1 FROM enrollments WHERE id = ?').bind(id).first()
  if (!exists) return notFound(c)
  // منع التكرار العرضي: نفس المبلغ ونفس المرجع خلال دقيقتين
  const ref = str(f.reference, 60) || null
  const dup = await c.env.DB.prepare('SELECT 1 FROM payments WHERE enrollment_id = ? AND amount = ? AND COALESCE(reference, "") = COALESCE(?, "") AND created_at > unixepoch() - 120')
    .bind(id, amount, ref)
    .first()
  if (dup) return back(c, 'warn', 'يبدو أن هذه الدفعة سُجّلت للتو، لم تُكرر.')
  await c.env.DB.prepare('INSERT INTO payments (enrollment_id, amount, paid_on, method, reference, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, amount, f.paid_on, method, ref, str(f.note, 300) || null, c.get('user')!.id)
    .run()
  return back(c, 'ok', `تم تسجيل دفعة ${formatSAR(amount)}`)
})

financeRoutes.post('/admin/enrollments/:id/installments', async (c) => {
  const f = await form(c)
  const amount = parseSAR(f.amount)
  if (!amount || !isDate(f.due_date)) return back(c, 'bad', 'أدخل المبلغ والتاريخ.')
  await c.env.DB.prepare('INSERT INTO installments (enrollment_id, amount, due_date) VALUES (?, ?, ?)').bind(int(c.req.param('id')), amount, f.due_date).run()
  return back(c, 'ok', 'تمت إضافة القسط.')
})

financeRoutes.post('/admin/enrollments/:id', async (c) => {
  const f = await form(c)
  const price = parseSAR(f.agreed_price)
  if (price === null) return back(c, 'bad', 'سعر غير صالح.')
  await c.env.DB.prepare('UPDATE enrollments SET agreed_price = ?, status = ? WHERE id = ?').bind(price, f.withdrawn === '1' ? 'withdrawn' : 'active', int(c.req.param('id'))).run()
  return back(c, 'ok', 'تم الحفظ.')
})

financeRoutes.post('/admin/installments/:id/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM installments WHERE id = ?').bind(int(c.req.param('id'))).run()
  return back(c, 'ok', 'تم حذف القسط.')
})

financeRoutes.post('/admin/payments/:id/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(int(c.req.param('id'))).run()
  return back(c, 'ok', 'تم حذف الدفعة.')
})

// ============ تقرير ربح وخسارة دورة ============
financeRoutes.get('/admin/finance/course/:id', async (c) => {
  const id = int(c.req.param('id'))
  const [f] = await courseFinances(c.env.DB, { courseId: id })
  if (!f) return notFound(c)
  const co = await c.env.DB.prepare('SELECT teacher_share_type, teacher_share_value, price FROM courses WHERE id = ?').bind(id).first<{ teacher_share_type: string; teacher_share_value: number; price: number }>()
  const [byPartner, expenses, payouts] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT p.id, p.name, p.commission_bps, COUNT(e.id) AS students,
         COALESCE(SUM((SELECT SUM(amount) FROM payments y WHERE y.enrollment_id = e.id)), 0) AS collected
       FROM enrollments e JOIN partners p ON p.id = e.partner_id WHERE e.course_id = ? GROUP BY p.id`,
    ).bind(id),
    c.env.DB.prepare('SELECT category, amount, spent_on, note FROM expenses WHERE course_id = ? ORDER BY spent_on DESC').bind(id),
    c.env.DB.prepare(
      `SELECT o.payee_type, o.amount, o.paid_on, o.note, CASE o.payee_type WHEN 'teacher' THEN u.name ELSE p.name END AS payee
       FROM payouts o LEFT JOIN users u ON o.payee_type='teacher' AND u.id = o.payee_id LEFT JOIN partners p ON o.payee_type='partner' AND p.id = o.payee_id
       WHERE o.course_id = ? ORDER BY o.paid_on DESC`,
    ).bind(id),
  ])
  const shareText =
    co?.teacher_share_type === 'percent'
      ? `${formatPercent(co.teacher_share_value)} من المحصّل`
      : co?.teacher_share_type === 'per_student'
        ? `${formatSAR(co.teacher_share_value)} × ${f.students} طالب`
        : `مبلغ ثابت ${formatSAR(co?.teacher_share_value ?? 0)}`
  type Row = [string, number, string?]
  const rows: Row[] = [
    ['إجمالي المحصّل من الطلاب', f.collected],
    [`(−) مستحق المعلمة — ${shareText}`, -f.teacher_due],
    ['(−) مستحق الجهات', -f.partner_due],
    ['(−) مصروفات الدورة', -f.expenses],
  ]
  return page(
    c,
    `تقرير: ${f.title}`,
    <>
      <PageHead title={`تقرير الربح والخسارة`} sub={`${f.title} • ${f.teacher_name ?? '—'} • ${f.students} طالب • حتى ${fmtDate(todayRiyadh())}`}>
        <button class="btn btn-ghost no-print" onclick="print()">
          <Icon name="printer" /> طباعة / PDF
        </button>
        <a class="btn btn-soft no-print" href={`/admin/courses/${id}`}>
          الدورة
        </a>
      </PageHead>
      <div class="grid grid-2">
        <div class="card">
          <h2>قائمة الدخل</h2>
          <table>
            <tbody>
              {rows.map(([l, v]) => (
                <tr>
                  <td>{l}</td>
                  <td class="money">
                    <Money v={v} color={v < 0} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{f.net >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</td>
                <td class="money" style="font-size:1.15rem">
                  <Money v={f.net} color />
                </td>
              </tr>
              <tr>
                <td>هامش الربح</td>
                <td class="money">{formatPercent(f.margin_bps)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="card">
          <h2>التحصيل والمستحقات</h2>
          <dl class="kv">
            <dt>المتفق عليه (الطلاب النشطين)</dt>
            <dd>
              <Money v={f.expected} />
            </dd>
            <dt>المحصّل</dt>
            <dd>
              <Money v={f.collected} />
            </dd>
            <dt>المتبقي على الطلاب</dt>
            <dd class="neg">
              <Money v={f.outstanding} />
            </dd>
            <dt>نسبة التحصيل</dt>
            <dd>{f.expected ? formatPercent(Math.round((f.collected * 10000) / f.expected)) : '—'}</dd>
          </dl>
          <hr />
          <dl class="kv">
            <dt>مستحق المعلمة / المصروف لها</dt>
            <dd>
              <Money v={f.teacher_due} /> / <Money v={f.teacher_paid} />
            </dd>
            <dt>المتبقي للمعلمة</dt>
            <dd>
              <Money v={f.teacher_balance} color />
            </dd>
            <dt>مستحق الجهات / المصروف لها</dt>
            <dd>
              <Money v={f.partner_due} /> / <Money v={f.partner_paid} />
            </dd>
            <dt>المتبقي للجهات</dt>
            <dd>
              <Money v={f.partner_balance} color />
            </dd>
          </dl>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h3>الجهات في هذه الدورة</h3>
          {(byPartner.results as { name: string; commission_bps: number; students: number; collected: number }[]).length ? (
            <table>
              <thead>
                <tr>
                  <th>الجهة</th>
                  <th>الطلاب</th>
                  <th class="money">محصّل منهم</th>
                  <th class="money">العمولة</th>
                </tr>
              </thead>
              <tbody>
                {(byPartner.results as { name: string; commission_bps: number; students: number; collected: number }[]).map((p) => (
                  <tr>
                    <td>
                      {p.name} <small class="muted">({formatPercent(p.commission_bps)})</small>
                    </td>
                    <td>{p.students}</td>
                    <td class="money">
                      <Money v={p.collected} />
                    </td>
                    <td class="money">
                      <Money v={Math.round((p.collected * p.commission_bps) / 10000)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p class="muted">لا توجد جهات.</p>
          )}
        </div>
        <div class="card">
          <h3>المصروفات والصرف</h3>
          <table>
            <tbody>
              {(expenses.results as { category: string; amount: number; spent_on: string; note: string | null }[]).map((x) => (
                <tr>
                  <td><Icon name="receipt" /> {x.category}</td>
                  <td>{fmtDate(x.spent_on)}</td>
                  <td class="money">
                    <Money v={-x.amount} color />
                  </td>
                </tr>
              ))}
              {(payouts.results as { payee_type: string; payee: string; amount: number; paid_on: string }[]).map((x) => (
                <tr>
                  <td>
                    <Icon name={x.payee_type === 'teacher' ? 'presentation' : 'building-2'} /> صرف لـ {x.payee}
                  </td>
                  <td>{fmtDate(x.paid_on)}</td>
                  <td class="money">
                    <Money v={-x.amount} color />
                  </td>
                </tr>
              ))}
              {!expenses.results.length && !payouts.results.length && (
                <tr>
                  <td class="muted">لا توجد حركات.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>,
  )
})

// ============ المستحقات ============
financeRoutes.get('/admin/finance/payouts', async (c) => {
  const fins = await courseFinances(c.env.DB)
  const partnerDue = (
    await c.env.DB.prepare(
      `SELECT e.course_id, p.id AS partner_id, p.name, p.commission_bps,
         COALESCE(SUM((SELECT SUM(amount) FROM payments y WHERE y.enrollment_id = e.id)), 0) AS collected,
         (SELECT COALESCE(SUM(amount),0) FROM payouts o WHERE o.payee_type='partner' AND o.payee_id = p.id AND o.course_id = e.course_id) AS paid
       FROM enrollments e JOIN partners p ON p.id = e.partner_id GROUP BY e.course_id, p.id`,
    ).all<{ course_id: number; partner_id: number; name: string; commission_bps: number; collected: number; paid: number }>()
  ).results
  const title = new Map(fins.map((f) => [f.id, f.title]))
  const teacherRows = fins.filter((f) => f.teacher_id && (f.teacher_due > 0 || f.teacher_paid > 0))
  const partnerRows = partnerDue.map((p) => ({ ...p, due: Math.round((p.collected * p.commission_bps) / 10000) })).filter((p) => p.due > 0 || p.paid > 0)
  const recent = (
    await c.env.DB.prepare(
      `SELECT o.*, c.title AS course_title, CASE o.payee_type WHEN 'teacher' THEN u.name ELSE p.name END AS payee
       FROM payouts o JOIN courses c ON c.id = o.course_id LEFT JOIN users u ON o.payee_type='teacher' AND u.id=o.payee_id LEFT JOIN partners p ON o.payee_type='partner' AND p.id=o.payee_id
       ORDER BY o.paid_on DESC, o.id DESC LIMIT 1000`,
    ).all<{ id: number; payee_type: string; payee: string; course_title: string; amount: number; paid_on: string; note: string | null }>()
  ).results
  const { items: recentPage, info: recentInfo } = paginate(recent, c.req.url, 10)
  const PayForm = ({ type, payee, course, balance }: { type: string; payee: number; course: number; balance: number }) => (
    <form method="post" action="/admin/finance/payouts" class="flex" style="flex-wrap:nowrap">
      <input type="hidden" name="payee_type" value={type} />
      <input type="hidden" name="payee_id" value={payee} />
      <input type="hidden" name="course_id" value={course} />
      <input name="amount" dir="ltr" inputmode="decimal" value={balance > 0 ? String(balance / 100) : ''} style="width:100px;min-height:34px" required aria-label="مبلغ الصرف (ريال)" />
      <button class="btn btn-ok btn-sm">صرف</button>
    </form>
  )
  return page(
    c,
    'المستحقات',
    <>
      <PageHead title="مستحقات المعلمات والجهات" sub="المستحق يُحسب تلقائياً من المحصّل فعلياً حسب اتفاق كل دورة" />
      <div class="card">
        <h2><Icon name="presentation" /> المعلمات</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المعلمة</th>
                <th>الدورة</th>
                <th class="money">المستحق</th>
                <th class="money">المصروف</th>
                <th class="money">المتبقي</th>
                <th>صرف دفعة</th>
              </tr>
            </thead>
            <tbody>
              {teacherRows.map((f) => (
                <tr>
                  <td>
                    <b>{f.teacher_name}</b>
                  </td>
                  <td>{f.title}</td>
                  <td class="money">
                    <Money v={f.teacher_due} />
                  </td>
                  <td class="money">
                    <Money v={f.teacher_paid} />
                  </td>
                  <td class="money">
                    <b>
                      <Money v={f.teacher_balance} color />
                    </b>
                  </td>
                  <td>
                    <PayForm type="teacher" payee={f.teacher_id!} course={f.id} balance={f.teacher_balance} />
                  </td>
                </tr>
              ))}
              {!teacherRows.length && (
                <tr>
                  <td colspan={6} class="muted">
                    لا توجد مستحقات.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h2><Icon name="building-2" /> الجهات</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الجهة</th>
                <th>الدورة</th>
                <th class="money">المستحق</th>
                <th class="money">المصروف</th>
                <th class="money">المتبقي</th>
                <th>صرف دفعة</th>
              </tr>
            </thead>
            <tbody>
              {partnerRows.map((p) => (
                <tr>
                  <td>
                    <b>{p.name}</b> <small class="muted">({formatPercent(p.commission_bps)})</small>
                  </td>
                  <td>{title.get(p.course_id)}</td>
                  <td class="money">
                    <Money v={p.due} />
                  </td>
                  <td class="money">
                    <Money v={p.paid} />
                  </td>
                  <td class="money">
                    <b>
                      <Money v={p.due - p.paid} color />
                    </b>
                  </td>
                  <td>
                    <PayForm type="partner" payee={p.partner_id} course={p.course_id} balance={p.due - p.paid} />
                  </td>
                </tr>
              ))}
              {!partnerRows.length && (
                <tr>
                  <td colspan={6} class="muted">
                    لا توجد مستحقات.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h2>آخر عمليات الصرف</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المستفيد</th>
                <th>الدورة</th>
                <th class="money">المبلغ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentPage.map((r) => (
                <tr>
                  <td>{fmtDate(r.paid_on)}</td>
                  <td>
                    <Icon name={r.payee_type === 'teacher' ? 'presentation' : 'building-2'} /> {r.payee}
                  </td>
                  <td>{r.course_title}</td>
                  <td class="money">
                    <Money v={r.amount} />
                  </td>
                  <td>
                    <form method="post" action={`/admin/finance/payouts/${r.id}/delete`} data-confirm="حذف عملية الصرف؟">
                      <button class="btn btn-ghost btn-sm" aria-label="حذف" title="حذف"><Icon name="trash-2" /></button>
                    </form>
                  </td>
                </tr>
              ))}
              {!recentPage.length && (
                <tr>
                  <td colspan={5}>
                    <Empty icon="hand-coins" text="لا توجد عمليات صرف بعد." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager info={recentInfo} url={c.req.url} />
      </div>
    </>,
  )
})

financeRoutes.post('/admin/finance/payouts', async (c) => {
  const f = await form(c)
  const amount = parseSAR(f.amount)
  const type = f.payee_type === 'partner' ? 'partner' : 'teacher'
  if (!amount) return back(c, 'bad', 'مبلغ غير صالح.')
  const course = await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(int(f.course_id)).first()
  if (!course) return back(c, 'bad', 'دورة غير صالحة.')
  await c.env.DB.prepare('INSERT INTO payouts (payee_type, payee_id, course_id, amount, paid_on, note) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(type, int(f.payee_id), int(f.course_id), amount, isDate(f.paid_on) ? f.paid_on : todayRiyadh(), str(f.note, 200) || null)
    .run()
  return back(c, 'ok', `تم تسجيل صرف ${formatSAR(amount)}.`)
})

financeRoutes.post('/admin/finance/payouts/:id/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM payouts WHERE id = ?').bind(int(c.req.param('id'))).run()
  return back(c, 'ok', 'تم الحذف.')
})

// ============ المصروفات ============
financeRoutes.get('/admin/finance/expenses', async (c) => {
  const { from, to } = period((k) => c.req.query(k))
  const [rows, courses] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT x.*, c.title AS course_title FROM expenses x LEFT JOIN courses c ON c.id = x.course_id WHERE x.spent_on BETWEEN ? AND ? ORDER BY x.spent_on DESC, x.id DESC`,
    ).bind(from, to),
    c.env.DB.prepare(`SELECT id, title FROM courses WHERE status = 'active' ORDER BY title`),
  ])
  const list = rows.results as { id: number; category: string; amount: number; spent_on: string; note: string | null; course_title: string | null }[]
  const total = list.reduce((s, x) => s + x.amount, 0)
  const { items, info } = paginate(list, c.req.url)
  return page(
    c,
    'المصروفات',
    <>
      <PageHead title="المصروفات" sub={`الإجمالي في الفترة: ${formatSAR(total)}`} />
      <div class="card">
        <form method="post" action="/admin/finance/expenses">
          <div class="form-grid">
            <div class="field">
              <label>البند</label>
              <input name="category" required list="cats" maxlength={60} />
              <datalist id="cats">
                {['اشتراك زوم', 'سيرفر البث', 'إعلانات', 'تصميم', 'مواد تعليمية', 'رسوم بنكية', 'أخرى'].map((x) => (
                  <option value={x} />
                ))}
              </datalist>
            </div>
            <div class="field">
              <label>المبلغ (ريال)</label>
              <input name="amount" dir="ltr" inputmode="decimal" required />
            </div>
            <div class="field">
              <label>التاريخ</label>
              <input type="date" name="spent_on" value={todayRiyadh()} required />
            </div>
            <div class="field">
              <label>على دورة (اختياري)</label>
              <select name="course_id">
                <option value="">مصروف عام</option>
                {(courses.results as { id: number; title: string }[]).map((co) => (
                  <option value={co.id}>{co.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div class="field">
            <label>ملاحظة</label>
            <input name="note" maxlength={200} />
          </div>
          <button class="btn">+ إضافة مصروف</button>
        </form>
      </div>
      <form class="flex" method="get" style="margin-bottom:1rem">
        <input type="date" name="from" value={from} style="width:auto" aria-label="من تاريخ" />
        <span>إلى</span>
        <input type="date" name="to" value={to} style="width:auto" aria-label="إلى تاريخ" />
        <button class="btn btn-soft btn-sm">عرض</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>البند</th>
              <th>الدورة</th>
              <th>ملاحظة</th>
              <th class="money">المبلغ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr>
                <td>{fmtDate(x.spent_on)}</td>
                <td>{x.category}</td>
                <td>{x.course_title ?? <span class="muted">عام</span>}</td>
                <td>{x.note ?? ''}</td>
                <td class="money">
                  <Money v={x.amount} />
                </td>
                <td>
                  <form method="post" action={`/admin/finance/expenses/${x.id}/delete`} data-confirm="حذف المصروف؟">
                    <button class="btn btn-ghost btn-sm" aria-label="حذف" title="حذف"><Icon name="trash-2" /></button>
                  </form>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colspan={6}>
                  <Empty icon="receipt" text="لا توجد مصروفات في هذه الفترة." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager info={info} url={c.req.url} />
    </>,
  )
})

financeRoutes.post('/admin/finance/expenses', async (c) => {
  const f = await form(c)
  const amount = parseSAR(f.amount)
  if (!amount || !str(f.category) || !isDate(f.spent_on)) return back(c, 'bad', 'أكمل البند والمبلغ والتاريخ.')
  await c.env.DB.prepare('INSERT INTO expenses (course_id, category, amount, spent_on, note) VALUES (?, ?, ?, ?, ?)')
    .bind(int(f.course_id) || null, str(f.category, 60), amount, f.spent_on, str(f.note, 200) || null)
    .run()
  return back(c, 'ok', 'تمت إضافة المصروف.')
})

financeRoutes.post('/admin/finance/expenses/:id/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(int(c.req.param('id'))).run()
  return back(c, 'ok', 'تم الحذف.')
})

// ============ تصدير CSV (يفتح في Excel بالعربي) ============
function csv(rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    let s = String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s // حماية من حقن الصيغ في Excel
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}
const riyal = (h: number) => (h / 100).toFixed(2)

financeRoutes.get('/admin/finance/export/payments.csv', async (c) => {
  const { from, to } = period((k) => c.req.query(k))
  const rows = (
    await c.env.DB.prepare(
      `SELECT y.paid_on, u.name, u.phone, c.title, y.amount, y.method, y.reference, y.note
       FROM payments y JOIN enrollments e ON e.id = y.enrollment_id JOIN users u ON u.id = e.student_id JOIN courses c ON c.id = e.course_id
       WHERE y.paid_on BETWEEN ? AND ? ORDER BY y.paid_on`,
    )
      .bind(from, to)
      .all<{ paid_on: string; name: string; phone: string; title: string; amount: number; method: keyof typeof methods; reference: string | null; note: string | null }>()
  ).results
  const body = csv([['التاريخ', 'الطالب', 'الجوال', 'الدورة', 'المبلغ (ريال)', 'الطريقة', 'المرجع', 'ملاحظة'], ...rows.map((r) => [r.paid_on, r.name, r.phone, r.title, riyal(r.amount), methods[r.method], r.reference ?? '', r.note ?? ''])])
  return c.body(body, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="payments-${from}-${to}.csv"` })
})

financeRoutes.get('/admin/finance/export/courses.csv', async (c) => {
  const fins = await courseFinances(c.env.DB)
  const body = csv([
    ['الدورة', 'المعلمة', 'الطلاب', 'المحصّل', 'المتبقي على الطلاب', 'مستحق المعلمة', 'مستحق الجهات', 'المصروفات', 'صافي الربح', 'الهامش %'],
    ...fins.map((f) => [f.title, f.teacher_name ?? '', f.students, riyal(f.collected), riyal(f.outstanding), riyal(f.teacher_due), riyal(f.partner_due), riyal(f.expenses), riyal(f.net), (f.margin_bps / 100).toFixed(1)]),
  ])
  return c.body(body, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="courses-pnl-${todayRiyadh()}.csv"` })
})
