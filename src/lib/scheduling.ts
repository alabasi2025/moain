/**
 * توزيع قاعات الزوم: أول قاعة فاضية في وقت الحصة، وإلا البث الخاص.
 * التحقق من التداخل يتم في قاعدة البيانات لضمان عدم إعطاء قاعة واحدة لحصتين.
 */
import { randomHex } from './security'

export interface Allocation {
  provider: 'zoom' | 'jitsi'
  zoom_room_id: number | null
}

/**
 * يرجع أول قاعة زوم نشطة ليس عليها حصة متداخلة (غير ملغاة) في المجال [startsAt, endsAt).
 * `excludeLessonId` لاستثناء الحصة نفسها عند التعديل.
 */
export async function findFreeZoomRoom(
  db: D1Database,
  startsAt: number,
  endsAt: number,
  excludeLessonId = 0,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT r.id FROM zoom_rooms r
       WHERE r.active = 1 AND NOT EXISTS (
         SELECT 1 FROM lessons l
         WHERE l.zoom_room_id = r.id AND l.status != 'cancelled' AND l.id != ?3
           AND l.starts_at < ?2 AND ?1 < l.ends_at
       )
       ORDER BY r.id LIMIT 1`,
    )
    .bind(startsAt, endsAt, excludeLessonId)
    .first<{ id: number }>()
  return row?.id ?? null
}

export async function allocate(
  db: D1Database,
  preference: 'auto' | 'zoom' | 'jitsi',
  startsAt: number,
  endsAt: number,
): Promise<Allocation | { error: string }> {
  if (preference === 'jitsi') return { provider: 'jitsi', zoom_room_id: null }
  const room = await findFreeZoomRoom(db, startsAt, endsAt)
  if (room) return { provider: 'zoom', zoom_room_id: room }
  if (preference === 'zoom') return { error: 'كل قاعات الزوم محجوزة في هذا الوقت. اختاري «تلقائي» لتحويل الحصة للبث الخاص.' }
  return { provider: 'jitsi', zoom_room_id: null }
}

/** اسم غرفة البث: بادئة + 20 حرفاً عشوائياً (غير قابل للتخمين) */
export const newRoomKey = () => `edaat-${randomHex(10)}`
