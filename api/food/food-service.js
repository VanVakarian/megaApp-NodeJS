import * as dbFood from '../../db/db-food.js';
import * as utils from '../../utils/utils.js';

export function getDateRange(dateIso, fetchDaysRangeOffset) {
  const date = new Date(dateIso);
  const result = [];
  for (let i = -fetchDaysRangeOffset; i <= fetchDaysRangeOffset; i++) {
    const d = new Date(date);
    d.setDate(date.getDate() + i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

export function organizeByDatesAndIds(inboundList) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const date = food.dateISO;
    const id = food.id;
    if (!resultDict[date]) {
      resultDict[date] = {};
    }
    resultDict[date][id] = {
      id: food.id,
      foodCatalogueId: food.foodCatalogueId,
      foodWeight: food.foodWeight,
      dateIso: date,
      history: parseHistory(food.history),
    };
  });
  return resultDict;
}

function parseHistory(historyStr) {
  try {
    return JSON.parse(historyStr) ?? [];
  } catch {
    return [];
  }
}

export function extendDiary(targetDict, propertyName, value, defaultValue) {
  for (const date in targetDict) {
    targetDict[date][propertyName] = value[date] || defaultValue;
  }
  return targetDict;
}

export function organizeWeightsByDate(arrayOfWeights) {
  const resultDict = {};
  arrayOfWeights.forEach((weightObj) => {
    resultDict[weightObj.dateISO] = weightObj.weight;
  });
  return resultDict;
}

export async function formFoodCatalogue() {
  const foodCatalogueRaw = await dbFood.getAllFoodCatalogueEntries();
  const foodCataloguePrepped = prepFoodCatalogue(foodCatalogueRaw);
  return foodCataloguePrepped;
}

function prepFoodCatalogue(catalogueArray) {
  const catalogueObj = {};
  for (const entry of catalogueArray) {
    catalogueObj[entry.id] = entry;
  }
  return catalogueObj;
}

export async function makeUpdatedHistoryString(diaryId, userId, newHistoryEntry) {
  const resHistory = await dbFood.dbGetDiaryEntriesHistory(diaryId, userId);
  const updatedHistory = resHistory.length ? JSON.parse(resHistory[0].history) : [];
  updatedHistory.push(newHistoryEntry);
  const historyString = JSON.stringify(updatedHistory);
  return historyString;
}

export async function calculateTargetKcals(userId, endDate) {
  const DAYS_AVG_7 = 7;
  const DAYS_AVG_60 = 60;
  const KCALS_IN_1_KG = 7700;

  const startDate = await dbFood.getUserFirstDate(userId);
  if (!startDate) throw new Error('No user data found');

  const diaryHistory = await dbFood.getDiaryEntriesHistory(userId, startDate, endDate);
  const weightHistory = await dbFood.getWeightHistory(userId, startDate, endDate);

  const dailyKcals = {};
  const dailyWeights = {};
  const targetKcals = {};
  const smoothedTargetKcals = {};

  weightHistory.forEach((entry) => {
    dailyWeights[entry.dateISO] = entry.weight;
  });

  diaryHistory.forEach((entry) => {
    if (!dailyKcals[entry.dateISO]) {
      dailyKcals[entry.dateISO] = 0;
    }
    dailyKcals[entry.dateISO] += (entry.foodWeight / 100) * entry.kcals;
  });

  const dates = Object.keys(dailyKcals).sort();

  for (let i = DAYS_AVG_7; i < dates.length; i++) {
    const currentDate = dates[i];
    const startIdx = i - DAYS_AVG_7;

    if (dailyWeights[currentDate] && dailyWeights[dates[startIdx]]) {
      const weightDiff = dailyWeights[currentDate] - dailyWeights[dates[startIdx]];
      const kcalsInPeriod = dates.slice(startIdx, i + 1).reduce((sum, date) => sum + (dailyKcals[date] || 0), 0);

      const avgDailyKcals = (kcalsInPeriod - weightDiff * KCALS_IN_1_KG) / DAYS_AVG_7;
      targetKcals[currentDate] = Math.round(avgDailyKcals);
    }
  }

  for (let i = DAYS_AVG_60; i < dates.length; i++) {
    const currentDate = dates[i];
    const startIdx = i - DAYS_AVG_60;

    const kcalsToAverage = dates
      .slice(startIdx, i + 1)
      .filter((date) => targetKcals[date])
      .map((date) => targetKcals[date]);

    if (kcalsToAverage.length > 0) {
      const avgKcals = kcalsToAverage.reduce((sum, kcals) => sum + kcals, 0) / kcalsToAverage.length;
      smoothedTargetKcals[currentDate] = Math.round(avgKcals);
    }
  }

  return smoothedTargetKcals;
}

