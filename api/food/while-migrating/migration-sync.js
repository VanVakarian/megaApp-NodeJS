import pkg from 'pg';
import { getConnection } from '../../../db/db.js';
import * as env from '../../../env.js';

const { Client } = pkg;

const postgresConfig = {
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
};

let pgClient = null;

async function getPGClient() {
  if (!pgClient) {
    console.log('Инициализация нового PostgreSQL клиента...');
    pgClient = new Client(postgresConfig);
    await pgClient.connect();
    console.log('PostgreSQL клиент успешно подключен');
  }
  return pgClient;
}

async function getOldDiaryEntries(userId) {
  console.log(`[Diary] Получение старых записей дневника для пользователя ${userId}...`);
  const client = await getPGClient();
  try {
    const res = await client.query(
      `
      SELECT
        id, food_weight, date::text, catalogue_id
      FROM
        diary
      WHERE
        users_id = $1
      ORDER BY
        id
    `,
      [userId]
    );
    console.log(`[Diary] Найдено ${res.rows.length} старых записей дневника`);
    return res.rows;
  } catch (error) {
    console.error('[Diary] Ошибка чтения старых записей дневника:', error);
    return [];
  }
}

async function getNewDiaryEntries(userId) {
  console.log(`[Diary] Получение новых записей дневника для пользователя ${userId}...`);
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, foodWeight
      FROM
        foodDiary
      WHERE
        usersId = ?
      ORDER BY
        id
    `;
    const results = await connection.all(query, [userId]);
    console.log(`[Diary] Найдено ${results.length} новых записей дневника`);
    return results;
  } catch (error) {
    console.error('[Diary] Ошибка чтения новых записей дневника:', error);
    return [];
  }
}

async function getOldWeights(userId) {
  console.log(`[Weight] Получение старых записей веса для пользователя ${userId}...`);
  const client = await getPGClient();
  try {
    const res = await client.query(
      `
      SELECT
        id, weight, date::text
      FROM
        weights
      WHERE
        users_id = $1
      ORDER BY
        id
    `,
      [userId]
    );
    console.log(`[Weight] Найдено ${res.rows.length} старых записей веса`);
    return res.rows;
  } catch (error) {
    console.error('[Weight] Ошибка чтения старых записей веса:', error);
    return [];
  }
}

async function getNewWeights(userId) {
  console.log(`[Weight] Получение новых записей веса для пользователя ${userId}...`);
  const connection = await getConnection();
  try {
    const query = `
      SELECT
        id, weight
      FROM
        foodBodyWeight
      WHERE
        usersId = ?
      ORDER BY
        id
    `;
    const results = await connection.all(query, [userId]);
    console.log(`[Weight] Найдено ${results.length} новых записей веса`);
    return results;
  } catch (error) {
    console.error('[Weight] Ошибка чтения новых записей веса:', error);
    return [];
  }
}

async function syncDiary(userId) {
  console.log(`\n[Diary] Начало синхронизации дневника для пользователя ${userId}`);
  const oldEntries = await getOldDiaryEntries(userId);
  const newEntries = await getNewDiaryEntries(userId);

  console.log(`[Diary] Подготовка к синхронизации: ${oldEntries.length} старых записей, ${newEntries.length} новых записей`); // prettier-ignore

  const oldEntriesMap = new Map(oldEntries.map((entry) => [entry.id, entry]));
  const newEntriesMap = new Map(newEntries.map((entry) => [entry.id, entry]));

  // Записи для создания (есть в старой, нет в новой)
  const entriesToCreate = oldEntries
    .filter((entry) => !newEntriesMap.has(entry.id))
    .map((entry) => {
      return {
        ...entry,
        dateISO: entry.date,
      };
    });

  // Записи для обновления (есть в обеих, но отличается вес)
  const entriesToUpdate = oldEntries.filter((entry) => {
    const newEntry = newEntriesMap.get(entry.id);
    return newEntry && entry.food_weight !== newEntry.foodWeight;
  });

  // ID записей для удаления (есть в новой, нет в старой)
  const idsToDelete = newEntries.filter((entry) => !oldEntriesMap.has(entry.id)).map((entry) => entry.id);

  console.log(`[Diary] Анализ изменений завершен:
    - Записей к созданию: ${entriesToCreate.length}
    - Записей к обновлению: ${entriesToUpdate.length}
    - Записей к удалению: ${idsToDelete.length}
  `);

  const connection = await getConnection();

  // Применяем создание записей
  if (entriesToCreate.length > 0) {
    try {
      await connection.run('BEGIN TRANSACTION');

      const insertQuery = `
        INSERT INTO
          foodDiary (id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const stmt = await connection.prepare(insertQuery);

      for (const entry of entriesToCreate) {
        await stmt.run([entry.id, entry.dateISO, entry.catalogue_id, entry.food_weight, '[]', userId, 0, 0]);
      }

      await stmt.finalize();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK');
      console.error('[Diary] Ошибка пакетного создания записей:', error);
    }
  }

  // Применяем обновления весов
  if (entriesToUpdate.length > 0) {
    try {
      await connection.run('BEGIN TRANSACTION');

      const updateQuery = 'UPDATE foodDiary SET foodWeight = ? WHERE id = ?';
      const stmt = await connection.prepare(updateQuery);

      for (const entry of entriesToUpdate) {
        await stmt.run([entry.food_weight, entry.id]);
      }

      await stmt.finalize();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK');
      console.error('[Diary] Ошибка пакетного обновления записей:', error);
    }
  }

  // Применяем удаления
  if (idsToDelete.length > 0) {
    try {
      await connection.run('BEGIN TRANSACTION');

      const deleteQuery = 'DELETE FROM foodDiary WHERE id = ?';
      const stmt = await connection.prepare(deleteQuery);

      for (const id of idsToDelete) {
        await stmt.run([id]);
      }

      await stmt.finalize();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK');
      console.error('[Diary] Ошибка пакетного удаления записей:', error);
    }
  }

  console.log(`[Diary] Синхронизация завершена:
    - Создано записей: ${entriesToCreate.length}
    - Обновлено записей: ${entriesToUpdate.length}
    - Удалено записей: ${idsToDelete.length}\n`);
}

