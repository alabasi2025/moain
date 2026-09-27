"""لقطات بصرية لكل الصفحات الرئيسية (لابتوب + جوال، فاتح + داكن) للفحص بكسل بكسل.
الاستخدام: python3 tests/visual/shoot.py [out_dir] [--dark] [--only=name1,name2]"""
import sys, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3000')
out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/tmp/shots'
dark = '--dark' in sys.argv
only = next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
os.makedirs(out, exist_ok=True)
PAGES = [
  ('landing', None, '/', True),
  ('login', None, '/login', False),
  ('admin', '0500000001', '/admin', True),
  ('live', '0500000001', '/admin/live', False),
  ('finance', '0500000001', '/admin/finance', True),
  ('course', '0500000001', '/admin/courses/1', False),
  ('pnl', '0500000001', '/admin/finance/course/1', False),
  ('installments', '0500000001', '/admin/finance/installments', False),
  ('users', '0500000001', '/admin/users?role=student', False),
  ('rooms', '0500000001', '/admin/rooms', False),
  ('teacher', '0510000001', '/teacher', True),
  ('lessons', '0510000001', '/lessons', False),
  ('lesson-zoom', '0510000001', '/lessons/1', False),
  ('asg', '0510000001', '/assignments/1', False),
  ('student', '0550000001', '/student', True),
  ('messages', '0550000001', '/messages?with=3', False),
  ('payments', '0550000001', '/student/payments', False),
]
with sync_playwright() as p:
  b = p.chromium.launch()
  for vp_name, vp, mobile in [('desk', {'width': 1440, 'height': 900}, False), ('mob', {'width': 390, 'height': 844}, True)]:
    ctxs = {}
    for name, phone, path, full in PAGES:
      if only and name not in only: continue
      key = phone or 'anon'
      if key not in ctxs:
        c = b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, locale='ar-SA', color_scheme='dark' if dark else 'light', reduced_motion='reduce')
        if phone:
          pg = c.new_page(); pg.goto(BASE + '/login')
          pg.fill('#phone', phone); pg.fill('#password', 'demo1234'); pg.click('button.btn-block, button[type=submit]'); pg.wait_for_load_state('networkidle'); pg.close()
        ctxs[key] = c
      pg = ctxs[key].new_page()
      errs = []
      pg.on('pageerror', lambda e: errs.append(str(e)))
      pg.goto(BASE + path, wait_until='networkidle')
      pg.wait_for_timeout(700)
      f = f'{out}/{name}-{vp_name}{"-dark" if dark else ""}.png'
      pg.screenshot(path=f, full_page=full and not mobile or (full and mobile and name=='landing'))
      if errs: print('JS ERRORS', name, errs)
      pg.close()
    for c in ctxs.values(): c.close()
  b.close()
print('done', out)
