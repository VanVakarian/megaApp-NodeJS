import * as utils from '../../utils/utils.js';
import * as foodService from './food-service.js';
import * as dbFood from '../../db/db-food.js';

export async function getFoodDiaryFullUpdateRange(request, reply) {
  const userId = request.user.id;
  const { date: dateIso, offset: offset } = request.query;
  const offsetInDays = parseInt(offset, 10);

  const datesIsoList = foodService.getDateRange(dateIso, offsetInDays);
  const [startDateUnix, endDateUnix] = utils.getStartAndEndUnixDates(dateIso, offsetInDays);

  let diaryResult = foodService.dictifyDatesList(datesIsoList);

  const foodDiaryRawData = await dbFood.getRangeOfUsersDiaryEntries(userId, startDateUnix, endDateUnix);
  const foodDiaryPrepped = foodService.organizeByDatesAndIds(foodDiaryRawData);
  diaryResult = foodService.extendDiary(diaryResult, 'food', foodDiaryPrepped, {});

  const bodyWeightRawData = await dbFood.getRangeOfUsersBodyWeightEntries(userId, startDateUnix, endDateUnix);
  diaryResult = foodService.extendDiary(diaryResult, 'targetKcals', {}, 2500);

  const bodyWeightPrepped = foodService.organizeWeightsByDate(bodyWeightRawData);
  diaryResult = foodService.extendDiary(diaryResult, 'bodyWeight', bodyWeightPrepped, null);

  await reply.code(200).send(JSON.stringify(diaryResult));
}

export async function postFood(request, reply) {
  const userId = request.user.id;
  console.log('request', request.body);
  console.log('123');
  await utils.sleep(3000);
  console.log('456');
  // const { date, id, name, calories, protein, carbs, fat, image } = request.body;

  // const foodItem = await foodService.postFoodItem(userId, date, id, name, calories, protein, carbs, fat, image);
  // console.log('foodItem', foodItem);

  await reply.code(200).send(JSON.stringify({ tempFoodId: request.body.foodId, newFoodId: 777 }));
}

export async function getCatalogue(request, reply) {
  const catalogue = await foodService.formFoodCatalogue();
  // console.log('catalogue', catalogue);
  await reply.code(200).send(JSON.stringify(catalogue));
}

export async function editDiaryEntry(request, reply) {
  const diaryEntry = request.body;
  const userId = request.user.id;
  const historyString = await foodService.makeUpdatedHistoryString(diaryEntry.id, userId, diaryEntry.history[0]);
  const res = await dbFood.db_edit_diary_entry(diaryEntry.foodWeight, historyString, diaryEntry.id, userId);
  reply.code(200).send({ result: res, value: diaryEntry.id });
}
