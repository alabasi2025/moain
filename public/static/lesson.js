/**
 * صفحة الحصة:
 *  1) تضمين غرفة البث (Jitsi IFrame API) داخل المنصة
 *  2) مسجّل الحصة: MediaRecorder لتبويب/شاشة المعلمة + رفع مجزّأ إلى R2 أثناء الحصة
 *  3) رفع ملف تسجيل جاهز (من الزوم أو الجهاز) بنفس الرفع المجزّأ
 */
import { patchWebmDuration } from '/static/webm-duration.js'

// ================= 1) غرفة البث =================
function mountJitsi() {
  const el = document.getElementById('jitsiRoom')
  if (!el) return
  const start = () => {
    if (!window.JitsiMeetExternalAPI) return setTimeout(start, 200)
    const host = el.dataset.host === '1'
    const opts = {
      roomName: el.dataset.room,
      parentNode: el,
      width: '100%',
      height: '100%',
      lang: 'ar',
      userInfo: { displayName: el.dataset.name },
      configOverwrite: {
        prejoinConfig: { enabled: false },
        disableDeepLinking: true, // على الجوال: يعمل في المتصفح بدون طلب تثبيت تطبيق
        startWithAudioMuted: !host,
        startWithVideoMuted: !host,
        disableInviteFunctions: true,
        hideConferenceSubject: false,
        subject: document.querySelector('h1')?.textContent || '',
        enableWelcomePage: false,
        enableClosePage: false,
        fileRecordingsEnabled: false,
        liveStreamingEnabled: false,
        toolbarButtons: host
          ? ['microphone', 'camera', 'desktop', 'chat', 'raisehand', 'participants-pane', 'tileview', 'mute-everyone', 'settings', 'fullscreen', 'hangup', 'whiteboard']
          : ['microphone', 'camera', 'chat', 'raisehand', 'tileview', 'fullscreen', 'hangup'],
      },
      interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false, SHOW_WATERMARK_FOR_GUESTS: false, MOBILE_APP_PROMO: false },
    }
    if (el.dataset.jwt) opts.jwt = el.dataset.jwt
    const api = new window.JitsiMeetExternalAPI(el.dataset.domain, opts)
    api.addListener('readyToClose', () => (location.href = host ? '/teacher' : '/student'))
    window.__jitsi = api
  }
  start()
}

// ================= 2 + 3) الرفع المجزّأ =================
const bar = document.getElementById('recBar')
const $ = (id) => document.getElementById(id)
const setStatus = (t, tone) => {
  const s = $('recStatus')
  if (!s) return
  s.textContent = t
  s.style.color = tone === 'bad' ? 'var(--bad)' : tone === 'ok' ? 'var(--ok)' : ''
}
const setProgress = (ratio) => {
  const w = $('recProgWrap')
  if (!w) return
  w.hidden = ratio == null
  $('recProg').style.width = `${Math.round((ratio || 0) * 100)}%`
}

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`)
  return data
}

/** رافع مجزّأ: يستقبل بيانات متدفقة ويقسمها لأجزاء ثابتة الحجم (شرط R2) مع إعادة المحاولة */
class ChunkUploader {
  constructor(lessonId, mime, source) {
    this.lessonId = lessonId
    this.mime = mime
    this.source = source
    this.buffer = []
    this.buffered = 0
    this.partNo = 0
    this.queue = Promise.resolve()
    this.uploadedBytes = 0
    this.failed = null
    this.firstPart = null // نحتفظ بالجزء الأول لإعادة رفعه مع مدة الفيديو
  }
  async init() {
    const r = await api(`/api/lessons/${this.lessonId}/recordings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mime: this.mime, source: this.source }),
    })
    this.id = r.id
    this.partSize = r.partSize
  }
  push(blob) {
    this.buffer.push(blob)
    this.buffered += blob.size
    while (this.buffered >= this.partSize) this._flush(false)
  }
  _flush(final) {
    if (!this.buffered) return
    const all = new Blob(this.buffer, { type: this.mime })
    const take = final ? all.size : this.partSize
    const part = all.slice(0, take)
    const rest = all.slice(take)
    this.buffer = rest.size ? [rest] : []
    this.buffered = rest.size
    const n = ++this.partNo
    if (n === 1) this.firstPart = part
    this.queue = this.queue.then(() => this._send(n, part))
  }
  async _send(n, blob, attempt = 1) {
    if (this.failed) return
    try {
      const res = await fetch(`/api/recordings/${this.id}/parts/${n}`, { method: 'PUT', body: blob, credentials: 'same-origin' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status)
      this.uploadedBytes += blob.size
      this.onProgress?.(this.uploadedBytes)
    } catch (e) {
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
        return this._send(n, blob, attempt + 1)
      }
      this.failed = e
    }
  }
  async finish(durationMs) {
    this._flush(true)
    await this.queue
    if (this.failed) throw this.failed
    // إضافة مدة الفيديو في رأس WebM (نفس الطول بالضبط) ثم إعادة رفع الجزء الأول
    if (durationMs && this.firstPart && this.mime.includes('webm')) {
      const head = new Uint8Array(await this.firstPart.arrayBuffer())
      const patched = patchWebmDuration(head, durationMs)
      if (patched !== head && patched.length === head.length) {
        this.uploadedBytes -= head.length
        await this._send(1, new Blob([patched], { type: this.mime }))
        if (this.failed) throw this.failed
      }
    }
    return api(`/api/recordings/${this.id}/complete`, { method: 'POST' })
  }
  abort() {
    if (this.id) navigator.sendBeacon?.(`/api/recordings/${this.id}/abort`)
  }
}

