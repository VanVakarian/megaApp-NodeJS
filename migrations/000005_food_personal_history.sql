CREATE TABLE IF NOT EXISTS foodPersonalKcalHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER NOT NULL,
    foodCatalogueId INTEGER NOT NULL,
    yearMonth TEXT NOT NULL,
    kcalsPer100g REAL NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(usersId, foodCatalogueId, yearMonth)
);

CREATE TABLE IF NOT EXISTS foodPersonalNormHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usersId INTEGER NOT NULL,
    yearMonth TEXT NOT NULL,
    normKcals REAL NOT NULL,
    kcalPerKg REAL NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(usersId, yearMonth)
);
