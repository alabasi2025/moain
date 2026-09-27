import type { Child } from 'hono/jsx'
import type { SessionUser } from '../lib/types'
import { pageHref, pageWindow, type PageInfo } from '../lib/paging'
import { Icon, IconTile, type IconName, type Tone } from './icons'

export const ASSET_V = '4'

/** يمنع وميض الثيم: يُطبَّق قبل رسم الصفحة (مفضّل المستخدم ⇐ إعداد النظام) */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`

export function Head({ title, description, noindex }: { title: string; description?: string; noindex?: boolean }) {
  return (
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {noindex && <meta name="robots" content="noindex" />}
      <meta name="theme-color" content="#5b3df5" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#0b0d1f" media="(prefers-color-scheme: dark)" />
      <meta name="color-scheme" content="light dark" />
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="icon" href="/static/icon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/static/icon-192.png" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <link rel="preload" href="/static/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossorigin="" />
      <link rel="preload" href="/static/fonts/alexandria-arabic-wght-normal.woff2" as="font" type="font/woff2" crossorigin="" />
      <link rel="stylesheet" href={`/static/app.css?v=${ASSET_V}`} />
    </head>
  )
}

/** شعار إضاءات: شعلة/إشراقة فوق كتاب */
export const Logo = ({ size = 38 }: { size?: number }) => (
  <span class="logo" style={size !== 38 ? `width:${size}px;height:${size}px;border-radius:${Math.round(size / 3.2)}px` : undefined}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v2M5.6 5.6 7 7M18.4 5.6 17 7M3 12h2M19 12h2" />
      <path d="M8 12a4 4 0 0 1 8 0" />
      <path d="M4 17c2.7-1.3 5.3-1.3 8 0 2.7-1.3 5.3-1.3 8 0v3c-2.7-1.3-5.3-1.3-8 0-2.7-1.3-5.3-1.3-8 0z" fill="currentColor" fill-opacity=".25" />
    </svg>
  </span>
)

export interface NavItem {
  href: string
  label: string
  icon: IconName
  count?: number
  sep?: string
  mobile?: boolean
}

export function navFor(user: SessionUser, unread = 0): NavItem[] {
  if (user.role === 'admin')
    return [
      { href: '/admin', label: 'الرئيسية', icon: 'layout-dashboard', mobile: true },
      { href: '/admin/live', label: 'الحصص الآن', icon: 'radio', mobile: true },
      { href: '/lessons', label: 'جدول الحصص', icon: 'calendar-days' },
      { sep: 'التعليم', href: '/admin/courses', label: 'الدورات', icon: 'book-open' },
      { href: '/admin/users?role=teacher', label: 'المعلمات', icon: 'presentation' },
      { href: '/admin/users?role=student', label: 'الطلاب', icon: 'graduation-cap' },
      { href: '/admin/assignments', label: 'الواجبات', icon: 'notebook-pen' },
      { href: '/admin/recordings', label: 'التسجيلات', icon: 'clapperboard' },
      { href: '/admin/rooms', label: 'قاعات الزوم', icon: 'video' },
      { href: '/admin/leads', label: 'طلبات التسجيل', icon: 'inbox' },
      { sep: 'المالية', href: '/admin/finance', label: 'لوحة المالية', icon: 'wallet', mobile: true },
      { href: '/admin/finance/installments', label: 'الأقساط والمتابعة', icon: 'calendar-clock' },
      { href: '/admin/finance/payouts', label: 'المستحقات', icon: 'hand-coins' },
      { href: '/admin/finance/expenses', label: 'المصروفات', icon: 'receipt' },
      { href: '/admin/partners', label: 'الجهات', icon: 'building-2' },
      { sep: 'التواصل', href: '/messages', label: 'الرسائل', icon: 'messages-square', count: unread, mobile: true },
    ]
  if (user.role === 'teacher')
    return [
      { href: '/teacher', label: 'الرئيسية', icon: 'layout-dashboard', mobile: true },
      { href: '/lessons', label: 'حصصي', icon: 'calendar-days', mobile: true },
      { href: '/teacher/assignments', label: 'الواجبات', icon: 'notebook-pen', mobile: true },
      { href: '/teacher/recordings', label: 'التسجيلات', icon: 'clapperboard' },
      { href: '/teacher/earnings', label: 'مستحقاتي', icon: 'banknote' },
      { href: '/messages', label: 'الرسائل', icon: 'messages-square', count: unread, mobile: true },
    ]
  return [
    { href: '/student', label: 'الرئيسية', icon: 'house', mobile: true },
    { href: '/student/recordings', label: 'التسجيلات', icon: 'circle-play', mobile: true },
    { href: '/student/assignments', label: 'الواجبات', icon: 'notebook-pen', mobile: true },
    { href: '/student/payments', label: 'مدفوعاتي', icon: 'credit-card' },
    { href: '/messages', label: 'الرسائل', icon: 'messages-square', count: unread, mobile: true },
  ]
}

export const roleLabel = { admin: 'الإدارة', teacher: 'معلمة', student: 'طالب' } as const

function isActive(href: string, path: string, search: string) {
  const [clean, q] = href.split('?')
  if (q) return path === clean && search.includes(q)
  if (['/admin', '/teacher', '/student'].includes(clean)) return path === clean
  return path === clean || path.startsWith(clean + '/')
}

/** لون ثابت للصورة الرمزية حسب الاسم (يسهّل التمييز بين الأشخاص) */
const AV_COLORS = ['#5b3df5', '#0d9488', '#db2777', '#2563eb', '#c77800', '#7c3aed', '#0f9d58', '#e5484d']
export function avatarColor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
const initials = (name: string) => {
  const parts = name.replace(/^أ\.\s*/, '').trim().split(/\s+/)
  return (parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')
}
/** رابط صورة الملف الشخصي (مع رقم النسخة لكسر التخزين المؤقت) */
export const avatarUrl = (id: number, v?: number | null) => (v ? `/avatars/${id}?v=${v}` : null)

/**
 * الصورة الرمزية: صورة المستخدم إن وجدت، وإلا الأحرف الأولى بلون ثابت مشتق من الاسم.
 * مرّر id + v لعرض الصورة. المقاسات: sm 30 • افتراضي 38 • lg 48 • xl 96
 */
export const Avatar = ({ name, size, id, v, ring }: { name: string; size?: 'xs' | 'sm' | 'lg' | 'xl'; id?: number; v?: number | null; ring?: boolean }) => {
  const src = id ? avatarUrl(id, v) : null
  return (
    <span class={`avatar${size ? ` ${size}` : ''}${ring ? ' ring-on' : ''}`} style={`--av:${avatarColor(name)}`} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" width={96} height={96} /> : initials(name)}
    </span>
  )
}

/** خلية جدول لشخص: صورة + اسم + سطر فرعي */
export const Person = ({ id, name, v, sub, href }: { id: number; name: string; v?: number | null; sub?: Child; href?: string }) => (
  <div class="cell-user">
    <Avatar name={name} id={id} v={v} size="sm" />
    <div style="min-width:0">
      {href ? (
        <a href={href}>
          <b>{name}</b>
        </a>
      ) : (
        <b>{name}</b>
      )}
      {sub && <small class="muted">{sub}</small>}
    </div>
  </div>
)

export function AppLayout(props: {
  title: string
  user: SessionUser
  path: string
  search?: string
  unread?: number
  children: Child
  flash?: { type: 'ok' | 'bad' | 'info' | 'warn'; text: string } | null
  scripts?: string[]
  demo?: boolean
}) {
  const nav = navFor(props.user, props.unread ?? 0)
  const search = props.search ?? ''
  const current = nav.find((n) => isActive(n.href, props.path, search))
  return (
    <html lang="ar" dir="rtl">
      <Head title={`${props.title} — إضاءات`} noindex />
      <body>
        {props.demo && (
          <div class="demo-banner">
            <Icon name="sparkles" /> نسخة معاينة تجريبية ببيانات وهمية — <a href="/">الموقع التعريفي</a>
          </div>
        )}
        <div class="shell">
          <aside class="side" id="side" aria-label="القائمة الرئيسية">
            <a href={nav[0].href} class="brand">
              <Logo />
              <span>
                إضاءات
                <small>منصة التعليم المباشر</small>
              </span>
            </a>
            <nav>
              {nav.map((n) => (
                <>
                  {n.sep && <div class="sep">{n.sep}</div>}
                  <a href={n.href} class={isActive(n.href, props.path, search) ? 'active' : ''} aria-current={isActive(n.href, props.path, search) ? 'page' : undefined}>
                    <Icon name={n.icon} />
                    {n.label}
                    {!!n.count && <span class="count">{n.count}</span>}
                  </a>
                </>
              ))}
            </nav>
            <a href="/me" class="side-foot" title="ملفي الشخصي">
              <Avatar name={props.user.name} id={props.user.id} v={props.user.avatar_v} />
              <div style="flex:1;min-width:0">
                <b>{props.user.name}</b>
                <small>{roleLabel[props.user.role]}</small>
              </div>
              <Icon name="settings" />
            </a>
          </aside>
          <div class="backdrop" id="backdrop"></div>
          <div class="main">
            <header class="topbar">
              <div class="crumb">
                <button class="icon-btn menu-btn" id="menuBtn" aria-label="فتح القائمة" aria-controls="side" aria-expanded="false">
                  <Icon name="menu" />
                </button>
                {current && <Icon name={current.icon} class="hide-sm" />}
                <span>{props.title}</span>
              </div>
              <div class="who">
                <button class="icon-btn" id="themeBtn" aria-label="تبديل الوضع الليلي" title="الوضع الليلي">
                  <Icon name="moon" class="theme-dark" />
                  <Icon name="sun" class="theme-light" />
                </button>
                <a class="icon-btn" href="/messages" aria-label={`الرسائل${props.unread ? ` (${props.unread} غير مقروءة)` : ''}`} title="الرسائل">
                  <Icon name="bell" />
                  {!!props.unread && <span class="dot-badge">{props.unread}</span>}
                </a>
                <form method="post" action="/logout" class="inline-form">
                  <button class="icon-btn" title="تسجيل الخروج" aria-label="تسجيل الخروج">
                    <Icon name="log-out" class="flip" />
                  </button>
                </form>
                <a href="/me" class="me-link" aria-label="ملفي الشخصي" title="ملفي الشخصي">
                  <Avatar name={props.user.name} id={props.user.id} v={props.user.avatar_v} ring />
                </a>
              </div>
            </header>
            <main class="content" id="main">
              {props.children}
            </main>
          </div>
        </div>
        <nav class="bottom-nav" aria-label="التنقل السريع">
          {nav
            .filter((n) => n.mobile)
            .map((n) => (
              <a href={n.href} class={isActive(n.href, props.path, search) ? 'active' : ''}>
                <Icon name={n.icon} />
                {n.label}
                {!!n.count && <span class="count">{n.count}</span>}
              </a>
            ))}
        </nav>
        <div class="toasts" id="toasts" role="status" aria-live="polite">
          {props.flash && <Toast type={props.flash.type} text={props.flash.text} />}
        </div>
        <script src={`/static/app.js?v=${ASSET_V}`} defer></script>
        {(props.scripts ?? []).map((s) => (
          <script type="module" src={`${s}?v=${ASSET_V}`}></script>
        ))}
      </body>
    </html>
  )
}

const toastIcon = { ok: ['circle-check', 'ok'], bad: ['circle-x', 'bad'], warn: ['triangle-alert', 'warn'], info: ['info', 'info'] } as const
export const Toast = ({ type, text }: { type: keyof typeof toastIcon; text: string }) => (
  <div class="toast" data-toast>
    <IconTile name={toastIcon[type][0]} tone={toastIcon[type][1]} size="sm" />
    <div>{text}</div>
    <button class="icon-btn" style="width:30px;height:30px" data-close aria-label="إغلاق">
      <Icon name="x" size={16} />
    </button>
  </div>
)

// ============ مكونات مشتركة ============
export const Money = ({ v, color }: { v: number; color?: boolean }) => {
  const abs = Math.abs(Math.round(v))
  const whole = Math.floor(abs / 100).toLocaleString('en-US')
  const frac = abs % 100
  const s = `${v < 0 ? '−' : ''}${frac ? `${whole}.${String(frac).padStart(2, '0')}` : whole}`
  return (
    <span class={`num ${color ? (v < 0 ? 'neg' : v > 0 ? 'pos' : '') : ''}`}>
      {s} <small>ر.س</small>
    </span>
  )
}

export const Stat = (p: { label: string; value: Child; sub?: Child; tone?: 'ok' | 'bad' | 'warn' | 'teal' | 'info'; icon?: IconName }) => (
  <div class={`stat ${p.tone ?? ''}`}>
    <div class="stat-top">
      <span class="label">{p.label}</span>
      {p.icon && <IconTile name={p.icon} tone={(p.tone ?? 'brand') as Tone} size="sm" />}
    </div>
    <div class="value">{p.value}</div>
    {p.sub && <div class="sub">{p.sub}</div>}
  </div>
)

export const Empty = ({ icon, text, children }: { icon: IconName; text: string; children?: Child }) => (
  <div class="empty">
    <div class="big">
      <Icon name={icon} />
    </div>
    <p>{text}</p>
    {children}
  </div>
)

export const PageHead = ({ title, sub, eyebrow, children }: { title: Child; sub?: Child; eyebrow?: Child; children?: Child }) => (
  <div class="page-head">
    <div style="min-width:0">
      {eyebrow && <div class="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
    {children && <div class="actions">{children}</div>}
  </div>
)

/** معلومة صغيرة بأيقونة (للأسطر الفرعية) */
export const Meta = ({ icon, children }: { icon: IconName; children: Child }) => (
  <span>
    <Icon name={icon} />
    {children}
  </span>
)

export const Alert = ({ type, icon, children }: { type: 'ok' | 'bad' | 'info' | 'warn'; icon?: IconName; children: Child }) => (
  <div class={`alert ${type}`}>
    <Icon name={icon ?? toastIcon[type][0]} />
    <div>{children}</div>
  </div>
)

/**
 * شريط ترقيم الصفحات: «عرض 21–40 من 143» + أرقام الصفحات.
 * روابط عادية (تعمل بدون JS، وزر الرجوع يعيدك لنفس الصفحة)، وأهداف لمس 40px.
 */
export const Pager = ({ info, url }: { info: PageInfo; url: string }) => {
  if (info.total <= info.size) return info.total ? <div class="pager-sum solo">{info.total} عنصر</div> : null
  return (
    <nav class="pager" aria-label="ترقيم الصفحات">
      <span class="pager-sum">
        عرض <b class="num">{info.from}</b>–<b class="num">{info.to}</b> من <b class="num">{info.total}</b>
      </span>
      <div class="pager-btns">
        {info.page > 1 ? (
          <a class="pg" href={pageHref(url, info.page - 1)} rel="prev" aria-label="الصفحة السابقة">
            <Icon name="chevron-right" />
          </a>
        ) : (
          <span class="pg off" aria-hidden="true">
            <Icon name="chevron-right" />
          </span>
        )}
        {pageWindow(info.page, info.pages).map((n) =>
          n === 0 ? (
            <span class="pg gap">…</span>
          ) : n === info.page ? (
            <span class="pg on num" aria-current="page">
              {n}
            </span>
          ) : (
            <a class="pg num" href={pageHref(url, n)}>
              {n}
            </a>
          ),
        )}
        {info.page < info.pages ? (
          <a class="pg" href={pageHref(url, info.page + 1)} rel="next" aria-label="الصفحة التالية">
            <Icon name="chevron-left" />
          </a>
        ) : (
          <span class="pg off" aria-hidden="true">
            <Icon name="chevron-left" />
          </span>
        )}
      </div>
    </nav>
  )
}

/** شريط أدوات القائمة: بحث + فلاتر، يرسل GET ويعيد للصفحة الأولى */
export const Toolbar = ({ q, placeholder, children, hidden }: { q?: string; placeholder?: string; children?: Child; hidden?: Record<string, string> }) => (
  <form method="get" class="toolbar" role="search">
    {Object.entries(hidden ?? {}).map(([k, v]) => (
      <input type="hidden" name={k} value={v} />
    ))}
    <div class="input-icon grow">
      <Icon name="search" />
      <input type="search" name="q" value={q ?? ''} placeholder={placeholder ?? 'بحث…'} aria-label={placeholder ?? 'بحث'} />
    </div>
    {children}
    <button class="btn btn-soft">
      <Icon name="filter" /> تطبيق
    </button>
  </form>
)
