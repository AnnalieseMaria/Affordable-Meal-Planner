import type { Meal } from './meals.ts'
import ingredientsData from './ingredients.json'

export type Filters = {
  cuisine: string | null
  dietType: string | null
  perMealBudget: number | null 
}


export function filterMeals(meals: Meal[], filters: Filters): Meal[] {
  return meals.filter(meal => {
    //check what meals from the selected cuisine and are equal to or lower than the budger 
    if (filters.cuisine && meal.cuisine !== filters.cuisine) return false
    if (filters.dietType && !meal.dietType.includes(filters.dietType)) return false
    if (filters.perMealBudget && getMealCost(meal).total > filters.perMealBudget) return false // if a mealbudget exists and is greater than calculated cost -> dont add meal to arr
    return true //returning true means meal passed both checks and stays in results array
  })
}

export type TimeFrame = 'day' | 'few days' | 'week' | 'two weeks' | 'month'

export function calculateMaxBudgetPerMeal(totalGroceryBudget: string, timeframe: TimeFrame): number {

  const daysMap = { 
    'day': 1,
    'few days': 3,
    'week': 7,
    'two weeks': 14,
    'month': 30
  }
  
  const numberOfDays = daysMap[timeframe]; 
  const totalBudget = parseFloat(totalGroceryBudget);

  const perMealBudget = totalBudget / (numberOfDays * 3); 
  return perMealBudget; 
  
}

export type MealCost = {
  total: number, 
  hasNonAldi: boolean, 
  missingIngredients: string []
}

export function getMealCost(meal: Meal): MealCost{

  let total = 0;
  const nonAldiIngredients: string[] = []; 

  for (const ing of meal.ingredients) {
    if(ing.ingredientId == null) {
      //when null add to an array to return non aldi ingredients NOT included in meal cost 
      nonAldiIngredients.push(ing.name); 
    } else {
      let ingIdString = ing.ingredientId.toString() as keyof (typeof ingredientsData);
      total += formattedPriceToNumber(ingredientsData[ingIdString].formattedPrice);
    }
  }

  return { 
    total, 
    hasNonAldi: nonAldiIngredients.length > 0, //if length > 0 theres non aldiIngs-> true, else no ing are non aldi-> false. 
    missingIngredients: nonAldiIngredients 
  }
}

 function formattedPriceToNumber (formattedPrice: string): number {
  return parseFloat(formattedPrice.replace('$', ''));
 }





 // const test = (ing) => { //now we are in type MealIngredient
//   if (ing.ingredientId == null) {
//     //if its null then set nonaldi ing boolean to true and add to array 
//   } else {
//     //ing is sold at aldis so get price 
//     let ingIdString = ing.ingredientId.toString() as keyof (typeof ingredientsData);
//     total += formattedPriceToNumber(ingredientsData[ingIdString].formattedPrice);
//   }
// };

  // let total = meal.ingredients.map((ing) => {
  //       let ingIdString = ing.ingredientId.toString() as keyof (typeof ingredientsData);
  //   return formattedPriceToNumber(ingredientsData[ingIdString].formattedPrice);
  // }).reduce((total, price) => {
  //   return total + price;
  // });

  // [2.75, 3.56, 1.25]

  //other option below: 
  // for (let i = 0; i < meal.ingredients.length; i++ ){
  //   let ing = meal.ingredients[i];
  // }