BEGIN;

INSERT INTO "Users" (id, name) VALUES
    (1, 'Test student'),
    (2, 'Second test student')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "Channels" (id, name)
VALUES (1, 'general')
ON CONFLICT (id) DO NOTHING;

-- Existing foundation messages belong to the single demo channel.
UPDATE "Messages" SET channel_id = 1 WHERE channel_id IS NULL;
ALTER TABLE "Messages" ALTER COLUMN channel_id SET NOT NULL;

COMMIT;

SELECT * FROM "Users";
SELECT * FROM "Channels";
SELECT * FROM "Messages";

-- After sending Hello through the application, show its stored relationships.
SELECT m.id, u.name AS sender, c.name AS channel, m.text
FROM "Messages" AS m
JOIN "Users" AS u ON u.id = m.user_id
JOIN "Channels" AS c ON c.id = m.channel_id
ORDER BY m.id;
