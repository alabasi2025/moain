import { describe, expect, test } from 'vitest'
import { Icon, IconTile } from '../src/views/icons'
import { ICONS } from '../src/views/icons.gen'
import { Landing } from '../src/views/landing'
import { Empty, Stat } from '../src/views/layout'

// يضمن أن مكونات العرض تُرسم فعلاً (خطأ SVG + dangerouslySetInnerHTML في Hono كان يُسقط كل الصفحات)
describe('render', () => {
  test('كل الأيقونات تُرسم كـ SVG صالح', async () => {
    for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
      const html = String(await (<Icon name={name} />).toString())
      expect(html.startsWith('<svg')).toBe(true)
      expect(html).toContain(ICONS[name])
    }
  })
  test('الأيقونة مع label تصبح img قابلة للوصول', async () => {
    const html = String(await (<Icon name="x" label="إغلاق" />).toString())
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="إغلاق"')
    expect(html).not.toContain('aria-hidden')
  })
  test('المكونات المشتركة', async () => {
    expect(String(await (<IconTile name="wallet" tone="ok" />).toString())).toContain('tone-ok')
    expect(String(await (<Empty icon="inbox" text="فارغ" />).toString())).toContain('فارغ')
    expect(String(await (<Stat label="س" value="1" icon="users" />).toString())).toContain('<svg')
  })
  test('صفحة الهبوط تُرسم كاملة', async () => {
    const html = String(await (<Landing />).toString())
    for (const id of ['features', 'how', 'subjects', 'voices', 'book', 'faq']) expect(html).toContain(`id="${id}"`)
    expect(html).toContain('FAQPage')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
