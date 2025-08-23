export const migration003to002 = [
  // Добавляем поле selectedCatalogueIds обратно
  `ALTER TABLE foodSettings ADD COLUMN selectedCatalogueIds TEXT;`,

  // Восстанавливаем данные в selectedCatalogueIds из таблицы ownership
  `
  UPDATE foodSettings SET selectedCatalogueIds = (
    SELECT json_group_array(foodCatalogueId)
    FROM foodCatalogueEntryOwnership
    WHERE userId = foodSettings.usersId
  )
  WHERE EXISTS (
    SELECT 1 FROM foodCatalogueEntryOwnership
    WHERE userId = foodSettings.usersId
  );
  `,

  // Удаляем таблицу ownership
  `DROP TABLE IF EXISTS foodCatalogueEntryOwnership;`,

  // Удаляем новые поля из foodCatalogue
  `ALTER TABLE foodCatalogue DROP COLUMN protein;`,
  `ALTER TABLE foodCatalogue DROP COLUMN fat;`,
  `ALTER TABLE foodCatalogue DROP COLUMN carbs;`,
  `ALTER TABLE foodCatalogue DROP COLUMN fiber;`,
  `ALTER TABLE foodCatalogue DROP COLUMN descriptionForEmbedding;`,
  `ALTER TABLE foodCatalogue DROP COLUMN embedding;`,

  // Удаляем индекс
  `DROP INDEX IF EXISTS idx_foodCatalogue_name;`,
];