async function syncWeights(userId) {
  console.log(`\n[Weight] Начало синхронизации весов для пользователя ${userId}`);
  const oldWeights = await getOldWeights(userId);
  const newWeights = await getNewWeights(userId);

  console.log(
    `[Weight] Подготовка к синхронизации: ${oldWeights.length} старых записей, ${newWeights.length} новых записей`
  );

  const oldWeightsMap = new Map(oldWeights.map((entry) => [entry.id, entry]));
  const newWeightsMap = new Map(newWeights.map((entry) => [entry.id, entry]));

  // Веса для создания (есть в старой, нет в новой)
  const weightsToCreate = oldWeights
    .filter((entry) => !newWeightsMap.has(entry.id))
    .map((entry) => {
      return {
        ...entry,
        dateISO: entry.date,
      };
    });

  // Веса для обновления (есть в обеих, но отличается значение)
  const weightsToUpdate = oldWeights.filter((entry) => {
    const newEntry = newWeightsMap.get(entry.id);
    // return newEntry && entry.weight !== newEntry.weight;
    return newEntry && Number(entry.weight) !== newEntry.weight;
  });

  // ID записей для удаления (есть в новой, нет в старой)
  const idsToDelete = newWeights.filter((entry) => !oldWeightsMap.has(entry.id)).map((entry) => entry.id);

  console.log(`[Weight] Анализ изменений завершен:
    - Записей к созданию: ${weightsToCreate.length}
    - Записей к обновлению: ${weightsToUpdate.length}
    - Записей к удалению: ${idsToDelete.length}
  `);

  const connection = await getConnection();

  // Применяем создание записей
  if (weightsToCreate.length > 0) {
    try {
      await connection.run('BEGIN TRANSACTION');

      const insertQuery = `
        INSERT INTO
          foodBodyWeight (id, dateISO, weight, usersId)
        VALUES
          (?, ?, ?, ?)
      `;
      const stmt = await connection.prepare(insertQuery);

      for (const entry of weightsToCreate) {
        await stmt.run([entry.id, entry.dateISO, entry.weight, userId]);
      }

      await stmt.finalize();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK');
      console.error('[Weight] Ошибка пакетного создания записей:', error);
    }
  }

  // Применяем обновления весов
  if (weightsToUpdate.length > 0) {
    try {
      await connection.run('BEGIN TRANSACTION');

      const updateQuery = 'UPDATE foodBodyWeight SET weight = ? WHERE id = ?';
      const stmt = await connection.prepare(updateQuery);

      for (const entry of weightsToUpdate) {
        await stmt.run([entry.weight, entry.id]);
      }

      await stmt.finalize();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK');
      console.error('[Weight] Ошибка пакетного обновления записей:', error);
    }
  }

  // Применяем удаления
  if (idsToDelete.length > 0) {
    try {
      await connection.run('BEGIN TRANSACTION');

      const deleteQuery = 'DELETE FROM foodBodyWeight WHERE id = ?';
      const stmt = await connection.prepare(deleteQuery);

      for (const id of idsToDelete) {
        await stmt.run([id]);
      }

      await stmt.finalize();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK');
      console.error('[Weight] Ошибка пакетного удаления записей:', error);
    }
  }

  console.log(`[Weight] Синхронизация завершена:
    - Создано записей: ${weightsToCreate.length}
    - Обновлено записей: ${weightsToUpdate.length}
    - Удалено записей: ${idsToDelete.length}\n`);
}

export async function syncAll(userId) {
  console.log(`\n=== Начало полной синхронизации для пользователя ${userId} ===`);
  const startTime = Date.now();

  await syncDiary(userId);
  await syncWeights(userId);

  const duration = Date.now() - startTime;
  console.log(`=== Полная синхронизация завершена за ${duration}ms ===\n`);
}

// Clean up PostgreSQL connection on process exit
process.on('exit', async () => {
  if (pgClient) {
    console.log('Закрытие соединения с PostgreSQL...');
    await pgClient.end();
    console.log('Соединение с PostgreSQL закрыто');
  }
});
