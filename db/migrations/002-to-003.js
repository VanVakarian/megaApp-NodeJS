export const migration002to003 = [
  // Добавляем новые поля в таблицу foodCatalogue
  `ALTER TABLE foodCatalogue ADD COLUMN protein REAL DEFAULT 0;`,
  `ALTER TABLE foodCatalogue ADD COLUMN fat REAL DEFAULT 0;`,
  `ALTER TABLE foodCatalogue ADD COLUMN carbs REAL DEFAULT 0;`,
  `ALTER TABLE foodCatalogue ADD COLUMN fiber REAL DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN descriptionForEmbedding TEXT DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN embedding BLOB DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN legacyName TEXT DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN imageUrl TEXT DEFAULT NULL;`,

  // Добавляем уникальное ограничение на поле name
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_foodCatalogue_name ON foodCatalogue(name);`,

  // Удаляем устаревшее поле selectedCatalogueIds из foodSettings
  `ALTER TABLE foodSettings DROP COLUMN selectedCatalogueIds;`,

  // Добавляем поле для кастомных промптов генерации изображений (для будущей персонализации)
  `ALTER TABLE foodSettings ADD COLUMN imagePrompt TEXT DEFAULT NULL;`,

  // Создаем таблицу для связи пользователей с изображениями продуктов (для будущей персонализации)
  `
  CREATE TABLE IF NOT EXISTS foodImages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    foodCatalogueId INTEGER NOT NULL,
    imageUrl TEXT NOT NULL,
    promptHash TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    UNIQUE(userId, foodCatalogueId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (foodCatalogueId) REFERENCES foodCatalogue(id) ON DELETE CASCADE
  );
  `,

  // Создаем таблицу для кэширования embedding'ов
  `
  CREATE TABLE IF NOT EXISTS foodSearchQueryEmbeddings (
    query TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    hitCount INTEGER DEFAULT 1,
    lastUsedAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
  `,
];
