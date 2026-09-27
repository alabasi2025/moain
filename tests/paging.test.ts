import { describe, expect, test } from 'vitest'
import { pageHref, pageInfo, pageWindow, paginate, readPage } from '../src/lib/paging'
import { sniffImage } from '../src/routes/profile'

describe('ترقيم الصفحات', () => {
  test('قراءة رقم الصفحة بأمان', () => {
    expect(readPage('http://x/a').page).toBe(1)
    expect(readPage('http://x/a?page=3').offset).toBe(40)
    expect(readPage('http://x/a?page=-5').page).toBe(1)
    expect(readPage('http://x/a?page=abc').page).toBe(1)
    expect(readPage('http://x/a?page=1e9').page).toBe(1) // parseInt('1e9') = 1
  })
  test('معلومات الصفحة وتقييدها بآخر صفحة', () => {
    const i = pageInfo({ page: 99, size: 20 }, 45)
    expect(i).toMatchObject({ page: 3, pages: 3, from: 41, to: 45, offset: 40 })
    expect(pageInfo({ page: 1, size: 20 }, 0)).toMatchObject({ pages: 1, from: 0, to: 0 })
  })
  test('ترقيم مصفوفة', () => {
    const { items, info } = paginate(Array.from({ length: 50 }, (_, i) => i), 'http://x/?page=2')
    expect(items[0]).toBe(20)
    expect(items).toHaveLength(20)
    expect(info.total).toBe(50)
  })
  test('الروابط تحافظ على الفلاتر', () => {
    expect(pageHref('http://x/list?q=سارة&filter=all&page=4', 1)).toBe('/list?q=%D8%B3%D8%A7%D8%B1%D8%A9&filter=all')
    expect(pageHref('http://x/list?filter=all', 3)).toBe('/list?filter=all&page=3')
  })
  test('نافذة الأرقام لا تتجاوز 7 عناصر', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 0, 20])
    expect(pageWindow(10, 20)).toEqual([1, 0, 9, 10, 11, 0, 20])
    expect(pageWindow(20, 20)).toEqual([1, 0, 17, 18, 19, 20])
    for (let p = 1; p <= 30; p++) expect(pageWindow(p, 30).length).toBeLessThanOrEqual(7)
  })
})

describe('التحقق من توقيع الصور', () => {
  const pad = (a: number[]) => new Uint8Array([...a, ...Array(16).fill(0)])
  test('يتعرف على الصيغ المسموحة', () => {
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png')
    expect(sniffImage(pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
  })
  test('يرفض ملفات متنكرة', () => {
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)></svg>....'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('GIF89a..........'))).toBeNull()
    expect(sniffImage(new Uint8Array(4))).toBeNull()
  })
})
