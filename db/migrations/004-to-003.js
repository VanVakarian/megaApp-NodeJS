export const migration004to003 = [
  // Удаляем поля БЖУК из таблицы settings
  `ALTER TABLE settings DROP COLUMN goal;`,
  `ALTER TABLE settings DROP COLUMN activityLevel;`,
  `ALTER TABLE settings DROP COLUMN birthDate;`,
  `ALTER TABLE settings DROP COLUMN sex;`,
];
