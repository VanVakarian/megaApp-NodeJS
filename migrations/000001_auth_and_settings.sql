CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    hashedPassword TEXT,
    isAdmin BOOLEAN
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER,
    darkTheme BOOLEAN,
    selectedChapterFood BOOLEAN,
    selectedChapterMoney BOOLEAN,
    liteVersion BOOLEAN,
    height INTEGER,
    sex TEXT DEFAULT NULL,
    birthDate TEXT DEFAULT NULL,
    activityLevel TEXT DEFAULT NULL,
    goal TEXT DEFAULT NULL
);
