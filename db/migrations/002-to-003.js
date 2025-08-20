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

  // Создаем таблицу для управления видимостью продуктов
  `
  CREATE TABLE IF NOT EXISTS foodCatalogueEntryOwnership (
    userId INTEGER NOT NULL,
    foodCatalogueId INTEGER NOT NULL,
    PRIMARY KEY (userId, foodCatalogueId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (foodCatalogueId) REFERENCES foodCatalogue(id) ON DELETE CASCADE
  );
  `,

  // Создаем виртуальную таблицу для векторного поиска
  `
  CREATE VIRTUAL TABLE IF NOT EXISTS vecFoods USING vec0(
    embedding float[768]
  );
  `,

  // Мигрируем данные из selectedCatalogueIds в foodCatalogueEntryOwnership
  `
  INSERT INTO foodCatalogueEntryOwnership (userId, foodCatalogueId)
  SELECT
    fs.usersId,
    CAST(json_each.value AS INTEGER) as catalogueId
  FROM foodSettings fs, json_each(fs.selectedCatalogueIds)
  WHERE fs.selectedCatalogueIds IS NOT NULL
    AND fs.selectedCatalogueIds != ''
    AND fs.selectedCatalogueIds != 'null'
    AND json_valid(fs.selectedCatalogueIds);
  `,

  // Удаляем старое поле selectedCatalogueIds
  `ALTER TABLE foodSettings DROP COLUMN selectedCatalogueIds;`,
];
