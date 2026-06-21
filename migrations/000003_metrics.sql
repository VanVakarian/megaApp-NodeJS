CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metricName TEXT NOT NULL,
    minuteBucket INTEGER NOT NULL,
    value REAL NOT NULL,
    UNIQUE(metricName, minuteBucket)
);
