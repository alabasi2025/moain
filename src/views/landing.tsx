import { Icon, type IconName } from './icons'
import { ASSET_V, Head, Logo } from './layout'

/* ============================================================
   الموقع التعريفي — v2
   البنية مبنية على أفضل ممارسات صفحات الهبوط التعليمية:
   ١) وعد واضح + دليل فوري (Hero + معاينة حيّة)  ٢) إزالة الاعتراضات (المميزات)
   ٣) تقليل الغموض (خطوات البدء)  ٤) دليل اجتماعي (أرقام + آراء)  ٥) CTA واحد متكرر (احجز)
   ============================================================ */

const features: { i: IconName; t: string; d: string; tone: string; big?: boolean }[] = [
  { i: 'radio-tower', t: 'حصص مباشرة داخل المنصة', d: 'المعلمة تشرح والطالب يتفاعل صوتاً وصورة، من الجوال أو الآيباد أو اللابتوب — بدون تطبيقات وبدون حد الـ 40 دقيقة.', tone: 'brand', big: true },
  { i: 'rewind', t: 'فاتك الدرس؟ ارجع له', d: 'كل حصة تُسجَّل وتبقى 48 ساعة للطلاب المسجلين فقط، محمية بعلامة مائية باسم الطالب.', tone: 'teal' },
  { i: 'notebook-pen', t: 'واجبات ومتابعة', d: 'واجب بعد كل درس، تسليم إلكتروني، وتصحيح وملاحظات من المعلمة مباشرة.', tone: 'warn' },
  { i: 'users-round', t: 'ولي الأمر في الصورة', d: 'الحضور والواجبات والمدفوعات أولاً بأول، وتقارير واضحة بدون سؤال.', tone: 'info', big: true },
  { i: 'shield-check', t: 'تواصل آمن وخاص', d: 'كل الرسائل داخل المنصة، بدون أرقام شخصية وبدون مجموعات واتساب.', tone: 'pink' },
  { i: 'award', t: 'معلمات متميزات', d: 'نخبة من المعلمات المتخصصات بخبرة وأساليب تفاعلية ممتعة.', tone: 'ok' },
  { i: 'monitor-smartphone', t: 'يعمل على كل الأجهزة', d: 'من المتصفح مباشرة، ويُثبَّت على الجوال كتطبيق بضغطة.', tone: 'brand' },
]

const subjects: { t: string; i: IconName }[] = [
  { t: 'الرياضيات', i: 'sigma' },
  { t: 'اللغة الإنجليزية', i: 'languages' },
  { t: 'العلوم', i: 'atom' },
  { t: 'الفيزياء', i: 'zap' },
  { t: 'الكيمياء', i: 'flask-conical' },
  { t: 'اللغة العربية', i: 'pen-tool' },
  { t: 'القدرات والتحصيلي', i: 'brain' },
  { t: 'التأسيس والقراءة', i: 'book-marked' },
]

const steps: { i: IconName; t: string; d: string }[] = [
  { i: 'mouse-pointer-click', t: 'احجز حصة تجريبية', d: 'عبّي النموذج في أقل من دقيقة، ونتواصل معك خلال يوم عمل.' },
  { i: 'target', t: 'نحدد المستوى', d: 'نقيّم مستوى الطالب مجاناً ونختار له الفصل المناسب.' },
  { i: 'circle-play', t: 'ابدأ الحصص', d: 'تستلم حسابك وتدخل حصصك المباشرة من أي جهاز بضغطة.' },
  { i: 'trending-up', t: 'تابع التقدم', d: 'تسجيلات وواجبات وتقارير مستمرة لولي الأمر.' },
]

const testimonials = [
  { n: 'أم عبدالله', r: 'ولية أمر — الصف الثاني المتوسط', q: 'أول مرة أحس إني أعرف وش يصير مع ولدي. الواجبات والحضور قدامي، ومستواه في الرياضيات تحسن بشكل واضح خلال شهر.' },
  { n: 'ريم', r: 'طالبة — الصف الثالث الثانوي', q: 'الفصل صغير والأستاذة تعرف اسمي وتسألني. ولما فاتتني حصة رجعت للتسجيل نفس اليوم.' },
  { n: 'أبو فيصل', r: 'ولي أمر — القدرات', q: 'ارتحنا من الروابط والقروبات. كل شيء في مكان واحد، والتذكير بالأقساط واضح ومحترم.' },
]

