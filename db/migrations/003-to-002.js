export const migration003to002 = [
  // Добавляем поле selectedCatalogueIds обратно (оставляем пустым, так как таблица ownership не существует в версии 003)
  `ALTER TABLE foodSettings ADD COLUMN selectedCatalogueIds TEXT;`,

  // Удаляем таблицу кэша embedding'ов
  `DROP TABLE IF EXISTS foodSearchQueryEmbeddings;`,

  // Удаляем новые поля из foodCatalogue
  `ALTER TABLE foodCatalogue DROP COLUMN protein;`,
  `ALTER TABLE foodCatalogue DROP COLUMN fat;`,
  `ALTER TABLE foodCatalogue DROP COLUMN carbs;`,
  `ALTER TABLE foodCatalogue DROP COLUMN fiber;`,
  `ALTER TABLE foodCatalogue DROP COLUMN descriptionForEmbedding;`,
  `ALTER TABLE foodCatalogue DROP COLUMN embedding;`,
  `ALTER TABLE foodCatalogue DROP COLUMN legacyName;`,

  // Удаляем индекс
  `DROP INDEX IF EXISTS idx_foodCatalogue_name;`,
];