const fmtMB = (b) => `${(b / 1048576).toFixed(1)} MB`
const fmtClock = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function pickMime() {
  const c = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
}

function setupRecorder() {
  if (!bar) return
  const lessonId = bar.dataset.lesson
  const startBtn = $('recStart')
  const stopBtn = $('recStop')
  let rec, stream, uploader, t0, timer

  const stopAll = () => {
    clearInterval(timer)
    stream?.getTracks().forEach((t) => t.stop())
    $('recDot')?.classList.remove('on')
  }

  startBtn?.addEventListener('click', async () => {
    const mime = pickMime()
    if (!mime || !navigator.mediaDevices?.getDisplayMedia) {
      setStatus('المتصفح لا يدعم التسجيل. استخدمي Chrome أو Edge على اللابتوب، أو سجّلي بأي برنامج وارفعي الملف.', 'bad')
      return
    }
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15, width: { max: 1280 }, height: { max: 720 } },
        audio: { echoCancellation: false, noiseSuppression: false },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include',
      })
      // دمج صوت الميكروفون مع صوت التبويب حتى يُسمع صوت المعلمة والطالبات في التسجيل
      let mic
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {}
      const tracks = [...stream.getVideoTracks()]
      const audioSources = [...stream.getAudioTracks(), ...(mic ? mic.getAudioTracks() : [])]
      if (audioSources.length) {
        const ctx = new AudioContext()
        const dest = ctx.createMediaStreamDestination()
        audioSources.forEach((t) => ctx.createMediaStreamSource(new MediaStream([t])).connect(dest))
        tracks.push(...dest.stream.getAudioTracks())
      }
      if (!stream.getAudioTracks().length) setStatus('تنبيه: لم تتم مشاركة صوت التبويب — سيُسجَّل صوتك فقط.', 'bad')
      const mixed = new MediaStream(tracks)
      mic?.getAudioTracks().forEach((t) => stream.addTrack(t)) // حتى تُغلق مع باقي المسارات

      uploader = new ChunkUploader(lessonId, mime.split(';')[0], 'browser')
      await uploader.init()
      uploader.onProgress = (b) => setStatus(`جارِ التسجيل… ${fmtClock(Date.now() - t0)} — تم رفع ${fmtMB(b)} تلقائياً`)
      rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 })
      rec.ondataavailable = (e) => e.data.size && uploader.push(e.data)
      rec.onstop = async () => {
        stopAll()
        const dur = Date.now() - t0
        startBtn.hidden = false
        stopBtn.hidden = true
        setStatus('جارِ إنهاء الرفع… لا تغلقي الصفحة')
        try {
          await uploader.finish(dur)
          setStatus('✅ تم حفظ التسجيل! متاح للطلاب لمدة 48 ساعة.', 'ok')
          window.onbeforeunload = null
          setTimeout(() => location.reload(), 1800)
        } catch (e) {
          setStatus('تعذر إكمال الرفع: ' + e.message, 'bad')
        }
      }
      stream.getVideoTracks()[0].addEventListener('ended', () => rec.state !== 'inactive' && rec.stop())
      rec.start(4000) // جزء كل 4 ثوانٍ ⇐ يتجمع ويُرفع كل 8MB
      t0 = Date.now()
      timer = setInterval(() => uploader && setStatus(`جارِ التسجيل… ${fmtClock(Date.now() - t0)} — تم رفع ${fmtMB(uploader.uploadedBytes)}`), 1000)
      $('recDot').classList.add('on')
      $('recTitle').textContent = 'التسجيل يعمل'
      startBtn.hidden = true
      stopBtn.hidden = false
      window.onbeforeunload = () => 'التسجيل يعمل، هل تريدين المغادرة؟'
    } catch (e) {
      stopAll()
      if (e?.name !== 'NotAllowedError') setStatus('تعذر بدء التسجيل: ' + (e.message || e), 'bad')
    }
  })
  stopBtn?.addEventListener('click', () => rec && rec.state !== 'inactive' && rec.stop())

  // رفع ملف جاهز
  $('recFile')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0]
    if (!file) return
    if (!/^video\//.test(file.type)) return setStatus('اختاري ملف فيديو (MP4 أو WebM).', 'bad')
    const mime = file.type === 'video/x-matroska' ? 'video/x-matroska' : file.type
    try {
      const up = new ChunkUploader(lessonId, mime, 'upload')
      await up.init()
      window.onbeforeunload = () => 'جارِ الرفع…'
      let off = 0
      up.onProgress = (b) => {
        setProgress(b / file.size)
        setStatus(`جارِ الرفع… ${Math.round((b / file.size) * 100)}% (${fmtMB(b)} من ${fmtMB(file.size)})`)
      }
      setProgress(0)
      while (off < file.size) {
        const end = Math.min(off + up.partSize, file.size)
        up.push(file.slice(off, end))
        off = end
        await up.queue // لا نحمّل الملف كاملاً في الذاكرة
        if (up.failed) throw up.failed
      }
      await up.finish(0)
      window.onbeforeunload = null
      setProgress(1)
      setStatus('✅ تم رفع التسجيل! متاح للطلاب لمدة 48 ساعة.', 'ok')
      setTimeout(() => location.reload(), 1500)
    } catch (e) {
      window.onbeforeunload = null
      setStatus('تعذر الرفع: ' + e.message, 'bad')
    }
  })
}

mountJitsi()
setupRecorder()
