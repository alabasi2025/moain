/** مشغل التسجيل المحمي: علامة مائية متحركة + تعطيل التحميل والقائمة واختصارات الحفظ */
const player = document.getElementById('player')
const wm = document.getElementById('wm')
const vid = document.getElementById('vid')
if (player && wm) {
  const move = () => {
    const maxX = Math.max(0, player.clientWidth - wm.offsetWidth - 16)
    const maxY = Math.max(0, player.clientHeight - wm.offsetHeight - 56) // فوق أزرار التحكم
    wm.style.left = `${8 + Math.random() * maxX}px`
    wm.style.top = `${8 + Math.random() * maxY}px`
  }
  move()
  setInterval(move, 7000)
  player.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['s', 'u', 'p'].includes(e.key.toLowerCase())) e.preventDefault()
  })
  // ملء الشاشة للحاوية (وليس للفيديو) حتى تبقى العلامة المائية ظاهرة
  vid?.addEventListener('dblclick', (e) => {
    e.preventDefault()
    document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen?.()
  })
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === vid) {
      document.exitFullscreen().then(() => player.requestFullscreen?.())
    }
  })
  // إيقاف التشغيل عند إخفاء الصفحة (يقلل تسجيل الشاشة في الخلفية)
  document.addEventListener('visibilitychange', () => document.hidden && vid && !vid.paused && vid.pause())
}
