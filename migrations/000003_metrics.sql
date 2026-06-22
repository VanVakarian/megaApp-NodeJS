CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,
    metricName TEXT NOT NULL,
    minuteBucket INTEGER NOT NULL,
    value REAL NOT NULL,
    UNIQUE(service, metricName, minuteBucket)
);