//                                                                         STATS

export async function getCachedStats(userId, dateIso) {
  const cachedStats = await dbFood.getUsersCachedStats(userId);

  if (!cachedStats) {
    const stats = await recalcAndSaveNewStats(userId, dateIso);
    return stats;
  }

  if (dateIso > cachedStats.upToDate) {
    const stats = await recalcAndSaveNewStats(userId, dateIso);
    return stats;
  }

  return JSON.parse(cachedStats.stats);
}

async function recalcAndSaveNewStats(userId, dateIso) {
  const stats = await statsRecalc(userId, dateIso);
  await dbFood.saveUserStats(userId, dateIso, JSON.stringify(stats));
  return stats;
}

async function statsRecalc(userId, dateIso) {
  const firstDate = await dbFood.getUserFirstDate(userId);
  if (!firstDate) throw new Error('No user data found');

  const allDates = getDatesList(firstDate, dateIso);

  const weightsRaw = await dbFood.getWeightHistory(userId, firstDate, dateIso);
  const weightsPrepped = prepareWeights(weightsRaw, allDates);

  const diaryEntriesRaw = await dbFood.getDiaryEntriesHistory(userId, firstDate, dateIso);
  const diaryEntriesPrepped = prepareDiaryEntries(diaryEntriesRaw, allDates);

  const coefficients = await getCoefficients(userId);
  const dailySumKcals = calculateDailySumKcals(diaryEntriesPrepped, coefficients, allDates);

  const avgDays = 7;
  const dailySumKcalsAvg = calculateAverage(dailySumKcals, avgDays, true, 0);
  const weightsPrepAvg = calculateAverage(weightsPrepped, avgDays, true, 1);

  const normDays = 30;
  const targetKcals = computeTargetKcalsFromHistory(dailySumKcalsAvg, weightsPrepAvg, normDays);
  const targetKcalsAvg = calculateAverage(targetKcals, normDays, true, 0);

  const preparedStats = prepareStats(allDates, weightsPrepped, weightsPrepAvg, dailySumKcals, targetKcalsAvg);
  return preparedStats;
}

function getDatesList(dateIsoFirst, dateIsoLast) {
  const dateFirst = utils.createUtcDateFromIsoString(dateIsoFirst);
  const dateLast = utils.createUtcDateFromIsoString(dateIsoLast);
  const daysAmt = Math.floor((dateLast - dateFirst) / (1000 * 60 * 60 * 24)) + 1;
  const datesList = [];
  const currentDate = dateFirst;

  for (let dayIndex = 0; dayIndex < daysAmt; dayIndex++) {
    const nextDate = new Date(currentDate.getTime());
    nextDate.setUTCDate(currentDate.getUTCDate() + dayIndex);
    const formattedDate = nextDate.toISOString().split('T')[0];
    datesList.push(formattedDate);
  }

  return datesList;
}

function prepareWeights(weightsRaw, allDates) {
  const weights = Object.fromEntries(allDates.map((date) => [date, null]));

  weightsRaw.forEach((item) => {
    weights[item.dateISO] = parseFloat(item.weight);
  });

  return weights;
}

