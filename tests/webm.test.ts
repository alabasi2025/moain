import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — ملف JS للمتصفح بدون تعريفات
import { patchWebmDuration, readWebmDuration } from '../public/static/webm-duration.js'

/** ينشئ WebM "مباشر" بدون مدة مثل MediaRecorder (ffmpeg -live 1) */
function liveWebm(): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'webm-'))
  const f = join(dir, 'live.webm')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine', '-t', '4', '-c:v', 'libvpx', '-c:a', 'libopus', '-live', '1', '-f', 'webm', f])
  return new Uint8Array(readFileSync(f))
}

describe('إصلاح مدة WebM', () => {
  const src = liveWebm()
  it('الملف الأصلي بلا مدة (مثل MediaRecorder)', () => {
    expect(readWebmDuration(src)).toBeNull()
  })
  it('يضيف المدة ويحافظ على نفس الطول بالضبط (شرط أجزاء R2)', () => {
    const out = patchWebmDuration(src, 4000)
    expect(out.length).toBe(src.length)
    expect(readWebmDuration(out)).toBeCloseTo(4000, 0)
  })
  it('الملف الناتج صالح ويقرأه ffprobe بالمدة الصحيحة', () => {
    const out = patchWebmDuration(src, 4000)
    const dir = mkdtempSync(join(tmpdir(), 'webm-'))
    const f = join(dir, 'fixed.webm')
    writeFileSync(f, out)
    const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()
    expect(Number(d)).toBeCloseTo(4, 0)
  })
  it('مدخل غير صالح يُرجع كما هو', () => {
    const junk = new Uint8Array([1, 2, 3, 4])
    expect(patchWebmDuration(junk, 1000)).toBe(junk)
  })
})
