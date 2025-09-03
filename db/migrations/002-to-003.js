export const migration002to003 = [
  // Добавляем новые поля в таблицу foodCatalogue
  `ALTER TABLE foodCatalogue ADD COLUMN protein REAL DEFAULT 0;`,
  `ALTER TABLE foodCatalogue ADD COLUMN fat REAL DEFAULT 0;`,
  `ALTER TABLE foodCatalogue ADD COLUMN carbs REAL DEFAULT 0;`,
  `ALTER TABLE foodCatalogue ADD COLUMN fiber REAL DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN descriptionForEmbedding TEXT DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN embedding BLOB DEFAULT NULL;`,

  // Добавляем уникальное ограничение на поле name
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_foodCatalogue_name ON foodCatalogue(name);`,

  // Удаляем устаревшее поле selectedCatalogueIds из foodSettings
  `ALTER TABLE foodSettings DROP COLUMN selectedCatalogueIds;`,

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
