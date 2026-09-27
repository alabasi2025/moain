import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, SessionUser } from './types'

export type Flash = { type: 'ok' | 'bad' | 'info' | 'warn'; text: string }

/** رسالة لمرة واحدة تظهر بعد إعادة التوجيه */
export function flash(c: Context<AppEnv>, type: Flash['type'], text: string) {
  setCookie(c, 'flash', encodeURIComponent(JSON.stringify({ type, text })), { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 })
}

export function takeFlash(c: Context<AppEnv>): Flash | null {
  const raw = getCookie(c, 'flash')
  if (!raw) return null
  deleteCookie(c, 'flash', { path: '/' })
  try {
    return JSON.parse(decodeURIComponent(raw)) as Flash
  } catch {
    return null
  }
}

export function back(c: Context<AppEnv>, type: Flash['type'], text: string, fallback = '/') {
  flash(c, type, text)
  const ref = c.req.header('referer')
  let to = fallback
  if (ref) {
    try {
      const u = new URL(ref)
      if (u.origin === new URL(c.req.url).origin) to = u.pathname + u.search
    } catch {}
  }
  return c.redirect(to, 303)
}

export function go(c: Context<AppEnv>, to: string, type?: Flash['type'], text?: string) {
  if (type && text) flash(c, type, text)
  return c.redirect(to, 303)
}

export const int = (v: unknown, def = 0) => {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : def
}

export const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)

export async function form(c: Context<AppEnv>): Promise<Record<string, string | File>> {
  const body = await c.req.parseBody()
  const out: Record<string, string | File> = {}
  for (const [k, v] of Object.entries(body)) out[k] = Array.isArray(v) ? (v[0] as string | File) : (v as string | File)
  return out
}

export async function unreadCount(db: D1Database, user: SessionUser): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL').bind(user.id).first<{ n: number }>()
  return r?.n ?? 0
}

export const isDemo = (c: Context<AppEnv>) => (c.env as unknown as { DEMO_MODE?: string }).DEMO_MODE === '1'
