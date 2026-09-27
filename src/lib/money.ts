/** المال بالهللة دائماً (100 هللة = 1 ريال). النسب بنقاط الأساس (10000 = 100%). */

/** يحوّل نص مثل "1,250.50" أو "١٢٥٠" إلى هللات. يرجع null للمدخل غير الصالح. */
export function parseSAR(input: unknown): number | null {
  if (input === null || input === undefined) return null
  let s = String(input).trim()
  if (!s) return null
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.').replace(/[,،\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  const v = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
  return Number.isSafeInteger(v) ? v : null
}

/** نسبة مثل "25" أو "12.5" ⇐ نقاط أساس (2500 / 1250) */
export function parsePercent(input: unknown): number | null {
  const v = parseSAR(input)
  if (v === null || v > 10000) return null
  return v // "25" ⇐ 2500 لأن parseSAR يضرب في 100
}

export function formatSAR(halalas: number, withUnit = true): string {
  const neg = halalas < 0
  const abs = Math.abs(Math.round(halalas))
  const whole = Math.floor(abs / 100).toLocaleString('en-US')
  const frac = abs % 100
  const s = frac ? `${whole}.${String(frac).padStart(2, '0')}` : whole
  return `${neg ? '−' : ''}${s}${withUnit ? ' ر.س' : ''}`
}

export function formatPercent(bps: number): string {
  const v = bps / 100
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`
}

/** حصة من مبلغ بنسبة (تقريب لأقرب هللة) */
export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10000)
}
