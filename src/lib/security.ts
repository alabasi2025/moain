/**
 * أدوات الأمان: تجزئة كلمات المرور (PBKDF2-SHA256)، التوكنات العشوائية، وتوقيع JWT لسيرفر البث.
 * كلها عبر Web Crypto المتوفر في Cloudflare Workers.
 */
const enc = new TextEncoder()
export const PBKDF2_ITERATIONS = 100_000 // الحد الأقصى المدعوم في Workers

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const x of b) s += x.toString(16).padStart(2, '0')
  return s
}

export function randomHex(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)))
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return toHex(bits)
}

/** مقارنة بزمن ثابت لتفادي هجمات التوقيت */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function verifyPassword(password: string, saltHex: string, expectedHex: string) {
  return safeEqual(await hashPassword(password, saltHex), expectedHex)
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  let bin = ''
  for (const x of bytes) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function signJwtHS256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`)))
  return `${header}.${body}.${b64url(sig)}`
}

/** توكن دخول غرفة Jitsi — المعلمة مشرفة، والطالب مشارك، وصالح لغرفة واحدة فقط ولمدة محدودة */
export async function jitsiToken(opts: {
  appId: string
  secret: string
  domain: string
  room: string
  user: { id: number; name: string; moderator: boolean }
  expiresAt: number
}) {
  const now = Math.floor(Date.now() / 1000)
  return signJwtHS256(
    {
      aud: opts.appId,
      iss: opts.appId,
      sub: opts.domain,
      room: opts.room,
      nbf: now - 60,
      exp: opts.expiresAt,
      moderator: opts.user.moderator,
      context: {
        user: { id: String(opts.user.id), name: opts.user.name, moderator: opts.user.moderator, affiliation: opts.user.moderator ? 'owner' : 'member' },
        features: { recording: false, livestreaming: false },
      },
    },
    opts.secret,
  )
}
