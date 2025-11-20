export const migration003to004 = [
  // Добавляем поля для расчета БЖУК в таблицу settings
  `ALTER TABLE settings ADD COLUMN sex TEXT DEFAULT NULL;`,
  `ALTER TABLE settings ADD COLUMN birthDate TEXT DEFAULT NULL;`,
  `ALTER TABLE settings ADD COLUMN activityLevel TEXT DEFAULT NULL;`,
  `ALTER TABLE settings ADD COLUMN goal TEXT DEFAULT NULL;`,
];
