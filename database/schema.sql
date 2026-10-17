BEGIN;

CREATE TABLE IF NOT EXISTS "Users" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Channels" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS safechat_message_id_seq;

CREATE TABLE IF NOT EXISTS "Messages" (
    id INTEGER PRIMARY KEY DEFAULT nextval('safechat_message_id_seq'),
    user_id INTEGER NOT NULL REFERENCES "Users"(id),
    channel_id INTEGER REFERENCES "Channels"(id),
    text TEXT NOT NULL
);

-- Update the existing foundation table without deleting its messages.
ALTER TABLE "Messages"
    ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES "Channels"(id);
ALTER TABLE "Messages" ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE "Messages" ALTER COLUMN id SET DEFAULT nextval('safechat_message_id_seq');
ALTER SEQUENCE safechat_message_id_seq OWNED BY "Messages".id;
SELECT setval('safechat_message_id_seq', COALESCE(MAX(id), 0) + 1, false)
FROM "Messages";

CREATE TABLE IF NOT EXISTS "ModerationEvents" (
    id INTEGER PRIMARY KEY,
    message_id INTEGER REFERENCES "Messages"(id),
    decision TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Policies" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    action TEXT NOT NULL
);

COMMIT;
