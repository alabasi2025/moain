-- منصة إضاءات — المخطط الأساسي
-- اصطلاحات:
--   * كل المبالغ بالهللة (INTEGER) لتفادي أخطاء الكسور: 100 هللة = 1 ريال
--   * النِّسب بنقاط الأساس (basis points): 10000 = 100% ، 2500 = 25%
--   * الأوقات بثواني يونكس UTC (INTEGER)، والتواريخ فقط بصيغة 'YYYY-MM-DD' (TEXT) بتوقيت الرياض

PRAGMA foreign_keys = ON;

-- ============ المستخدمون والجلسات ============
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  role          TEXT    NOT NULL CHECK (role IN ('admin','teacher','student')),
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL UNIQUE,          -- رقم الجوال = اسم الدخول
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  guardian_name TEXT,                              -- ولي الأمر (للطلاب)
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_users_role ON users(role, active);

CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,                 -- SHA-256 للتوكن (التوكن نفسه لا يُخزن)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- محاولات الدخول (حماية من التخمين)
CREATE TABLE login_attempts (
  key         TEXT    PRIMARY KEY,                 -- phone أو ip
  count       INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- ============ الجهات والدورات ============
CREATE TABLE partners (                            -- الجهات التي تجلب طلاباً للدورات
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  contact_phone    TEXT,
  commission_bps   INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
  notes            TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE courses (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  title                TEXT    NOT NULL,
  subject              TEXT,
  description          TEXT,
  teacher_id           INTEGER REFERENCES users(id),
  partner_id           INTEGER REFERENCES partners(id),   -- الجهة الافتراضية للدورة (اختياري)
  price                INTEGER NOT NULL DEFAULT 0,        -- السعر الافتراضي للطالب (هللة)
  teacher_share_type   TEXT    NOT NULL DEFAULT 'percent'
                       CHECK (teacher_share_type IN ('percent','per_student','fixed')),
  teacher_share_value  INTEGER NOT NULL DEFAULT 0,        -- bps للنسبة، أو هللة للمبلغ
  start_date           TEXT,
  end_date             TEXT,
  status               TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_courses_teacher ON courses(teacher_id, status);

CREATE TABLE enrollments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  agreed_price  INTEGER NOT NULL DEFAULT 0,               -- السعر المتفق عليه (بعد الخصم)
  partner_id    INTEGER REFERENCES partners(id),          -- الجهة التي جلبت هذا الطالب
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (course_id, student_id)
);
CREATE INDEX idx_enroll_student ON enrollments(student_id, status);

-- ============ المالية ============
CREATE TABLE installments (                         -- جدول الأقساط المتوقعة
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id  INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  due_date       TEXT    NOT NULL,
  note           TEXT
);
CREATE INDEX idx_inst_enroll ON installments(enrollment_id, due_date);
CREATE INDEX idx_inst_due ON installments(due_date);

CREATE TABLE payments (                             -- التحويلات/الدفعات الفعلية
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id  INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  paid_on        TEXT    NOT NULL,
  method         TEXT    NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','card','other')),
  reference      TEXT,                                -- رقم الحوالة/المرجع
  note           TEXT,
  recorded_by    INTEGER REFERENCES users(id),
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_pay_enroll ON payments(enrollment_id);
CREATE INDEX idx_pay_date ON payments(paid_on);

CREATE TABLE expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,   -- NULL = مصروف عام
  category    TEXT    NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  spent_on    TEXT    NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_exp_course ON expenses(course_id);

CREATE TABLE payouts (                              -- صرف مستحقات المعلمات والجهات
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payee_type  TEXT    NOT NULL CHECK (payee_type IN ('teacher','partner')),
  payee_id    INTEGER NOT NULL,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  paid_on     TEXT    NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_payout_course ON payouts(course_id, payee_type);

-- ============ الحصص والقاعات ============
CREATE TABLE zoom_rooms (                           -- قاعات الزوم المدفوعة (4 قاعات)
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  account_label TEXT,                                 -- أي حساب زوم
  join_url      TEXT    NOT NULL,                     -- رابط القاعة الثابت (PMI/اجتماع متكرر)
  passcode      TEXT,
  host_key      TEXT,                                 -- مفتاح المضيف (تستلم به المعلمة صلاحية المضيف)
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE lessons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER NOT NULL,
  provider      TEXT    NOT NULL CHECK (provider IN ('zoom','jitsi')),
  zoom_room_id  INTEGER REFERENCES zoom_rooms(id),
  room_key      TEXT    NOT NULL UNIQUE,              -- اسم غرفة البث الخاص (عشوائي غير قابل للتخمين)
  status        TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  started_at    INTEGER,
  ended_at      INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_lessons_course ON lessons(course_id, starts_at);
CREATE INDEX idx_lessons_time ON lessons(starts_at, ends_at);
CREATE INDEX idx_lessons_room ON lessons(zoom_room_id, starts_at);

CREATE TABLE recordings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id     INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  r2_key        TEXT    NOT NULL UNIQUE,
  upload_id     TEXT,                                 -- معرّف الرفع المجزّأ في R2
  mime          TEXT    NOT NULL DEFAULT 'video/webm',
  size          INTEGER NOT NULL DEFAULT 0,
  source        TEXT    NOT NULL DEFAULT 'browser' CHECK (source IN ('browser','upload')),
  status        TEXT    NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready','deleted','failed')),
  created_by    INTEGER REFERENCES users(id),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  ready_at      INTEGER,
  expires_at    INTEGER                                -- يُضبط عند الاكتمال = ready_at + 48 ساعة
);
CREATE INDEX idx_rec_lesson ON recordings(lesson_id);
CREATE INDEX idx_rec_expiry ON recordings(status, expires_at);

CREATE TABLE recording_parts (
  recording_id  INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  part_number   INTEGER NOT NULL,
  etag          TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  PRIMARY KEY (recording_id, part_number)
);

-- سجل مشاهدات التسجيلات (للتتبع لو تسرب شيء)
CREATE TABLE recording_views (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id  INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_views_rec ON recording_views(recording_id);

-- ============ الواجبات ============
CREATE TABLE assignments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  description   TEXT,
  due_at        INTEGER,
  file_key      TEXT,
  file_name     TEXT,
  max_grade     INTEGER NOT NULL DEFAULT 10,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_asg_course ON assignments(course_id, due_at);

CREATE TABLE submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id  INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           TEXT,
  file_key       TEXT,
  file_name      TEXT,
  submitted_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  grade          INTEGER,
  feedback       TEXT,
  graded_at      INTEGER,
  UNIQUE (assignment_id, student_id)
);

-- ============ الرسائل ============
CREATE TABLE messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT    NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  read_at       INTEGER
);
CREATE INDEX idx_msg_pair ON messages(sender_id, recipient_id, created_at);
CREATE INDEX idx_msg_inbox ON messages(recipient_id, read_at);

-- ============ الموقع التعريفي ============
CREATE TABLE leads (                                -- طلبات الحصة التجريبية
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  grade       TEXT,
  subject     TEXT,
  note        TEXT,
  status      TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','enrolled','closed')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- إعدادات عامة (مفتاح/قيمة) — مثل آخر تشغيل للتنظيف
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
