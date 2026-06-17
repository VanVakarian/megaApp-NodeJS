import { USER_SETTINGS_DATA } from '../../db-population-data.js';

export const migration003to004populateData = [
  // Добавляем поля для расчета БЖУК в таблицу settings
  `ALTER TABLE settings ADD COLUMN sex TEXT DEFAULT NULL;`,
  `ALTER TABLE settings ADD COLUMN birthDate TEXT DEFAULT NULL;`,
  `ALTER TABLE settings ADD COLUMN activityLevel TEXT DEFAULT NULL;`,
  `ALTER TABLE settings ADD COLUMN goal TEXT DEFAULT NULL;`,

  // Заполняем данные пользователей
  ...Object.entries(USER_SETTINGS_DATA).map(
    ([userId, data]) => `
      UPDATE settings
      SET
        sex = '${data.sex}',
        birthDate = '${data.birthDate}',
        activityLevel = '${data.activityLevel}',
        goal = '${data.goal}'
      WHERE
        usersId = ${userId};
    `
  ),
];
