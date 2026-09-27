/** استعلامات مشتركة بين الأدوار */
import type { SessionUser } from './types'

export interface LessonRow {
  id: number
  course_id: number
  course_title: string
  teacher_id: number | null
  teacher_name: string | null
  title: string
  starts_at: number
  ends_at: number
  provider: 'zoom' | 'jitsi'
  zoom_room_id: number | null
  room_name: string | null
  room_key: string
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  started_at: number | null
  students: number
  recordings: number
}

const LESSON_SELECT = `
  SELECT l.id, l.course_id, c.title AS course_title, c.teacher_id, t.name AS teacher_name,
         l.title, l.starts_at, l.ends_at, l.provider, l.zoom_room_id, z.name AS room_name,
         l.room_key, l.status, l.started_at,
         (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = l.course_id AND e.status = 'active') AS students,
         (SELECT COUNT(*) FROM recordings r WHERE r.lesson_id = l.id AND r.status = 'ready' AND r.expires_at > unixepoch()) AS recordings
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  LEFT JOIN users t ON t.id = c.teacher_id
  LEFT JOIN zoom_rooms z ON z.id = l.zoom_room_id`

/** الحصص المرئية للمستخدم في مجال زمني */
export async function lessonsFor(db: D1Database, user: SessionUser, from: number, to: number, limit = 100): Promise<LessonRow[]> {
  let where = `l.starts_at < ?2 AND l.ends_at > ?1`
  const binds: unknown[] = [from, to]
  if (user.role === 'teacher') {
    where += ` AND c.teacher_id = ?3`
    binds.push(user.id)
  } else if (user.role === 'student') {
    where += ` AND EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = l.course_id AND e.student_id = ?3 AND e.status = 'active')`
    binds.push(user.id)
  }
  const r = await db
    .prepare(`${LESSON_SELECT} WHERE ${where} ORDER BY l.starts_at LIMIT ${Math.min(limit, 500)}`)
    .bind(...binds)
    .all<LessonRow>()
  return r.results
}

export async function lessonById(db: D1Database, id: number): Promise<LessonRow | null> {
  return db.prepare(`${LESSON_SELECT} WHERE l.id = ?`).bind(id).first<LessonRow>()
}

export interface CourseOption {
  id: number
  title: string
  teacher_name: string | null
}

export async function coursesFor(db: D1Database, user: SessionUser): Promise<CourseOption[]> {
  const base = `SELECT c.id, c.title, t.name AS teacher_name FROM courses c LEFT JOIN users t ON t.id = c.teacher_id WHERE c.status = 'active'`
  if (user.role === 'admin') return (await db.prepare(`${base} ORDER BY c.title`).all<CourseOption>()).results
  if (user.role === 'teacher') return (await db.prepare(`${base} AND c.teacher_id = ? ORDER BY c.title`).bind(user.id).all<CourseOption>()).results
  return (
    await db
      .prepare(`${base} AND EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ? AND e.status='active') ORDER BY c.title`)
      .bind(user.id)
      .all<CourseOption>()
  ).results
}

export interface RecordingRow {
  id: number
  lesson_id: number
  lesson_title: string
  course_id: number
  course_title: string
  teacher_name: string | null
  size: number
  source: string
  ready_at: number
  expires_at: number
  views: number
}

export async function recordingsFor(db: D1Database, user: SessionUser): Promise<RecordingRow[]> {
  let extra = ''
  const binds: unknown[] = []
  if (user.role === 'teacher') {
    extra = ' AND c.teacher_id = ?'
    binds.push(user.id)
  } else if (user.role === 'student') {
    extra = ` AND EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ? AND e.status='active')`
    binds.push(user.id)
  }
  return (
    await db
      .prepare(
        `SELECT r.id, r.lesson_id, l.title AS lesson_title, c.id AS course_id, c.title AS course_title, t.name AS teacher_name,
                r.size, r.source, r.ready_at, r.expires_at,
                (SELECT COUNT(*) FROM recording_views v WHERE v.recording_id = r.id) AS views
         FROM recordings r JOIN lessons l ON l.id = r.lesson_id JOIN courses c ON c.id = l.course_id LEFT JOIN users t ON t.id = c.teacher_id
         WHERE r.status = 'ready' AND r.expires_at > unixepoch() ${extra}
         ORDER BY r.ready_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<RecordingRow>()
  ).results
}
