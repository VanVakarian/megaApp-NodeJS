import { sleep } from '../../utils/utils.js';
import * as foodService from './food-service.js';

export async function getDiary(request, reply) {
  const userId = request.user.id;
  // console.log('userId', userId);

  const { date: dateIso, offset: offsetInDays } = request.query;
  // console.log('dateIsoStringOpional', dateIsoOpional);
  // console.log('rangeDaysOptional', rangeDaysOptional);

  const datesList = foodService.getDateRange(dateIso, offsetInDays);
  // console.log('datesList', datesList);
  let diaryResult = foodService.dictifyDatesList(datesList);
  // console.log('diaryResult', diaryResult);

  const foodDiaryRawData = await foodService.getFoodDiaryRange(userId, dateIso, offsetInDays);
  // console.log('foodDiaryRaw', foodDiaryRaw);
  const foodDiaryPrepped = foodService.organizeByDatesAndIds(foodDiaryRawData);

  diaryResult = foodService.extendDiary(diaryResult, 'food', foodDiaryPrepped, {});
  // console.log('diaryResult', diaryResult);

  diaryResult = foodService.extendDiary(diaryResult, 'bodyWeight', {}, null);
  // console.log('diaryResult', diaryResult);

  diaryResult = foodService.extendDiary(diaryResult, 'targetKcals', {}, 2500);
  // console.log('diaryResult', diaryResult);

  await reply.code(200).send(JSON.stringify(diaryResult));
}

export async function postFood(request, reply) {
  const userId = request.user.id;
  console.log('request', request.body);
  console.log('123');
  await sleep(3000);
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
