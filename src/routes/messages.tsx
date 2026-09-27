/**
 * الرسائل الداخلية — بديل الواتساب.
 * جهات الاتصال المسموحة: الإدارة ⇔ الجميع، المعلمة ⇔ طلاب دوراتها.
 */
import { Hono } from 'hono'
import { canMessage, requireRole } from '../lib/auth'
import { back, form, go, int, str } from '../lib/http'
import { notFound, page } from '../lib/render'
import { fmtDateTime } from '../lib/time'
import type { AppEnv, Role, SessionUser } from '../lib/types'
import { Avatar, Empty } from '../views/layout'
import { Icon } from '../views/icons'

export const messageRoutes = new Hono<AppEnv>()

interface Contact {
  id: number
  name: string
  role: Role
  unread: number
  avatar_v?: number | null
  last_at: number | null
  last_body: string | null
}

const roleTag = { admin: 'الإدارة', teacher: 'معلمة', student: 'طالب' } as const

async function contactsFor(db: D1Database, user: SessionUser): Promise<Contact[]> {
  let allowed: string
  const binds: unknown[] = [user.id]
  if (user.role === 'admin') allowed = `u.id != ?1 AND u.active = 1`
  else if (user.role === 'teacher')
    allowed = `u.active = 1 AND (u.role = 'admin' OR u.id IN (
      SELECT e.student_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = ?1 AND e.status = 'active'))`
  else
    allowed = `u.active = 1 AND (u.role = 'admin' OR u.id IN (
      SELECT c.teacher_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = ?1 AND e.status = 'active'))`
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.role, u.avatar_v,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.recipient_id = ?1 AND m.read_at IS NULL) AS unread,
        (SELECT MAX(created_at) FROM messages m WHERE (m.sender_id = u.id AND m.recipient_id = ?1) OR (m.sender_id = ?1 AND m.recipient_id = u.id)) AS last_at,
        (SELECT body FROM messages m WHERE (m.sender_id = u.id AND m.recipient_id = ?1) OR (m.sender_id = ?1 AND m.recipient_id = u.id) ORDER BY m.id DESC LIMIT 1) AS last_body
       FROM users u WHERE ${allowed}
       ORDER BY last_at IS NULL, last_at DESC, u.role = 'admin' DESC, u.name
       LIMIT 300`,
    )
    .bind(...binds)
    .all<Contact>()
  // الإدارة: لا نعرض كل الطلاب بلا محادثات في القائمة (قد يكونون مئات) — البحث متاح
  return rows.results
}

messageRoutes.get('/messages', requireRole(), async (c) => {
  const user = c.get('user')!
  const withId = int(c.req.query('with'))
  const q = str(c.req.query('q'), 40)
  let contacts = await contactsFor(c.env.DB, user)
  if (q) contacts = contacts.filter((x) => x.name.includes(q))
  else if (user.role === 'admin') contacts = contacts.filter((x) => x.last_at || x.role !== 'student' || x.id === withId).slice(0, 100)

  let other: Contact | undefined
  let thread: { id: number; sender_id: number; body: string; created_at: number }[] = []
  if (withId) {
    if (!(await canMessage(c.env.DB, user, withId))) return notFound(c)
    other = contacts.find((x) => x.id === withId) ?? (await c.env.DB.prepare('SELECT id, name, role, avatar_v, 0 AS unread FROM users WHERE id = ?').bind(withId).first<Contact>())!
    thread = (
      await c.env.DB.prepare(
        `SELECT * FROM (SELECT id, sender_id, body, created_at FROM messages
         WHERE (sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1) ORDER BY id DESC LIMIT 200) ORDER BY id`,
      )
        .bind(user.id, withId)
        .all<{ id: number; sender_id: number; body: string; created_at: number }>()
    ).results
    await c.env.DB.prepare('UPDATE messages SET read_at = unixepoch() WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').bind(withId, user.id).run()
  }

  return page(
    c,
    'الرسائل',
    <div class={`chat ${other ? 'has-thread' : ''}`}>
      <div class="people">
        <form method="get" action="/messages" class="search" role="search">
          <div class="input-icon">
            <Icon name="search" />
            <input type="search" name="q" value={q} placeholder="ابحث بالاسم…" aria-label="بحث في جهات الاتصال" />
          </div>
        </form>
        {contacts.length === 0 && <p class="muted" style="padding:1rem">لا توجد جهات اتصال.</p>}
        {contacts.map((p) => (
          <a href={`/messages?with=${p.id}`} class={p.id === withId ? 'active' : ''}>
            <Avatar name={p.name} id={p.id} v={p.avatar_v} />
            <div style="flex:1;min-width:0">
              <div class="flex between" style="flex-wrap:nowrap">
                <b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{p.name}</b>
                {!!p.unread && <span class="badge bad">{p.unread}</span>}
              </div>
              <div class="muted" style="font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                {roleTag[p.role]}
                {p.last_body ? ` • ${p.last_body}` : ''}
              </div>
            </div>
          </a>
        ))}
      </div>
      <div class="thread">
        {other ? (
          <>
            <div class="thread-head">
              <a href="/messages" class="icon-btn chat-back" aria-label="رجوع لقائمة المحادثات">
                <Icon name="arrow-right" />
              </a>
              <Avatar name={other.name} id={other.id} v={other.avatar_v} />
              <div>
                <b>{other.name}</b>
                <div class="muted" style="font-size:.78rem">{roleTag[other.role]}</div>
              </div>
            </div>
            <div class="msgs" id="msgs">
              {thread.length === 0 && <p class="muted" style="text-align:center">ابدأ المحادثة</p>}
              {thread.map((m) => (
                <div class={`bubble ${m.sender_id === user.id ? 'me' : 'them'}`}>
                  {m.body}
                  <time>{fmtDateTime(m.created_at)}</time>
                </div>
              ))}
            </div>
            <form method="post" action="/messages" class="compose">
              <input type="hidden" name="to" value={other.id} />
              <textarea name="body" required maxlength={4000} placeholder="اكتب رسالتك…" data-enter-submit="1" aria-label="نص الرسالة"></textarea>
              <button class="btn" aria-label="إرسال">
                <Icon name="send" class="flip" />
              </button>
            </form>
          </>
        ) : (
          <div style="margin:auto">
            <Empty icon="message-circle" text="اختر محادثة من القائمة" />
          </div>
        )}
      </div>
    </div>,
  )
})

messageRoutes.post('/messages', requireRole(), async (c) => {
  const user = c.get('user')!
  const f = await form(c)
  const to = int(f.to)
  const body = str(f.body, 4000)
  if (!body) return back(c, 'bad', 'الرسالة فارغة.')
  if (!(await canMessage(c.env.DB, user, to))) return back(c, 'bad', 'لا يمكنك مراسلة هذا المستخدم.')
  // حد بسيط لمنع الإغراق: 30 رسالة في الدقيقة
  const burst = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND created_at > unixepoch() - 60').bind(user.id).first<{ n: number }>()
  if ((burst?.n ?? 0) >= 30) return back(c, 'bad', 'أرسلت رسائل كثيرة، انتظر قليلاً.')
  await c.env.DB.prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)').bind(user.id, to, body).run()
  return go(c, `/messages?with=${to}`)
})
