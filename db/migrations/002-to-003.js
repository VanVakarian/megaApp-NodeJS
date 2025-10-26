export const migration002to003 = [
  // Добавляем новые поля в таблицу foodCatalogue
  `ALTER TABLE foodCatalogue ADD COLUMN protein REAL DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN fat REAL DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN carbs REAL DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN fiber REAL DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN description TEXT DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN nameVec BLOB DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN descriptionVec BLOB DEFAULT NULL;`,
  `ALTER TABLE foodCatalogue ADD COLUMN legacyName TEXT DEFAULT NULL;`,

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