function prepareDiaryEntries(diaryEntriesRaw, allDates) {
  const entries = Object.fromEntries(allDates.map((date) => [date, null]));

  diaryEntriesRaw.forEach((row) => {
    if (!entries[row.dateISO]) {
      entries[row.dateISO] = [];
    }
    entries[row.dateISO].push({
      foodId: row.foodCatalogueId,
      weight: row.foodWeight,
      calories: row.kcals,
    });
  });

  return entries;
}

function calculateDailySumKcals(diaryEntries, coefficients, allDates) {
  const dailySumKcals = Object.fromEntries(allDates.map((date) => [date, null]));

  for (const [date, entries] of Object.entries(diaryEntries)) {
    if (entries === null) continue;

    dailySumKcals[date] = 0;

    for (const { foodId, weight, calories } of entries) {
      dailySumKcals[date] += (weight / 100) * calories * coefficients[foodId];
    }
  }

  return dailySumKcals;
}

export async function getCoefficients(userId) {
  const useCoeffs = true; // TODO[067]: Force enabled for now, implement in settings
  if (!useCoeffs) {
    return await makeOnesForCoefficients();
  }

  return await getAndValidateCoefficients(userId);
}

async function makeOnesForCoefficients() {
  const catalogueEntries = await dbFood.getAllFoodCatalogueEntries();
  return Object.fromEntries(catalogueEntries.map((item) => [item.id, 1.0]));
}

async function getAndValidateCoefficients(userId) {
  const catalogueEntries = await dbFood.getAllFoodCatalogueEntries();
  const coeffsResult = await dbFood.getUsersCoefficients(userId);

  let usersCoeffs = {};
  try {
    if (coeffsResult && coeffsResult.coefficients) {
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
      await dbFood.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    }

    if (usersCoeffsIdsSet.size > catalogueIdsSet.size) {
      for (const id of usersCoeffsIdsSet) {
        if (!catalogueIdsSet.has(id)) {
          delete usersCoeffs[id];
        }
      }
      await dbFood.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
    }
  } catch (error) {
    usersCoeffs = Object.fromEntries(catalogueEntries.map((item) => [item.id, 1.0]));
    await dbFood.setUsersCoefficients(userId, JSON.stringify(usersCoeffs));
  }

  return usersCoeffs;
}

function calculateAverage(inputDict, avgRange, roundBool = false, roundPlaces = 0) {
  const keys = Object.keys(inputDict);
  const values = Object.values(inputDict);

  for (let i = 1; i < values.length; i++) {
    if (values[i] === null) {
      values[i] = values[i - 1];
    }
  }

  const averaged = values.map((_, i) => {
    const start = Math.max(0, i - avgRange + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

    if (roundBool) {
      return roundPlaces > 0 ? Number(avg.toFixed(roundPlaces)) : Math.round(avg);
    }
    return avg;
  });

  return Object.fromEntries(keys.map((k, i) => [k, averaged[i]]));
}

function computeTargetKcalsFromHistory(kcals, weights, n) {
  const kcalsKeys = Object.keys(kcals);
  const kcalsValues = Object.values(kcals);
  const weightsValues = Object.values(weights);
  const averaged = [];

  for (let i = n - 1; i < kcalsValues.length; i++) {
    const kcalsSlice = kcalsValues.slice(i - n + 1, i + 1);
    const weightDiff = weightsValues[i] - weightsValues[i - n + 1];
    averaged.push((kcalsSlice.reduce((a, b) => a + b, 0) - weightDiff * 7700) / n);
  }

  const resultKeys = kcalsKeys.slice(kcalsKeys.length - averaged.length);

  return Object.fromEntries(resultKeys.map((k, i) => [k, averaged[i]]));
}

function prepareStats(allDates, weights, avgWeights, dailySumKcals, targetKcalsAvg) {
  const stats = {};

  allDates.forEach((day) => {
    stats[day] = [weights[day], avgWeights[day], dailySumKcals[day], targetKcalsAvg[day]];
  });

  return stats;
}
