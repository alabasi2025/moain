/** سلوكيات عامة: القائمة على الجوال، الثيم، الإشعارات، تأكيد النماذج، حالة التحميل، الرسائل، PWA */
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]

// ---- القائمة الجانبية (جوال) ----
const side = $('#side'), backdrop = $('#backdrop'), menuBtn = $('#menuBtn')
const toggleMenu = (open) => {
  side?.classList.toggle('open', open)
  backdrop?.classList.toggle('show', open)
  menuBtn?.setAttribute('aria-expanded', String(open))
  document.body.style.overflow = open ? 'hidden' : ''
}
menuBtn?.addEventListener('click', () => toggleMenu(!side.classList.contains('open')))
backdrop?.addEventListener('click', () => toggleMenu(false))
document.addEventListener('keydown', (e) => e.key === 'Escape' && toggleMenu(false))

// ---- الوضع الليلي ----
$('#themeBtn')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  const apply = () => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch {}
  }
  document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(apply) : apply()
})

// ---- الإشعارات المنبثقة ----
const dismiss = (t) => { t.classList.add('out'); setTimeout(() => t.remove(), 250) }
$$('[data-toast]').forEach((t) => {
  t.querySelector('[data-close]')?.addEventListener('click', () => dismiss(t))
  setTimeout(() => t.isConnected && dismiss(t), 5500)
})

// ---- النماذج: تأكيد + حالة تحميل (يمنع الإرسال المزدوج) ----
document.addEventListener('submit', (e) => {
  const f = e.target
  if (f.dataset.confirm && !confirm(f.dataset.confirm)) { e.preventDefault(); return }
  const btn = e.submitter || f.querySelector('button:not([type=button])')
  if (btn && !f.hasAttribute('data-no-loading')) setTimeout(() => { btn.disabled = true; btn.classList.add('loading') }, 0)
})
// إعادة تفعيل الأزرار عند الرجوع للصفحة من ذاكرة المتصفح
addEventListener('pageshow', (e) => e.persisted && $$('.btn.loading').forEach((b) => { b.disabled = false; b.classList.remove('loading') }))

// ---- الرسائل ----
const msgs = $('#msgs')
if (msgs) msgs.scrollTop = msgs.scrollHeight
$$('textarea[data-enter-submit]').forEach((t) => {
  const grow = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px' }
  t.addEventListener('input', grow)
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && innerWidth > 760) { e.preventDefault(); t.value.trim() && t.form.requestSubmit() }
  })
})

// ---- إظهار كلمة المرور ----
$$('[data-pw-toggle]').forEach((b) => b.addEventListener('click', () => {
  const i = document.getElementById(b.dataset.pwToggle)
  i.type = i.type === 'password' ? 'text' : 'password'
  b.setAttribute('aria-pressed', String(i.type === 'text'))
}))

// ---- عدّاد الأرقام (للمؤشرات) ----
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
if (!reduce && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting) return
    io.unobserve(en.target)
    const el = en.target, end = parseFloat(el.dataset.count), dec = (el.dataset.count.split('.')[1] || '').length, t0 = performance.now(), d = 1100
    const step = (t) => {
      const p = Math.min(1, (t - t0) / d), v = end * (1 - Math.pow(1 - p, 3))
      el.textContent = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
      p < 1 && requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }), { threshold: .4 })
  $$('[data-count]').forEach((el) => io.observe(el))
}

// ---- الجداول ⇐ بطاقات على الجوال ----
// ينسخ عنوان كل عمود إلى خلاياه (data-label) لتعرضها CSS كبطاقة «العنوان: القيمة».
// تحسين تدريجي: بدون JS يبقى الجدول قابلاً للتمرير أفقياً. استثناء: .keep-table
$$('.table-wrap > table:not(.keep-table)').forEach((t) => {
  const heads = $$('thead th', t).map((th) => th.textContent.trim())
  if (!heads.length) return
  t.classList.add('rt')
  $$('tbody tr', t).forEach((tr) => {
    const cells = [...tr.children]
    if (cells.length === 1) { tr.classList.add('rt-full'); return }
    cells.forEach((td, i) => {
      const h = heads[i] ?? ''
      if (h) td.dataset.label = h
      else td.classList.add(i === 0 ? 'rt-title' : 'rt-actions')
    })
    cells[0]?.classList.add('rt-title')
  })
  // صف الإجمالي: نطابق كل خلية مع عمودها مع احتساب colspan
  $$('tfoot tr', t).forEach((tr) => {
    let col = 0
    ;[...tr.children].forEach((td, i) => {
      if (i === 0) td.classList.add('rt-title')
      else if (heads[col]) td.dataset.label = heads[col]
      col += td.colSpan || 1
    })
  })
})

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
