import { Hono } from 'hono'
import { homeFor, isValidPhone, login, logout, normalizePhone } from '../lib/auth'
import { form, isDemo, str } from '../lib/http'
import type { AppEnv } from '../lib/types'
import { ASSET_V, Head, Logo } from '../views/layout'
import { Icon, type IconName } from '../views/icons'
import { Landing } from '../views/landing'

export const publicRoutes = new Hono<AppEnv>()

publicRoutes.get('/', (c) => {
  const sent = c.req.query('sent')
  return c.html(<Landing sent={sent === 'ok' || sent === 'bad' ? sent : undefined} />)
})

publicRoutes.post('/lead', async (c) => {
  const f = await form(c)
  if (str(f.website)) return c.redirect('/?sent=ok#book', 303) // فخ للروبوتات
  const name = str(f.name, 80)
  const phone = normalizePhone(f.phone)
  if (name.length < 2 || !isValidPhone(phone)) return c.redirect('/?sent=bad#book', 303)
  // حد بسيط: طلب واحد لكل رقم كل 10 دقائق
  const recent = await c.env.DB.prepare('SELECT 1 FROM leads WHERE phone = ? AND created_at > unixepoch() - 600').bind(phone).first()
  if (!recent) {
    await c.env.DB.prepare('INSERT INTO leads (name, phone, grade, subject) VALUES (?, ?, ?, ?)')
      .bind(name, phone, str(f.grade, 40), str(f.subject, 60))
      .run()
  }
  return c.redirect('/?sent=ok#book', 303)
})