const faqs = [
  { q: 'كيف تتم الحصص؟', a: 'الحصص مباشرة (بث حي) داخل المنصة. يدخل الطالب بحسابه ويضغط «دخول الحصة» في وقتها، ويتفاعل مع المعلمة صوتاً وصورة.' },
  { q: 'إذا فاتت الطالب حصة؟', a: 'تُسجَّل الحصة وتبقى متاحة 48 ساعة في حساب الطالب، يشاهدها من أي جهاز. التسجيل محمي ولا يمكن تحميله.' },
  { q: 'كم عدد الطلاب في الفصل؟', a: 'فصولنا صغيرة من 2 إلى 7 طلاب، عشان كل طالب ياخذ حقه من الاهتمام والمشاركة.' },
  { q: 'هل أحتاج تطبيق؟', a: 'لا، المنصة تعمل من المتصفح مباشرة، وتقدر تثبتها على شاشة الجوال كتطبيق بضغطة واحدة.' },
  { q: 'كيف الدفع؟', a: 'بالتحويل البنكي، ومتاح التقسيط حسب الدورة. تواصل معنا لمعرفة الأسعار والعروض الحالية.' },
]

const Check = ({ children }: { children: string }) => (
  <li>
    <span class="ck">
      <Icon name="check" />
    </span>
    {children}
  </li>
)

