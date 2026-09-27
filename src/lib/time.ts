/** توقيت الرياض ثابت UTC+3 بلا توقيت صيفي */
export const RIYADH_OFFSET_SEC = 3 * 3600

export const nowSec = () => Math.floor(Date.now() / 1000)

/** "2026-09-28T16:00" (توقيت الرياض من datetime-local) ⇐ ثواني يونكس */
export function parseLocalDateTime(v: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(v ?? '').trim())
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  const t = Date.UTC(y, mo - 1, d, h, mi) / 1000 - RIYADH_OFFSET_SEC
  return Number.isFinite(t) ? t : null
}

export function toLocalInput(sec: number): string {
  return new Date((sec + RIYADH_OFFSET_SEC) * 1000).toISOString().slice(0, 16)
}

/** تاريخ اليوم بتوقيت الرياض 'YYYY-MM-DD' */
export function todayRiyadh(offsetDays = 0): string {
  return new Date((nowSec() + RIYADH_OFFSET_SEC + offsetDays * 86400) * 1000).toISOString().slice(0, 10)
}

export function isDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
}

// ar-SA يستخدم التقويم الهجري افتراضياً، لذلك نفرض الميلادي والأرقام اللاتينية للوضوح
const LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const fmtDT = new Intl.DateTimeFormat(LOCALE, { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const fmtT = new Intl.DateTimeFormat(LOCALE, { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' })
const fmtD = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

export const fmtDateTime = (sec: number) => fmtDT.format(sec * 1000)
export const fmtTime = (sec: number) => fmtT.format(sec * 1000)
export const fmtDate = (ymd: string) => (isDate(ymd) ? fmtD.format(Date.parse(ymd)) : ymd)

export function fmtRemaining(sec: number): string {
  if (sec <= 0) return 'انتهى'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h >= 1) return `${h} ساعة${m ? ` و${m} دقيقة` : ''}`
  return `${Math.max(m, 1)} دقيقة`
}

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}س ${m % 60 ? `${m % 60}د` : ''}`.trim() : `${m} دقيقة`
}
