BEGIN;

-- Admins can open the dashboard. Saif is the group's admin account.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';
ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "Users" ADD CONSTRAINT user_role_check CHECK (role IN ('student', 'admin'));
UPDATE "Users" SET role = 'admin' WHERE id = 1;

-- Image messages keep the stored file name. Their text can be empty.
ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS image_path TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS "Reports" (
    id SERIAL PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES "Users"(id),
    message_id INTEGER NOT NULL REFERENCES "Messages"(id),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, message_id),
    CHECK (status IN ('open', 'reviewed'))
);

-- Every admin change is recorded here.
CREATE TABLE IF NOT EXISTS "AuditLog" (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES "Users"(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

SELECT id, name, role FROM "Users" ORDER BY id;

-- After a student reports a message.
SELECT r.id, reporter.name AS reporter, sender.name AS sender, m.text, r.reason, r.status, r.created_at
FROM "Reports" AS r
JOIN "Users" AS reporter ON reporter.id = r.reporter_id
JOIN "Messages" AS m ON m.id = r.message_id
JOIN "Users" AS sender ON sender.id = m.user_id
ORDER BY r.id;

-- After sending an image.
SELECT m.id, u.name AS sender, m.image_path, m.created_at
FROM "Messages" AS m
JOIN "Users" AS u ON u.id = m.user_id
WHERE m.image_path IS NOT NULL
ORDER BY m.id;

-- Warnings, blocks and reports per user, as shown on the admin dashboard.
SELECT u.name,
       COUNT(*) FILTER (WHERE e.decision = 'warn') AS warnings,
       COUNT(*) FILTER (WHERE e.decision = 'block') AS blocks
FROM "Users" AS u
LEFT JOIN "ModerationEvents" AS e ON e.user_id = u.id
GROUP BY u.id, u.name
ORDER BY u.id;

-- After an admin changes a policy or reviews an event.
SELECT a.id, u.name AS admin, a.action, a.details, a.created_at
FROM "AuditLog" AS a
JOIN "Users" AS u ON u.id = a.admin_id
ORDER BY a.id;
