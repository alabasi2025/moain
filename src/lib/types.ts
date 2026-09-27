export type Role = 'admin' | 'teacher' | 'student'

export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  APP_NAME: string
  RECORDING_TTL_HOURS: string
  /** نطاق سيرفر البث الخاص مثل meet.example.com — فارغ = وضع المعاينة (خادم Jitsi العام) */
  JITSI_DOMAIN: string
  JITSI_APP_ID: string
  JITSI_APP_SECRET?: string
  CRON_SECRET?: string
}

export interface SessionUser {
  id: number
  role: Role
  name: string
  phone: string
  /** رقم نسخة صورة الملف الشخصي (null = لا توجد صورة) */
  avatar_v?: number | null
}

export type AppEnv = {
  Bindings: Env
  Variables: { user: SessionUser | null }
}
