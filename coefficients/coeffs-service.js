import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import * as dbFood from '../db/db-food.js';
import * as dbUsers from '../db/db-users.js';
import * as dbCoefficients from './coeffs-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function calculateAndSaveCoefficients(userId) {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, 'coeffs-worker.js');
    const worker = new Worker(workerPath);

    worker.postMessage({ userId });

    worker.on('message', (message) => {
      if (message.status === 'success') {
        worker.terminate();
        resolve(true);
      } else if (message.status === 'error') {
        console.error('Error calculating coefficients for user:', userId, message.error);
        worker.terminate();
        reject(new Error(message.error));
      }
    });

    worker.on('error', (error) => {
      console.error('Worker error:', error);
      worker.terminate();
      reject(error);
    });
  });
}

export async function startCoefficientsCalculation() {
  console.log('Running coefficient calculation for all users...');
  const users = await dbUsers.getAllUserIds();
  for (const user of users) {
    try {
      await calculateAndSaveCoefficients(user.id);
    } catch (error) {
      console.error(`Error calculating coefficients for user ${user.id}:`, error);
    }
  }
}

export async function diaryEntriesPrep(diaryEntriesRaw) {
  const diaryEntriesPrepped = [];
  const daysList = [];
  let thisDaysDate = diaryEntriesRaw[0].dateISO;
  daysList.push(thisDaysDate);
  let thisDaysFood = [];

  for (const item of diaryEntriesRaw) {
    if (thisDaysDate === item.dateISO) {
      thisDaysFood.push({ foodId: item.foodCatalogueId, weight: item.foodWeight });
    } else {
      diaryEntriesPrepped.push(thisDaysFood);
      thisDaysFood = [{ foodId: item.foodCatalogueId, weight: item.foodWeight }];
      thisDaysDate = item.dateISO;
      daysList.push(thisDaysDate);
    }
  }
  diaryEntriesPrepped.push(thisDaysFood);

  return diaryEntriesPrepped;
}

export async function weightsPrep(weightsRaw) {
  return weightsRaw.map((item) => parseFloat(item.weight));
}

export async function cataloguePrep(catalogueRaw) {
  const cataloguePrepped = {};
  for (const item of catalogueRaw) {
    cataloguePrepped[item.id] = item.kcals;
  }
  return cataloguePrepped;
}

export async function dailySumKcalsCount(diaryEntriesPrepped, cataloguePrepped, personalCoeffs) {
  const dailySumKcals = [];
  for (const day of diaryEntriesPrepped) {
    let dailySum = 0;
    for (const food of day) {
      dailySum += (cataloguePrepped[food.foodId] * personalCoeffs[food.foodId] * food.weight) / 100;
    }
    dailySumKcals.push(dailySum);
  }
  return dailySumKcals;
}

export async function catalogueFrequencyPrep(personalCoeffs, diaryEntriesRaw) {
  const catalogueFrequency = Object.fromEntries(Object.keys(personalCoeffs).map((key) => [key, 0]));
  for (const item of diaryEntriesRaw) {
    catalogueFrequency[item.foodCatalogueId]++;
  }
  return catalogueFrequency;
}

export function averageList(inputList, avgRange, roundBool = false, roundPlaces = 0) {
  const res = [];
  for (let i = 1; i <= inputList.length; i++) {
    const j = Math.max(0, i - avgRange);
    const slice = inputList.slice(j, i);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

    if (roundBool) {
      res.push(roundPlaces > 0 ? Number(avg.toFixed(roundPlaces)) : Math.round(avg));
    } else {
      res.push(avg);
    }
  }
  return res;
}

export function targetKcalsPrep(kcals, weights, n) {
  if (kcals.length < n || weights.length < n) {
    throw new Error(`Insufficient data for targetKcalsPrep calculation - need at least ${n} entries`);
  }

  // Limiting calculations to the number of days we have weight data for
  const effectiveLength = Math.min(kcals.length, weights.length);

  const res = [];
  for (let i = n - 1; i < effectiveLength; i++) {
    const startIdx = i - n + 1;
    const kcalsSlice = kcals.slice(startIdx, i + 1);
    const weightDiff = weights[i] - weights[startIdx];
    const targetKcal = (kcalsSlice.reduce((a, b) => a + b, 0) - weightDiff * 7700) / n;
    res.push(targetKcal);
  }

  return res;
}

export function fitnessCalc(edgy, smooth, coeffs) {
  let diff = 0;
  for (let i = 0; i < edgy.length; i++) {
    diff += Math.abs(edgy[i] - smooth[i]);
  }

  let coeffsSum = 0;
  for (const value of Object.values(coeffs)) {
    if (value > 1) {
      coeffsSum += (value - 1) * 1;
    }
    if (value < 1) {
      coeffsSum += (1 - value) * 2;
    }
  }

  coeffsSum = Math.max(0.1, Math.abs(coeffsSum));
  return diff * coeffsSum;
}

export function mutateCoeffs(coeffs, catalogueFrequency) {
  const res = {};
  const mostFrequentFoodTimes = Math.max(...Object.values(catalogueFrequency));

  for (const [key, value] of Object.entries(coeffs)) {
    const newValue = +(value + (Math.random() * 0.02 - 0.01)).toFixed(2);
    const maxIncrease = Math.sqrt(catalogueFrequency[key] / mostFrequentFoodTimes);
    const maximum = 1 + maxIncrease;
    const minimum = 1 - maxIncrease / 2;

    if (newValue > maximum) {
      res[key] = maximum;
    } else if (newValue < minimum) {
      res[key] = minimum;
    } else {
      res[key] = newValue;
    }
  }
  return res;
}

export async function getAndValidateCoefficients(userId, zeros = false) {
  const catalogueEntries = await dbFood.getAllFoodCatalogueEntries();
  const coeffsResult = await dbCoefficients.getUsersCoefficients(userId);

  let usersCoeffs = {};
  try {
    if (zeros) {
      usersCoeffs = Object.fromEntries(catalogueEntries.map((item) => [item.id, 1.0]));
      await dbCoefficients.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    } else if (coeffsResult && coeffsResult.coefficients) {
      usersCoeffs = JSON.parse(coeffsResult.coefficients);
    }

    const catalogueIdsSet = new Set(catalogueEntries.map((item) => item.id));
    const usersCoeffsIdsSet = new Set(Object.keys(usersCoeffs).map(Number));

    if (catalogueIdsSet.size > usersCoeffsIdsSet.size) {
      for (const id of catalogueIdsSet) {
        if (!usersCoeffsIdsSet.has(id)) {
          usersCoeffs[id] = 1.0;
        }
      }
      await dbCoefficients.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    }

    if (usersCoeffsIdsSet.size > catalogueIdsSet.size) {
      for (const id of usersCoeffsIdsSet) {
        if (!catalogueIdsSet.has(id)) {
          delete usersCoeffs[id];
        }
      }
      await dbCoefficients.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    }
  } catch (error) {
    usersCoeffs = Object.fromEntries(catalogueEntries.map((item) => [item.id, 1.0]));
    await dbCoefficients.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
  }

  return usersCoeffs;
}
