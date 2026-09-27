/**
 * ترقيم الصفحات (Pagination) — موحّد لكل القوائم الطويلة.
 * لماذا ترقيم وليس تمرير لا نهائي؟
 *  - لوحات الإدارة مهام بحث ومقارنة (NN/g): المستخدم يحتاج موضعاً ثابتاً يرجع له، ورابطاً يشاركه، وزر رجوع يعيده لنفس المكان.
 *  - الخادم لا يرسل مئات الصفوف دفعة واحدة (أداء أفضل على الجوال).
 * الحجم الافتراضي 20 صفاً — يملأ شاشة لابتوب تقريباً ويبقى قابلاً للمسح بالعين.
 */
export const PAGE_SIZE = 20

export interface PageInfo {
  page: number
  size: number
  offset: number
  total: number
  pages: number
  from: number
  to: number
}

/** يقرأ ?page= من الرابط بأمان (أرقام موجبة فقط) */
export function readPage(url: string, size = PAGE_SIZE): { page: number; size: number; offset: number } {
  const raw = Number.parseInt(new URL(url).searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100000) : 1
  return { page, size, offset: (page - 1) * size }
}

export function pageInfo(p: { page: number; size: number }, total: number): PageInfo {
  const pages = Math.max(1, Math.ceil(total / p.size))
  const page = Math.min(p.page, pages)
  const offset = (page - 1) * p.size
  return { page, size: p.size, offset, total, pages, from: total ? offset + 1 : 0, to: Math.min(total, offset + p.size) }
}

/** ترقيم مصفوفة في الذاكرة (للقوائم المحسوبة مثل حالات الأقساط) */
export function paginate<T>(items: T[], url: string, size = PAGE_SIZE): { items: T[]; info: PageInfo } {
  const info = pageInfo(readPage(url, size), items.length)
  return { items: items.slice(info.offset, info.offset + info.size), info }
}

/** يبني رابط صفحة مع الحفاظ على باقي المعاملات (البحث، الفلاتر) */
export function pageHref(url: string, page: number): string {
  const u = new URL(url)
  if (page <= 1) u.searchParams.delete('page')
  else u.searchParams.set('page', String(page))
  const q = u.searchParams.toString()
  return u.pathname + (q ? `?${q}` : '')
}

/**
 * أرقام الصفحات المعروضة مع فواصل: 1 … 4 5 [6] 7 8 … 20
 * (0 = فاصل «…»). تبقى 7 عناصر كحد أقصى حتى لا يلتف السطر على الجوال.
 */
export function pageWindow(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: number[] = [1]
  let start = Math.max(2, page - 1)
  let end = Math.min(pages - 1, page + 1)
  if (page <= 3) end = 4
  if (page >= pages - 2) start = pages - 3
  if (start > 2) out.push(0)
  for (let i = start; i <= end; i++) out.push(i)
  if (end < pages - 1) out.push(0)
  out.push(pages)
  return out
}
