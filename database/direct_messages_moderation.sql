BEGIN;

-- New channels (direct chats) get their id from a sequence.
CREATE SEQUENCE IF NOT EXISTS safechat_channel_id_seq;
ALTER TABLE "Channels" ALTER COLUMN id SET DEFAULT nextval('safechat_channel_id_seq');
ALTER SEQUENCE safechat_channel_id_seq OWNED BY "Channels".id;
SELECT setval('safechat_channel_id_seq', COALESCE(MAX(id), 0) + 1, false)
FROM "Channels";

-- A direct chat is a channel that belongs to exactly two users.
CREATE TABLE IF NOT EXISTS "DirectChats" (
    channel_id INTEGER PRIMARY KEY REFERENCES "Channels"(id),
    user_one_id INTEGER NOT NULL REFERENCES "Users"(id),
    user_two_id INTEGER NOT NULL REFERENCES "Users"(id),
    CHECK (user_one_id < user_two_id),
    UNIQUE (user_one_id, user_two_id)
);

CREATE TABLE IF NOT EXISTS "Blocks" (
    blocker_id INTEGER NOT NULL REFERENCES "Users"(id),
    blocked_id INTEGER NOT NULL REFERENCES "Users"(id),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

ALTER TABLE "Messages"
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- One policy per moderation category. Scores run from 0 to 1.
-- An empty block_threshold means the category only warns.
-- Plain insults only warn so the student can rewrite them. Threats and hate still block.
CREATE SEQUENCE IF NOT EXISTS safechat_policy_id_seq;
ALTER TABLE "Policies" ALTER COLUMN id SET DEFAULT nextval('safechat_policy_id_seq');
ALTER SEQUENCE safechat_policy_id_seq OWNED BY "Policies".id;
ALTER TABLE "Policies" DROP COLUMN IF EXISTS action;
ALTER TABLE "Policies" ADD COLUMN IF NOT EXISTS warn_threshold REAL NOT NULL;
ALTER TABLE "Policies" ADD COLUMN IF NOT EXISTS block_threshold REAL;
CREATE UNIQUE INDEX IF NOT EXISTS policy_name_unique ON "Policies" (name);
ALTER TABLE "Policies" DROP CONSTRAINT IF EXISTS policy_thresholds_check;
ALTER TABLE "Policies" ADD CONSTRAINT policy_thresholds_check CHECK (
    warn_threshold BETWEEN 0 AND 1
    AND (block_threshold IS NULL OR block_threshold BETWEEN warn_threshold AND 1)
);

INSERT INTO "Policies" (name, warn_threshold, block_threshold) VALUES
    ('harassment', 0.4, NULL),
    ('harassment/threatening', 0.3, 0.6),
    ('hate', 0.4, 0.8),
    ('hate/threatening', 0.3, 0.6),
    ('illicit', 0.5, 0.9),
    ('illicit/violent', 0.3, 0.7),
    ('self-harm', 0.3, NULL),
    ('self-harm/intent', 0.3, NULL),
    ('self-harm/instructions', 0.3, 0.7),
    ('sexual', 0.5, 0.8),
    ('sexual/minors', 0.1, 0.3),
    ('violence', 0.5, 0.85),
    ('violence/graphic', 0.5, 0.85),
    ('unsafe link', 0.5, 1.0)
ON CONFLICT (name) DO NOTHING;

-- Databases created before this change still have the old harassment value.
UPDATE "Policies" SET block_threshold = NULL
WHERE name = 'harassment' AND block_threshold = REAL '0.8';

-- Moderation log. Blocked content is never stored, only the outcome.
CREATE SEQUENCE IF NOT EXISTS safechat_event_id_seq;
ALTER TABLE "ModerationEvents" ALTER COLUMN id SET DEFAULT nextval('safechat_event_id_seq');
ALTER SEQUENCE safechat_event_id_seq OWNED BY "ModerationEvents".id;
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL REFERENCES "Users"(id);
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS channel_id INTEGER NOT NULL REFERENCES "Channels"(id);
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS score REAL;
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "ModerationEvents" ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "ModerationEvents" DROP CONSTRAINT IF EXISTS moderation_values_check;
ALTER TABLE "ModerationEvents" ADD CONSTRAINT moderation_values_check CHECK (
    decision IN ('warn', 'block', 'unchecked')
    AND content_type IN ('text', 'link', 'image')
    AND review_status IN ('open', 'reviewed')
);

COMMIT;

SELECT * FROM "Policies" ORDER BY id;

-- After opening a direct chat and sending a message in it.
SELECT d.channel_id, a.name AS user_one, b.name AS user_two, m.text, m.created_at
FROM "DirectChats" AS d
JOIN "Users" AS a ON a.id = d.user_one_id
JOIN "Users" AS b ON b.id = d.user_two_id
LEFT JOIN "Messages" AS m ON m.channel_id = d.channel_id
ORDER BY d.channel_id, m.id;

-- After a message is warned or blocked.
SELECT e.id, u.name AS sender, c.name AS channel, e.content_type, e.category,
       e.score, e.decision, e.message_id, e.created_at, e.review_status
FROM "ModerationEvents" AS e
JOIN "Users" AS u ON u.id = e.user_id
JOIN "Channels" AS c ON c.id = e.channel_id
ORDER BY e.id;

SELECT blocker.name AS blocker, blocked.name AS blocked
FROM "Blocks"
JOIN "Users" AS blocker ON blocker.id = "Blocks".blocker_id
JOIN "Users" AS blocked ON blocked.id = "Blocks".blocked_id;