function LoginPage({ error, next, demo, phone }: { error?: string; next: string; demo: boolean; phone?: string }) {
  const demoUsers: [string, string, IconName, string][] = [
    ['0500000001', 'الإدارة', 'shield-check', 'brand'],
    ['0510000001', 'معلمة', 'presentation', 'pink'],
    ['0550000001', 'طالب', 'graduation-cap', 'teal'],
  ]
  return (
    <html lang="ar" dir="rtl">
      <Head title="تسجيل الدخول — إضاءات" noindex />
      <body>
        <div class="auth">
          <div class="auth-form">
            <div class="box">
              <a href="/" class="auth-brand" aria-label="إضاءات — الرئيسية">
                <Logo size={44} />
                <span>
                  إضاءات
                  <small>منصة التعليم المباشر</small>
                </span>
              </a>
              <h1 class="auth-title">أهلاً بعودتك</h1>
              <p class="muted auth-sub">سجّل دخولك برقم الجوال وكلمة المرور.</p>
              {error && (
                <div class="alert bad" role="alert">
                  <Icon name="circle-alert" />
                  <div>{error}</div>
                </div>
              )}
              <form method="post" action="/login" id="loginForm">
                <input type="hidden" name="next" value={next} />
                <div class="field">
                  <label for="phone">رقم الجوال</label>
                  <div class="input-icon">
                    <Icon name="smartphone" />
                    <input id="phone" name="phone" required inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" autocomplete="username" value={phone ?? ''} autofocus={!phone} />
                  </div>
                </div>
                <div class="field">
                  <label for="password">كلمة المرور</label>
                  <div class="input-icon">
                    <Icon name="key-round" />
                    <input id="password" name="password" type="password" required autocomplete="current-password" autofocus={!!phone} style="padding-left:3rem" />
                    <button type="button" class="icon-btn pw-toggle" data-pw-toggle="password" aria-label="إظهار كلمة المرور" aria-pressed="false">
                      <Icon name="eye" class="pw-show" />
                      <Icon name="eye-off" class="pw-hide" />
                    </button>
                  </div>
                </div>
                <button class="btn btn-grad btn-lg btn-block">
                  دخول <Icon name="arrow-left" />
                </button>
              </form>
              {demo && (
                <div class="demo-box">
                  <div class="demo-head">
                    <Icon name="sparkles" /> جرّب المنصة بحساب تجريبي
                  </div>
                  <div class="demo-users">
                    {demoUsers.map(([ph, label, icon, tone]) => (
                      <button type="button" data-phone={ph} class={`tone-${tone}`}>
                        <span class="tile tile-md">
                          <Icon name={icon} />
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p class="hint" style="text-align:center;margin:.6rem 0 0">
                    كلمة المرور لكل الحسابات: <b class="num">demo1234</b>
                  </p>
                  <script
                    dangerouslySetInnerHTML={{
                      __html: `document.querySelectorAll('.demo-users button').forEach(b=>b.onclick=()=>{phone.value=b.dataset.phone;password.value='demo1234';b.classList.add('picked');loginForm.requestSubmit()})`,
                    }}
                  />
                </div>
              )}
              <p class="muted auth-foot">
                <Icon name="circle-help" /> نسيت كلمة المرور؟ تواصل مع إدارة المنصة.
              </p>
            </div>
          </div>
          <aside class="auth-art" aria-hidden="true">
            <div class="auth-art-top">
              <span class="pill-glass">
                <span class="pill-dot"></span> 3 حصص مباشرة الآن
              </span>
            </div>
            <div>
              <h2>كل حصة، كل واجب، وكل متابعة — في مكان واحد.</h2>
              <ul class="auth-points">
                <li>
                  <Icon name="radio-tower" /> حصص مباشرة بدون حد زمني
                </li>
                <li>
                  <Icon name="clapperboard" /> تسجيلات محمية لمدة 48 ساعة
                </li>
                <li>
                  <Icon name="shield-check" /> رسائل خاصة بدل الواتساب
                </li>
              </ul>
            </div>
            <figure class="quote">
              <div class="stars">
                {[0, 1, 2, 3, 4].map(() => (
                  <Icon name="star" />
                ))}
              </div>
              <p>«ارتحنا من الروابط والقروبات. كل شيء في مكان واحد، والمتابعة واضحة.»</p>
              <figcaption class="flex">
                <span class="avatar sm" style="--av:#ffb020">ف</span>
                <span>
                  <b>أبو فيصل</b>
                  <small style="display:block;color:rgba(255,255,255,.7)">ولي أمر</small>
                </span>
              </figcaption>
            </figure>
          </aside>
        </div>
        <script src={`/static/app.js?v=${ASSET_V}`} defer></script>
      </body>
    </html>
  )
}

const safeNext = (n: unknown) => {
  const s = String(n ?? '')
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : ''
}

publicRoutes.get('/login', (c) => {
  const user = c.get('user')
  if (user) return c.redirect(homeFor(user.role))
  return c.html(<LoginPage next={safeNext(c.req.query('next'))} demo={isDemo(c)} />)
})

publicRoutes.post('/login', async (c) => {
  const f = await form(c)
  const res = await login(c, f.phone, f.password)
  if (!res.ok) return c.html(<LoginPage error={res.error} next={safeNext(f.next)} demo={isDemo(c)} phone={str(f.phone, 20)} />, 401)
  return c.redirect(safeNext(f.next) || homeFor(res.user.role), 303)
})

publicRoutes.post('/logout', async (c) => {
  await logout(c)
  return c.redirect('/login', 303)
})

publicRoutes.get('/manifest.webmanifest', (c) =>
  c.json(
    {
      name: 'منصة إضاءات التعليمية',
      short_name: 'إضاءات',
      start_url: '/login',
      display: 'standalone',
      dir: 'rtl',
      lang: 'ar',
      background_color: '#f7f7fc',
      theme_color: '#5b3df5',
      icons: [
        { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    200,
    { 'content-type': 'application/manifest+json' },
  ),
)

publicRoutes.get('/robots.txt', (c) => c.text('User-agent: *\nAllow: /$\nDisallow: /admin\nDisallow: /teacher\nDisallow: /student\nDisallow: /api\n'))
