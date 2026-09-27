"""زاحف شامل: يدخل بكل دور، يتبع كل رابط داخلي (GET) حتى عمق محدد، ويتحقق أن:
- لا توجد استجابة 5xx ولا 404 لرابط داخلي
- لا توجد أخطاء JavaScript في الصفحة
- كل زر له نص أو aria-label (إمكانية الوصول)
- كل صورة لها alt، وكل حقل له label أو aria-label
- لا تمرير أفقي على الجوال (390px)
الاستخدام: python3 tests/visual/crawl.py [BASE]"""
import sys, re
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
ROLES = [('admin', '0500000001'), ('teacher', '0510000001'), ('student', '0550000001')]
SKIP = re.compile(r'/logout|/media/|/files/|\.csv|/avatars/|wa\.me|/static/|#')
MAX = 70
problems = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for role, phone in ROLES:
        for vp, mob in [({'width': 1366, 'height': 850}, False), ({'width': 390, 'height': 844}, True)]:
            ctx = b.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale='ar-SA')
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and 'favicon' not in m.text and errs.append(m.text))
            pg.goto(BASE + '/login'); pg.fill('#phone', phone); pg.fill('#password', 'demo1234'); pg.click('#loginForm button.btn-block'); pg.wait_for_load_state('networkidle')
            start = urlparse(pg.url).path
            queue, seen = [start, '/me', '/messages'], set()
            while queue and len(seen) < MAX:
                path = queue.pop(0)
                norm = re.sub(r'/\d+', '/:id', path.split('?')[0]) + ('?' + path.split('?')[1] if '?' in path and 'page=' not in path else '')
                if norm in seen: continue
                seen.add(norm)
                errs.clear()
                r = pg.goto(BASE + path, wait_until='domcontentloaded')
                pg.wait_for_timeout(150)
                st = r.status if r else 0
                if st >= 400: problems.append(f'[{role}{"/mob" if mob else ""}] {st} {path}')
                for e in errs: problems.append(f'[{role}{"/mob" if mob else ""}] JS {path}: {e[:160]}')
                a11y = pg.evaluate('''() => {
                  const out = []
                  document.querySelectorAll('button, a.icon-btn, a.btn').forEach(el => { const t = (el.textContent||'').trim() || el.getAttribute('aria-label') || el.getAttribute('title'); if (!t && el.offsetParent) out.push('زر بلا اسم: ' + el.outerHTML.slice(0,90)) })
                  document.querySelectorAll('img').forEach(el => { if (!el.hasAttribute('alt')) out.push('صورة بلا alt') })
                  document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => {
                    if (!el.offsetParent || el.classList.contains('sr-only')) return
                    const ok = el.getAttribute('aria-label') || el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('.field')?.querySelector('label') || el.getAttribute('placeholder') || el.getAttribute('title')
                    if (!ok) out.push('حقل بلا تسمية: ' + el.outerHTML.slice(0,90))
                  })
                  if (document.documentElement.scrollWidth > innerWidth + 2) out.push('تمرير أفقي ' + document.documentElement.scrollWidth)
                  return out.slice(0,5)
                }''')
                for x in a11y: problems.append(f'[{role}{"/mob" if mob else ""}] A11Y {path}: {x}')
                for href in pg.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))'):
                    if not href or SKIP.search(href) or href.startswith('http') and not href.startswith(BASE): continue
                    u = urlparse(urljoin(BASE + path, href))
                    nxt = u.path + ('?' + u.query if u.query else '')
                    if u.path.startswith('/') and u.path != '/' : queue.append(nxt)
            print(f'{role:8} {"mob " if mob else "desk"} visited {len(seen)} unique pages')
            ctx.close()
    b.close()
print('\n'.join(sorted(set(problems))) or 'ALL CLEAN ✓')
print('problems:', len(set(problems)))
