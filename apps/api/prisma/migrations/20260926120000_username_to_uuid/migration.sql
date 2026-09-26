-- Replace every student and teacher username with a fresh UUID so the field
-- is no longer a visible identifier (students log in by studentId, teachers
-- by email — username becomes an opaque internal value).

UPDATE "User" u
SET username = 'stu_' || gen_random_uuid()::text
WHERE EXISTS (
  SELECT 1 FROM "Student" s WHERE s."userId" = u.id
);

UPDATE "User" u
SET username = 'tch_' || gen_random_uuid()::text
WHERE EXISTS (
  SELECT 1 FROM "Teacher" t WHERE t."userId" = u.id
);
