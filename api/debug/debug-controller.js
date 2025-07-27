import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import {
  DO_BACKUP,
  DO_LEGACY_JSON_BACKUP,
  FOOD_BATCH_BACKUP_DIR_NAME,
  FOOD_DAY_BACKUP_DIR_NAME,
  WEIGHT_BATCH_BACKUP_DIR_NAME,
  WEIGHT_DAY_BACKUP_DIR_NAME,
} from '../../env.js';
import * as backupDB from './db-debug.js';
import * as debugService from './debug-service.js';

export async function ping(request, reply) {
  const message = await debugService.ping();
  return reply.send({ message: message });
}

export async function backupDiaryAndWeightsData(lastDayOnly = false) {
  console.time('Legacy JSON backup took:');
  if (!DO_BACKUP || !DO_LEGACY_JSON_BACKUP) {
    console.log('Legacy JSON backup is disabled');
    return;
  }

  if (lastDayOnly) {
    await Promise.all([
      fs.mkdir(FOOD_DAY_BACKUP_DIR_NAME, { recursive: true }),
      fs.mkdir(WEIGHT_DAY_BACKUP_DIR_NAME, { recursive: true }),
    ]);
  } else {
    await Promise.all([
      fs.mkdir(FOOD_BATCH_BACKUP_DIR_NAME, { recursive: true }),
      fs.mkdir(WEIGHT_BATCH_BACKUP_DIR_NAME, { recursive: true }),
    ]);
  }

  const allDates = await backupDB.getAllDates();
  if (allDates.length === 0 || !allDates) return;

  const lastDate = allDates.at(-1);

  if (lastDayOnly) {
    const [foodDiary, bodyWeight] = await Promise.all([
      backupDB.getFoodDiaryByDate(lastDate),
      backupDB.getBodyWeightByDate(lastDate),
    ]);

    await fs.writeFile(path.join(FOOD_DAY_BACKUP_DIR_NAME, `${lastDate}.json`), JSON.stringify(foodDiary, null, 2));
    await fs.writeFile(path.join(WEIGHT_DAY_BACKUP_DIR_NAME, `${lastDate}.json`), JSON.stringify(bodyWeight, null, 2));

    console.log(`Last day backup saved to ${lastDate}.json`);
  } else {
    const allFoodEntries = await backupDB.getAllFoodDiaryEntries();

    await fs.writeFile(
      path.join(FOOD_BATCH_BACKUP_DIR_NAME, `${lastDate}.json`),
      JSON.stringify(allFoodEntries, null, 2)
    );

    const weightByDay = {};
    for (const date of allDates) {
      const weightEntries = await backupDB.getBodyWeightByDate(date);
      if (weightEntries.length > 0) {
        weightByDay[date] = weightEntries;
      }
    }

    const allWeightEntries = Object.values(weightByDay).flat();
    await fs.writeFile(
      path.join(WEIGHT_BATCH_BACKUP_DIR_NAME, `${lastDate}.json`),
      JSON.stringify(allWeightEntries, null, 2)
    );

    console.log(`Backup completed: all data saved to ${lastDate}.json files`);
  }

  console.timeEnd('Legacy JSON backup took:');
}

export async function restore(request, reply) {
  if (!DO_BACKUP) {
    reply.code(400).send({ error: 'Backup functionality is disabled' });
    return;
  }

  try {
    const currentEntries = await backupDB.getAllFoodDiaryEntries();
    const currentEntriesMap = new Map(currentEntries.map((entry) => [entry.id, entry]));

    const files = await fs.readdir(BACKUP_DIR_NAME);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    const backupEntries = [];
    for (const file of jsonFiles) {
      const filePath = path.join(BACKUP_DIR_NAME, file);
      const backupData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (backupData.foodDiary) {
        backupEntries.push(...backupData.foodDiary);
      }
    }

    const backupEntriesMap = new Map(backupEntries.map((entry) => [entry.id, entry]));

    const entriesToUpdate = [];
    for (const [id, backupEntry] of backupEntriesMap) {
      const currentEntry = currentEntriesMap.get(id);
      if (!currentEntry || currentEntry.foodWeight !== backupEntry.foodWeight) {
        entriesToUpdate.push(backupEntry);
      }
    }

    if (entriesToUpdate.length > 0) {
      const idsToDelete = entriesToUpdate.map((entry) => entry.id);
      await backupDB.deleteFoodDiaryEntriesByIds(idsToDelete);

      await backupDB.insertFoodDiaryEntries(entriesToUpdate);

      reply.send({
        success: true,
        message: `Updated ${entriesToUpdate.length} food diary entries`,
        updatedEntries: entriesToUpdate.length,
      });
    } else {
      reply.send({
        success: true,
        message: 'No entries needed updating',
        updatedEntries: 0,
      });
    }
  } catch (error) {
    console.error('Restore error:', error);
    reply.code(500).send({
      error: 'Failed to restore data from backup',
      details: error.message,
    });
  }
}

export async function latestCommitInfo(request, reply) {
  let commitHash = 'unknown';
  let commitDateTime = 'unknown';

  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const rawDate = execSync('git show -s --format=%ci HEAD').toString().trim();

    const date = new Date(rawDate);
    commitDateTime = date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.error('Failed to get git info:', error);
  }

  return { commitHash, commitDateTime };
}
