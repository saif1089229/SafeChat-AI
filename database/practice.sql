CREATE TABLE practice_students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

INSERT INTO practice_students (id, name) VALUES
    (1, 'Practice student one'),
    (2, 'Practice student two');

SELECT id, name FROM practice_students ORDER BY id;
