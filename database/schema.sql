CREATE TABLE "Users" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE "Messages" (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES "Users"(id),
    text TEXT NOT NULL
);

CREATE TABLE "ModerationEvents" (
    id INTEGER PRIMARY KEY,
    message_id INTEGER REFERENCES "Messages"(id),
    decision TEXT NOT NULL
);

CREATE TABLE "Policies" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    action TEXT NOT NULL
);
