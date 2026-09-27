/** تفاعلات الموقع التعريفي — خفيفة (بدون مكتبات)، تحترم reduced-motion، وتعمل بتحسين تدريجي */
;(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(pointer: fine)').matches
  document.documentElement.classList.add('js')

  // ---- الظهور عند التمرير ----
  const reveals = $$('[data-reveal]')
  if (reduce || !('IntersectionObserver' in window)) reveals.forEach((el) => el.classList.add('in'))
  else {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    reveals.forEach((el) => io.observe(el))
  }

  // ---- الشريط العلوي + شريط التقدم + زر الحجز العائم ----
  const nav = $('#lnav'), sp = $('#scrollProgress'), cta = $('#floatCta'), book = $('#book')
  let ticking = false
  const onScroll = () => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight
    nav?.classList.toggle('scrolled', y > 12)
    sp?.style.setProperty('--sp', String(h > 0 ? y / h : 0))
    if (cta && book) {
      const r = book.getBoundingClientRect()
      cta.classList.toggle('show', y > 520 && !(r.top < innerHeight && r.bottom > 0))
    }
    ticking = false
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll) } }, { passive: true })
  onScroll()

  // ---- تمييز القسم الحالي في القائمة ----
  const links = $$('.l-links a')
  if ('IntersectionObserver' in window && links.length) {
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))
    const so = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.remove('on')); map.get(e.target.id)?.classList.add('on') } }),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    map.forEach((_, id) => { const s = document.getElementById(id); s && so.observe(s) })
  }

  // ---- اختيار المادة من البطاقة يعبّي النموذج ----
  $$('[data-subject]').forEach((a) => a.addEventListener('click', () => {
    const sel = $('#l-sub'); if (sel) sel.value = a.dataset.subject
    setTimeout(() => $('#l-name')?.focus({ preventScroll: true }), 600)
  }))

  // ---- ساعة الحصة في المعاينة ----
  const clock = $('[data-clock]')
  if (clock && !reduce) {
    let s = 24 * 60 + 18
    setInterval(() => { s++; clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }, 1000)
  }

  if (reduce || !fine) return

  // ---- إضاءة تتبع المؤشر على البطاقات ----
  $$('[data-spot]').forEach((el) => el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }))

  // ---- إمالة ثلاثية الأبعاد للجهاز ----
  const tilt = $('[data-tilt]')
  const stage = tilt?.parentElement
  if (tilt && stage && innerWidth > 980) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
      tilt.style.transform = `rotateY(${-8 + x * 10}deg) rotateX(${4 - y * 8}deg)`
    })
    stage.addEventListener('pointerleave', () => { tilt.style.transform = '' })
  }

  // ---- أزرار مغناطيسية ----
  $$('[data-magnet]').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect()
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.12}px, ${(e.clientY - r.top - r.height / 2) * 0.2 - 2}px)`
    })
    b.addEventListener('pointerleave', () => { b.style.transform = '' })
  })
})()
