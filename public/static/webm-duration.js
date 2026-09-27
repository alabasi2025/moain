/**
 * إضافة مدة الفيديو (Duration) لملفات WebM الناتجة من MediaRecorder — مع الحفاظ على نفس طول الملف بالضبط.
 *
 * لماذا؟ MediaRecorder يكتب الملف بدون Duration، فيظهر المشغل بلا مدة ويصعب التقديم.
 * لماذا بنفس الطول؟ رفع R2 المجزّأ يشترط أن تكون كل الأجزاء بنفس الحجم (ما عدا الأخير)،
 * فنعيد رفع الجزء الأول بعد التعديل دون تغيير حجمه:
 *   - نضيف Duration (11 بايت)
 *   - نعوّض بحذف MuxingApp / WritingApp (نصوص "Chrome" غير ضرورية للتشغيل) عند الحاجة
 *   - نملأ الفرق بعنصر Void (0xEC) المسموح به في أي مكان حسب مواصفة Matroska
 * بدون مكتبات، ويعمل في المتصفح وNode.
 */

const ID_EBML = 0x1a45dfa3
const ID_SEGMENT = 0x18538067
const ID_INFO = 0x1549a966
const ID_TIMECODE_SCALE = 0x2ad7b1
const ID_DURATION = 0x4489
const ID_MUXING_APP = 0x4d80
const ID_WRITING_APP = 0x5741
const ID_VOID = 0xec
const ID_CLUSTER = 0x1f43b675

function readId(b, p) {
  const f = b[p]
  const len = f & 0x80 ? 1 : f & 0x40 ? 2 : f & 0x20 ? 3 : f & 0x10 ? 4 : 0
  if (!len) throw new Error('bad id')
  let v = 0
  for (let i = 0; i < len; i++) v = v * 256 + b[p + i]
  return { value: v, len }
}

function readSize(b, p) {
  const f = b[p]
  let len = 1
  while (len <= 8 && !(f & (0x80 >> (len - 1)))) len++
  if (len > 8) throw new Error('bad size')
  let v = f & (0xff >> len)
  let allOnes = v === 0xff >> len
  for (let i = 1; i < len; i++) {
    v = v * 256 + b[p + i]
    if (b[p + i] !== 0xff) allOnes = false
  }
  return { value: allOnes ? -1 : v, len }
}

function readUint(b, p, len) {
  let v = 0
  for (let i = 0; i < len; i++) v = v * 256 + b[p + i]
  return v
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0))
  let o = 0
  for (const x of parts) {
    out.set(x, o)
    o += x.length
  }
  return out
}

/** عنصر Void بطول إجمالي n بايت (n >= 2) */
function voidElement(n) {
  if (n < 2) return null
  if (n - 2 <= 126) {
    const v = new Uint8Array(n)
    v[0] = ID_VOID
    v[1] = 0x80 | (n - 2)
    return v
  }
  const v = new Uint8Array(n) // حجم بترميز 2 بايت
  v[0] = ID_VOID
  const size = n - 3
  v[1] = 0x40 | (size >> 8)
  v[2] = size & 0xff
  return v
}

/**
 * @param {Uint8Array} head بداية الملف (يجب أن تحتوي عنصر Info كاملاً — أول 8MB أكثر من كافية)
 * @param {number} durationMs المدة بالمللي ثانية
 * @returns {Uint8Array} نسخة معدّلة بنفس الطول تماماً، أو الأصل دون تغيير إن تعذر ذلك بأمان
 */
export function patchWebmDuration(head, durationMs) {
  try {
    const b = head
    let p = 0
    const e = readId(b, p)
    if (e.value !== ID_EBML) return head
    p += e.len
    const es = readSize(b, p)
    p += es.len + es.value
    const seg = readId(b, p)
    if (seg.value !== ID_SEGMENT) return head
    p += seg.len
    p += readSize(b, p).len

    while (p < b.length) {
      const id = readId(b, p)
      const size = readSize(b, p + id.len)
      const bodyStart = p + id.len + size.len
      if (id.value === ID_CLUSTER || size.value < 0) return head
      const bodyEnd = bodyStart + size.value
      if (id.value !== ID_INFO) {
        p = bodyEnd
        continue
      }
      if (bodyEnd > b.length) return head

      let scale = 1_000_000
      const kept = [] // عناصر ضرورية
      const optional = [] // عناصر يمكن حذفها لتوفير مساحة
      for (let q = bodyStart; q < bodyEnd; ) {
        const cid = readId(b, q)
        const cs = readSize(b, q + cid.len)
        const cStart = q + cid.len + cs.len
        const cEnd = cStart + cs.value
        const el = b.subarray(q, cEnd)
        if (cid.value === ID_TIMECODE_SCALE) scale = readUint(b, cStart, cs.value)
        if (cid.value === ID_DURATION || cid.value === ID_VOID) {
          /* يُستبدل */
        } else if (cid.value === ID_MUXING_APP || cid.value === ID_WRITING_APP) optional.push(el)
        else kept.push(el)
        q = cEnd
      }

      const dur = new Uint8Array(11)
      dur[0] = 0x44
      dur[1] = 0x89
      dur[2] = 0x88
      new DataView(dur.buffer).setFloat64(3, (durationMs * 1_000_000) / scale, false)

      const target = size.value
      const len = (arr) => arr.reduce((s, x) => s + x.length, 0)
      let opts = [...optional]
      let body = null
      // جرّب مع أكبر عدد من العناصر الاختيارية ثم احذف تدريجياً حتى يصلح الطول
      for (;;) {
        const base = len(kept) + len(opts) + dur.length
        const pad = target - base
        if (pad === 0) {
          body = [...kept, ...opts, dur]
          break
        }
        if (pad >= 2) {
          body = [...kept, ...opts, dur, voidElement(pad)]
          break
        }
        if (!opts.length) return head // لا يمكن الحفاظ على الطول بأمان
        opts = opts.slice(0, -1)
      }
      const newBody = concat(body)
      if (newBody.length !== target) return head
      const out = new Uint8Array(b) // نسخة
      out.set(newBody, bodyStart)
      return out
    }
    return head
  } catch {
    return head
  }
}

/** قراءة المدة المخزنة (بالمللي ثانية) — للاختبارات */
export function readWebmDuration(b) {
  try {
    let p = 0
    p += readId(b, p).len
    const es = readSize(b, p)
    p += es.len + es.value
    p += readId(b, p).len
    p += readSize(b, p).len
    while (p < b.length) {
      const id = readId(b, p)
      const size = readSize(b, p + id.len)
      const bodyStart = p + id.len + size.len
      if (id.value === ID_INFO) {
        let scale = 1_000_000
        let dur = null
        for (let q = bodyStart; q < bodyStart + size.value; ) {
          const cid = readId(b, q)
          const cs = readSize(b, q + cid.len)
          const cStart = q + cid.len + cs.len
          if (cid.value === ID_TIMECODE_SCALE) scale = readUint(b, cStart, cs.value)
          if (cid.value === ID_DURATION)
            dur = cs.value === 8 ? new DataView(b.buffer, b.byteOffset + cStart, 8).getFloat64(0) : new DataView(b.buffer, b.byteOffset + cStart, 4).getFloat32(0)
          q = cStart + cs.value
        }
        return dur === null ? null : (dur * scale) / 1_000_000
      }
      if (size.value < 0) return null
      p = bodyStart + size.value
    }
  } catch {}
  return null
}
