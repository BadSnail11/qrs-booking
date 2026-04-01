CREATE TABLE IF NOT EXISTS weekly_schedule (
    weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
    day_name TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    CHECK (close_time <> open_time)
);

INSERT INTO weekly_schedule (weekday, day_name, is_open, open_time, close_time)
VALUES
    (0, 'monday', TRUE, '11:00', '22:00'),
    (1, 'tuesday', TRUE, '11:00', '22:00'),
    (2, 'wednesday', TRUE, '11:00', '22:00'),
    (3, 'thursday', TRUE, '11:00', '22:00'),
    (4, 'friday', TRUE, '11:00', '22:00'),
    (5, 'saturday', TRUE, '11:00', '22:00'),
    (6, 'sunday', TRUE, '11:00', '22:00')
ON CONFLICT (weekday) DO NOTHING;
