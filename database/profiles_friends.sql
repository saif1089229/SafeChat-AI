BEGIN;

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS password_hash TEXT;

INSERT INTO "Users" (id, name, email) VALUES
    (1, 'Saif Khaled Alshehhi', '1089229@students.adu.ac.ae'),
    (2, 'Rashed Salem Alhantoobi', '1075919@students.adu.ac.ae'),
    (3, 'Sultan Yousif Alzaabi', '1082602@students.adu.ac.ae')
ON CONFLICT (id) DO UPDATE SET
    name = CASE WHEN "Users".email IS NULL THEN EXCLUDED.name ELSE "Users".name END,
    email = EXCLUDED.email;

CREATE TABLE IF NOT EXISTS "FriendRequests" (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES "Users"(id),
    recipient_id INTEGER NOT NULL REFERENCES "Users"(id),
    status TEXT NOT NULL DEFAULT 'pending',
    CHECK (sender_id <> recipient_id),
    CHECK (status IN ('pending', 'accepted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_pair_unique
ON "FriendRequests" (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id));

CREATE TABLE IF NOT EXISTS "Sessions" (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "Users"(id),
    expires_at TIMESTAMPTZ NOT NULL
);

COMMIT;