export function Landing({ sent }: { sent?: 'ok' | 'bad' }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'منصة إضاءات التعليمية',
    description: 'دروس تقوية مباشرة أونلاين بفصول صغيرة، مع تسجيلات وواجبات ومتابعة.',
    areaServed: 'SA',
    inLanguage: 'ar',
  }
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
  return (
    <html lang="ar" dir="rtl">
      <Head
        title="إضاءات | دروس تقوية مباشرة أونلاين بفصول صغيرة"
        description="منصة إضاءات التعليمية: حصص تقوية مباشرة مع معلمات متميزات، فصول صغيرة من 2 إلى 7 طلاب، تسجيل الحصص، واجبات، ومتابعة لولي الأمر."
      />
      <body class="landing">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        <link rel="stylesheet" href={`/static/landing.css?v=${ASSET_V}`} />
        <a href="#main" class="skip">تخطَّ إلى المحتوى</a>

        {/* ============ الشريط العلوي ============ */}
        <header class="l-nav" id="lnav">
          <div class="wrap l-nav-in">
            <a href="/" class="l-brand" aria-label="إضاءات — الرئيسية">
              <Logo size={36} />
              <span>إضاءات</span>
            </a>
            <nav class="l-links" aria-label="أقسام الصفحة">
              <a href="#features">المميزات</a>
              <a href="#how">كيف نبدأ</a>
              <a href="#subjects">المواد</a>
              <a href="#voices">آراء</a>
              <a href="#faq">الأسئلة</a>
            </nav>
            <div class="l-actions">
              <button class="icon-btn l-theme" id="themeBtn" aria-label="تبديل الوضع الليلي" title="الوضع الليلي">
                <Icon name="moon" class="theme-dark" />
                <Icon name="sun" class="theme-light" />
              </button>
              <a href="/login" class="btn btn-ghost l-login">
                <Icon name="log-out" class="flip" /> دخول
              </a>
              <a href="#book" class="btn btn-shine hide-sm">
                احجز حصة مجانية
              </a>
            </div>
          </div>
        </header>

        <main id="main">
          {/* ============ البطل ============ */}
          <section class="hero" aria-labelledby="hero-title">
            <div class="hero-bg" aria-hidden="true">
              <span class="orb o1"></span>
              <span class="orb o2"></span>
              <span class="orb o3"></span>
              <span class="grid-lines"></span>
              <span class="noise"></span>
            </div>
            <div class="wrap hero-grid">
              <div class="hero-copy">
                <span class="pill" data-reveal>
                  <span class="pill-dot"></span>
                  التسجيل مفتوح للفصل الدراسي الحالي
                </span>
                <h1 id="hero-title" data-reveal style="--d:80ms">
                  دروس تقوية <span class="hl">مباشرة</span>
                  <br />
                  تصنع الفرق في <span class="underline">مستوى ابنك</span>
                </h1>
                <p class="lead" data-reveal style="--d:160ms">
                  حصص حيّة مع معلمات متميزات، فصول من 2 إلى 7 طلاب، تسجيل لكل حصة، وواجبات ومتابعة — كل شيء في منصة واحدة وبدون واتساب.
                </p>
                <div class="hero-cta" data-reveal style="--d:240ms">
                  <a href="#book" class="btn btn-shine btn-xl" data-magnet>
                    احجز حصة تجريبية مجانية
                    <Icon name="arrow-left" />
                  </a>
                  <a href="/login" class="btn btn-glass btn-xl">
                    <Icon name="circle-play" /> دخول المنصة
                  </a>
                </div>
                <ul class="hero-proof" data-reveal style="--d:320ms">
                  <li>
                    <Icon name="badge-check" /> بدون أي التزام
                  </li>
                  <li>
                    <Icon name="monitor-smartphone" /> جوال • آيباد • لابتوب
                  </li>
                  <li>
                    <Icon name="lock" /> خصوصية كاملة
                  </li>
                </ul>
              </div>

              {/* معاينة الحصة الحيّة */}
              <div class="stage" data-reveal="zoom" style="--d:200ms" aria-hidden="true">
                <div class="device" data-tilt>
                  <div class="device-top">
                    <span class="dots">
                      <i></i>
                      <i></i>
                      <i></i>
                    </span>
                    <span class="badge live">مباشر</span>
                    <b>الرياضيات — الثالث المتوسط</b>
                    <span class="timer num">
                      <Icon name="timer" /> <span data-clock>24:18</span>
                    </span>
                  </div>
                  <div class="device-body">
                    <div class="board">
                      <div class="board-grid"></div>
                      <div class="eq e1">س² + ٥س + ٦ = ٠</div>
                      <div class="eq e2">(س + ٢)(س + ٣) = ٠</div>
                      <div class="eq e3">س = −٢ ، س = −٣</div>
                      <svg class="scribble" viewBox="0 0 200 40" fill="none">
                        <path d="M5 30 C 40 5, 80 45, 120 18 S 180 10, 195 25" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                      </svg>
                    </div>
                    <div class="people">
                      {[
                        ['ن', 'أ. نورة', '#5b3df5', true],
                        ['ر', 'ريم', '#0d9488', false],
                        ['س', 'سارة', '#db2777', false],
                        ['ج', 'جود', '#c77800', false],
                      ].map(([ch, n, col, speaking]) => (
                        <div class={`p${speaking ? ' speaking' : ''}`} style={`--c:${col}`}>
                          <span class="av">{ch}</span>
                          <small>{n}</small>
                          {speaking && (
                            <span class="wave">
                              <i></i>
                              <i></i>
                              <i></i>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div class="device-bar">
                    <span>
                      <Icon name="mic" />
                    </span>
                    <span>
                      <Icon name="camera" />
                    </span>
                    <span class="on">
                      <Icon name="hand" />
                    </span>
                    <span>
                      <Icon name="message-circle" />
                    </span>
                    <span class="end">إنهاء</span>
                  </div>
                </div>

                <div class="float f1">
                  <span class="ft tone-ok">
                    <Icon name="circle-check" />
                  </span>
                  <div>
                    <b>تم تسليم الواجب</b>
                    <small>ريم • قبل دقيقتين</small>
                  </div>
                </div>
                <div class="float f2">
                  <span class="ft tone-teal">
                    <Icon name="clapperboard" />
                  </span>
                  <div>
                    <b>التسجيل جاهز</b>
                    <small>متاح 48 ساعة</small>
                  </div>
                </div>
                <div class="float f3">
                  <div class="ring-sm" style="--p:96">
                    <span class="num">96%</span>
                  </div>
                  <div>
                    <b>نسبة الحضور</b>
                    <small>هذا الشهر</small>
                  </div>
                </div>
              </div>
            </div>

            {/* شريط المواد المتحرك */}
            <div class="marquee" aria-hidden="true">
              <div class="marquee-track">
                {[...subjects, ...subjects].map((s) => (
                  <span>
                    <Icon name={s.i} /> {s.t}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* ============ الأرقام ============ */}
          <section class="numbers" aria-label="أرقام المنصة">
            <div class="wrap nums">
              {[
                ['14', '+', 'معلمة متخصصة', 'presentation'],
                ['7', '', 'طلاب كحد أقصى في الفصل', 'users'],
                ['48', 'س', 'تسجيل متاح لكل حصة', 'clapperboard'],
                ['96', '%', 'متوسط نسبة الحضور', 'chart-no-axes-combined'],
              ].map(([v, suf, t, i], k) => (
                <div class="num-card" data-reveal style={`--d:${k * 80}ms`}>
                  <span class="nc-ico">
                    <Icon name={i as IconName} />
                  </span>
                  <b>
                    <span class="num" data-count={v}>
                      {v}
                    </span>
                    <em>{suf}</em>
                  </b>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ============ المميزات (Bento) ============ */}
          <section id="features" class="sec" aria-labelledby="f-title">
            <div class="wrap">
              <div class="sec-head" data-reveal>
                <span class="eyebrow">
                  <Icon name="sparkles" /> لماذا إضاءات
                </span>
                <h2 id="f-title">كل اللي يحتاجه الطالب في مكان واحد</h2>
                <p>صممنا المنصة عشان يركز الطالب على التعلم، والمعلمة على الشرح، وولي الأمر يطمئن.</p>
              </div>
              <div class="bento">
                {features.map((f, k) => (
                  <article class={`b-card tone-${f.tone}${f.big ? ' big' : ''}`} data-reveal style={`--d:${k * 70}ms`} data-spot>
                    <span class="b-ico">
                      <Icon name={f.i} />
                    </span>
                    <h3>{f.t}</h3>
                    <p>{f.d}</p>
                    {f.i === 'radio-tower' && (
                      <div class="b-visual live-vis" aria-hidden="true">
                        {['#5b3df5', '#0d9488', '#db2777', '#c77800', '#2563eb'].map((c, j) => (
                          <span style={`--c:${c};--j:${j}`}></span>
                        ))}
                        <em class="badge live">مباشر</em>
                      </div>
                    )}
                    {f.i === 'users-round' && (
                      <div class="b-visual report-vis" aria-hidden="true">
                        {[62, 78, 70, 88, 94].map((h, j) => (
                          <i style={`--h:${h}%;--j:${j}`}></i>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* ============ لمن؟ ============ */}
          <section class="sec alt" aria-labelledby="who-title">
            <div class="wrap">
              <div class="sec-head" data-reveal>
                <span class="eyebrow">
                  <Icon name="heart-handshake" /> تجربة لكل طرف
                </span>
                <h2 id="who-title">منصة واحدة، ثلاث تجارب مصممة بعناية</h2>
              </div>
              <div class="who">
                {(
                  [
                    ['graduation-cap', 'للطالب', 'brand', ['دخول الحصة بضغطة من أي جهاز', 'تسجيلات لما تفوته حصة', 'واجبات وتصحيح وملاحظات']],
                    ['users-round', 'لولي الأمر', 'teal', ['متابعة الحضور والمستوى', 'أقساط واضحة وتذكير محترم', 'تواصل مباشر مع الإدارة']],
                    ['presentation', 'للمعلمة', 'pink', ['جدول حصص منظم تلقائياً', 'تسجيل الحصة ورفعها بضغطة', 'مستحقات شفافة أولاً بأول']],
                  ] as [IconName, string, string, string[]][]
                ).map(([i, t, tone, pts], k) => (
                  <div class={`who-card tone-${tone}`} data-reveal style={`--d:${k * 90}ms`}>
                    <span class="b-ico">
                      <Icon name={i} />
                    </span>
                    <h3>{t}</h3>
                    <ul class="checks">
                      {pts.map((p) => (
                        <Check>{p}</Check>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ============ خطوات البدء ============ */}
          <section id="how" class="sec" aria-labelledby="how-title">
            <div class="wrap">
              <div class="sec-head" data-reveal>
                <span class="eyebrow">
                  <Icon name="rocket" /> ٤ خطوات بسيطة
                </span>
                <h2 id="how-title">كيف نبدأ؟</h2>
              </div>
              <ol class="steps">
                {steps.map((s, k) => (
                  <li class="step" data-reveal style={`--d:${k * 100}ms`}>
                    <span class="step-n" aria-hidden="true">{k + 1}</span>
                    <span class="b-ico">
                      <Icon name={s.i} />
                    </span>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ============ المواد ============ */}
          <section id="subjects" class="sec alt" aria-labelledby="sub-title">
            <div class="wrap">
              <div class="sec-head" data-reveal>
                <span class="eyebrow">
                  <Icon name="book-open" /> المسارات
                </span>
                <h2 id="sub-title">المواد والمسارات</h2>
                <p>من التأسيس إلى القدرات والتحصيلي — نغطي أهم المواد لكل المراحل.</p>
              </div>
              <div class="subjects">
                {subjects.map((s, k) => (
                  <a href="#book" class="subj" data-subject={s.t} data-reveal style={`--d:${k * 45}ms`}>
                    <span class="b-ico">
                      <Icon name={s.i} />
                    </span>
                    <span>{s.t}</span>
                    <Icon name="arrow-left" class="go" />
                  </a>
                ))}
              </div>
            </div>
          </section>

          {/* ============ الآراء ============ */}
          <section id="voices" class="sec" aria-labelledby="v-title">
            <div class="wrap">
              <div class="sec-head" data-reveal>
                <span class="eyebrow">
                  <Icon name="message-square-quote" /> من أهالينا وطلابنا
                </span>
                <h2 id="v-title">ثقة نعتز فيها</h2>
              </div>
              <div class="voices">
                {testimonials.map((t, k) => (
                  <figure class="voice" data-reveal style={`--d:${k * 90}ms`}>
                    <div class="stars" aria-label="تقييم 5 من 5">
                      {[0, 1, 2, 3, 4].map(() => (
                        <Icon name="star" />
                      ))}
                    </div>
                    <blockquote>«{t.q}»</blockquote>
                    <figcaption>
                      <span class="av">{t.n.charAt(0) === 'أ' ? t.n.split(' ')[1].charAt(0) : t.n.charAt(0)}</span>
                      <span>
                        <b>{t.n}</b>
                        <small>{t.r}</small>
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>

          {/* ============ الحجز ============ */}
          <section id="book" class="sec book" aria-labelledby="book-title">
            <div class="book-bg" aria-hidden="true">
              <span class="orb o1"></span>
              <span class="orb o2"></span>
              <span class="grid-lines"></span>
            </div>
            <div class="wrap book-grid">
              <div data-reveal>
                <span class="eyebrow light">
                  <Icon name="party-popper" /> الحصة الأولى علينا
                </span>
                <h2 id="book-title">احجز حصتك التجريبية المجانية</h2>
                <p>اترك بياناتك وتتواصل معك الإدارة لتحديد موعد الحصة التجريبية ومستوى الطالب.</p>
                <ul class="checks light">
                  <Check>بدون أي التزام</Check>
                  <Check>تقييم مستوى مجاني</Check>
                  <Check>تجربة المنصة كاملة</Check>
                </ul>
                <div class="book-contact">
                  <span class="b-ico">
                    <Icon name="clock" />
                  </span>
                  <span>
                    <b>نرد خلال يوم عمل</b>
                    <small>من الأحد إلى الخميس، ٩ص – ٩م</small>
                  </span>
                </div>
              </div>
              <form method="post" action="/lead" class="book-form" data-reveal="zoom" style="--d:120ms" id="bookForm">
                <div class="bf-head">
                  <span class="b-ico">
                    <Icon name="calendar-plus" />
                  </span>
                  <div>
                    <b>بيانات الحجز</b>
                    <small>أقل من دقيقة</small>
                  </div>
                </div>
                {sent === 'ok' && (
                  <div class="alert ok">
                    <Icon name="circle-check" />
                    <div>تم استلام طلبك، بنتواصل معك قريباً بإذن الله.</div>
                  </div>
                )}
                {sent === 'bad' && (
                  <div class="alert bad">
                    <Icon name="circle-alert" />
                    <div>تأكد من الاسم ورقم الجوال (05xxxxxxxx).</div>
                  </div>
                )}
                <div class="field">
                  <label for="l-name">اسم الطالب</label>
                  <div class="input-icon">
                    <Icon name="user" />
                    <input id="l-name" name="name" required minlength={2} maxlength={80} autocomplete="name" placeholder="الاسم الثلاثي" />
                  </div>
                </div>
                <div class="field">
                  <label for="l-phone">جوال ولي الأمر</label>
                  <div class="input-icon">
                    <Icon name="phone" />
                    <input id="l-phone" name="phone" required inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" autocomplete="tel" pattern="0?5[0-9]{8}|(\+?966)5[0-9]{8}" />
                  </div>
                </div>
                <div class="form-grid">
                  <div class="field">
                    <label for="l-grade">المرحلة</label>
                    <select id="l-grade" name="grade">
                      {['ابتدائي', 'متوسط', 'ثانوي', 'جامعي', 'أخرى'].map((g) => (
                        <option>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div class="field">
                    <label for="l-sub">المادة</label>
                    <select id="l-sub" name="subject">
                      {subjects.map((s) => (
                        <option>{s.t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <input type="text" name="website" class="sr-only" tabindex={-1} autocomplete="off" aria-hidden="true" />
                <button class="btn btn-shine btn-xl btn-block">
                  أرسل الطلب <Icon name="send" class="flip" />
                </button>
                <p class="bf-note">
                  <Icon name="lock" /> بياناتك لا تُشارك مع أي طرف.
                </p>
              </form>
            </div>
          </section>

          {/* ============ الأسئلة ============ */}
          <section id="faq" class="sec" aria-labelledby="faq-title">
            <div class="wrap narrow">
              <div class="sec-head" data-reveal>
                <span class="eyebrow">
                  <Icon name="circle-help" /> عندك سؤال؟
                </span>
                <h2 id="faq-title">أسئلة شائعة</h2>
              </div>
              {faqs.map((f, k) => (
                <details class="drop faq" data-reveal style={`--d:${k * 60}ms`}>
                  <summary>{f.q}</summary>
                  <div>{f.a}</div>
                </details>
              ))}
            </div>
          </section>

          {/* ============ دعوة أخيرة ============ */}
          <section class="final" aria-label="ابدأ الآن">
            <div class="wrap">
              <div class="final-card" data-reveal="zoom">
                <div>
                  <h2>جاهز تشوف الفرق بنفسك؟</h2>
                  <p>الحصة التجريبية مجانية بالكامل — جرّب المنصة والمعلمة والفصل قبل أي قرار.</p>
                </div>
                <a href="#book" class="btn btn-shine btn-xl" data-magnet>
                  احجز الآن <Icon name="arrow-left" />
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer class="l-foot">
          <div class="wrap foot-grid">
            <div>
              <a href="/" class="l-brand">
                <Logo size={34} />
                <span>إضاءات</span>
              </a>
              <p>دروس تقوية مباشرة بفصول صغيرة، تسجيلات محمية، وواجبات ومتابعة — في منصة واحدة.</p>
            </div>
            <nav aria-label="روابط">
              <b>المنصة</b>
              <a href="#features">المميزات</a>
              <a href="#how">كيف نبدأ</a>
              <a href="#faq">الأسئلة</a>
            </nav>
            <nav aria-label="حسابي">
              <b>حسابي</b>
              <a href="/login">تسجيل الدخول</a>
              <a href="#book">حجز حصة تجريبية</a>
            </nav>
          </div>
          <div class="wrap foot-bottom">
            <small>© {new Date().getFullYear()} منصة إضاءات التعليمية — جميع الحقوق محفوظة</small>
            <small class="made">
              صُنع بـ <Icon name="heart" /> للتعليم
            </small>
          </div>
        </footer>

        <a href="#book" class="float-cta" id="floatCta">
          <Icon name="calendar-plus" /> احجز حصة مجانية
        </a>
        <div class="scroll-progress" id="scrollProgress" aria-hidden="true"></div>
        <script src={`/static/app.js?v=${ASSET_V}`} defer></script>
        <script src={`/static/landing.js?v=${ASSET_V}`} defer></script>
      </body>
    </html>
  )
}
