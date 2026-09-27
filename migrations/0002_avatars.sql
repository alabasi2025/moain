-- صور الملف الشخصي: تُخزن في R2 (avatars/{user_id}/{v}.{ext})، وهنا فقط رقم النسخة لكسر التخزين المؤقت
ALTER TABLE users ADD COLUMN avatar_v INTEGER;
ALTER TABLE users ADD COLUMN avatar_type TEXT;
