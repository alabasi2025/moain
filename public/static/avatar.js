/**
 * محرر صورة الملف الشخصي — بدون مكتبات
 * يفتح نافذة قص مربّع (سحب + تكبير بالعجلة/اللمس/المنزلق)، ثم يصدّر 320×320 WebP (أو JPEG كبديل) ويرفعها.
 * المعايير: هدف لمس ≥ 44px، يعمل بلوحة المفاتيح (الأسهم للتحريك، +/- للتكبير، Esc للإلغاء، Enter للحفظ).
 */
const OUT = 320

function toast(text, type = 'bad') {
  const box = document.getElementById('toasts')
  if (!box) return alert(text)
  const t = document.createElement('div')
  t.className = 'toast'
  t.innerHTML = `<span class="tile tile-sm tone-${type}"></span><div></div>`
  t.querySelector('div').textContent = text
  box.appendChild(t)
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250) }, 4500)
}

function openCropper(img, onDone) {
  const dlg = document.createElement('dialog')
  dlg.className = 'crop-dlg'
  dlg.innerHTML = `
    <form method="dialog" class="crop-box">
      <div class="crop-head"><b>ضبط الصورة</b><small class="muted">اسحب لتحريك الصورة، واستخدم المنزلق للتكبير</small></div>
      <div class="crop-stage" tabindex="0" aria-label="منطقة القص — استخدم الأسهم للتحريك و + - للتكبير">
        <canvas width="${OUT}" height="${OUT}"></canvas>
        <div class="crop-ring" aria-hidden="true"></div>
      </div>
      <label class="crop-zoom" dir="ltr"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="تكبير"><span aria-hidden="true">+</span></label>
      <div class="crop-actions">
        <button value="cancel" class="btn btn-ghost" type="submit">إلغاء</button>
        <button value="ok" class="btn" type="submit" data-save>حفظ الصورة</button>
      </div>
    </form>`
  document.body.appendChild(dlg)
  const cv = dlg.querySelector('canvas'), ctx = cv.getContext('2d'), range = dlg.querySelector('input[type=range]'), stage = dlg.querySelector('.crop-stage')
  const base = OUT / Math.min(img.naturalWidth, img.naturalHeight)
  let zoom = 1, x = 0, y = 0 // x,y = إزاحة مركز الصورة بالبكسل (مساحة الإخراج)

  const clamp = () => {
    const s = base * zoom, w = img.naturalWidth * s, h = img.naturalHeight * s
    const mx = Math.max(0, (w - OUT) / 2), my = Math.max(0, (h - OUT) / 2)
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y))
  }
  const draw = () => {
    clamp()
    const s = base * zoom, w = img.naturalWidth * s, h = img.naturalHeight * s
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (OUT - w) / 2 + x, (OUT - h) / 2 + y, w, h)
  }
  const setZoom = (z) => { zoom = Math.min(4, Math.max(1, z)); range.value = String(zoom); draw() }
  range.addEventListener('input', () => setZoom(+range.value))

  // سحب بالمؤشر (فأرة/لمس/قلم) + قرص بإصبعين
  const pts = new Map(); let pinch0 = 0, zoom0 = 1
  const scale = () => OUT / cv.getBoundingClientRect().width
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom } })
  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return
    if (pts.size === 1) { x += (e.clientX - p.x) * scale(); y += (e.clientY - p.y) * scale(); draw() }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; setZoom(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0) }
  })
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0 }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up)
  stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.93)) }, { passive: false })
  stage.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]
    if (k) { e.preventDefault(); x += k[0]; y += k[1]; draw() }
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1)
    if (e.key === '-') setZoom(zoom - 0.1)
  })

  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'ok') {
      const fallback = () => cv.toBlob((b) => onDone(b, 'jpg'), 'image/jpeg', 0.88)
      cv.toBlob((b) => (b && b.type === 'image/webp' ? onDone(b, 'webp') : fallback()), 'image/webp', 0.86)
    }
    setTimeout(() => dlg.remove(), 300)
  })
  draw()
  dlg.showModal()
  stage.focus()
}

document.querySelectorAll('[data-avatar-editor]').forEach((ed) => {
  const input = ed.querySelector('[data-avatar-input]')
  const action = ed.dataset.action
  input?.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return toast('اختر صورة JPG أو PNG أو WebP.')
    if (file.size > 15 * 1024 * 1024) return toast('الصورة أكبر من 15MB.')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => openCropper(img, async (blob, ext) => {
      URL.revokeObjectURL(url)
      ed.classList.add('uploading')
      const fd = new FormData()
      fd.append('avatar', blob, `avatar.${ext}`)
      try {
        const r = await fetch(action, { method: 'POST', body: fd, headers: { accept: 'application/json' }, credentials: 'same-origin' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'تعذر رفع الصورة')
        location.reload()
      } catch (err) {
        ed.classList.remove('uploading')
        toast(err.message)
      }
    })
    img.onerror = () => { URL.revokeObjectURL(url); toast('تعذر قراءة الصورة. جرّب صورة أخرى.') }
    img.src = url
  })
})

// مقياس قوة كلمة المرور
document.querySelectorAll('[data-strength]').forEach((inp) => {
  const m = document.getElementById(inp.dataset.strength)
  if (!m) return
  const labels = ['ضعيفة جداً', 'ضعيفة', 'مقبولة', 'جيدة', 'قوية']
  inp.addEventListener('input', () => {
    const v = inp.value
    let s = 0
    if (v.length >= 8) s++
    if (v.length >= 12) s++
    if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++
    if (/[^A-Za-z0-9]/.test(v) || /[A-Z]/.test(v) && /[a-z]/.test(v)) s++
    m.dataset.s = v ? String(s) : ''
    m.querySelector('span').textContent = v ? labels[s] : ''
  })
})
