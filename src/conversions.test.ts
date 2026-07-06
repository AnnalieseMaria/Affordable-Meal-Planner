// conversions.test.ts

import { calcServingsUsed, howManyMealsCanIMake, updatePantryAfterPrep } from "./conversions";
import type { Ingredient, Meal } from "./meals";
import type { PantryItem } from "./conversions";

// --- Mock data ---

const oliveOil: Ingredient = {
  ingredientId: 2442,
  name: "Organic Extra Virgin Olive Oil",
  brandName: "Simply Nature",
  comparisonPriceUnit: "fl oz",
  usaSnapEligible: true,
  formattedPrice: "$6.49",
  categoryName: "Oils & Vinegars",
  mainCategoryName: "Pantry Essentials",
  isMeat: false,
  isFish: false,
  isDairy: false,
  isEgg: false,
  containsGluten: false,
  containsNuts: false,
  calories: 120,
  protein: 0,
  carbs: 0,
  fat: 14,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  nutritionFlagged: false,
  servingsPerContainer: 33,
  servingSize: 1,
  servingUnit: "tbsp",
  servingDisplay: "1 tbsp",
};

const ingredients: Record<number, Ingredient> = {
  2442: oliveOil,
};

const pantry: Record<number, PantryItem> = {
  2442: { ingredientId: 2442, servingsRemaining: 33 },
};

// --- Tests ---

// 1. recipe needs 1 tbsp, serving is 1 tbsp → 1 serving used
console.log(calcServingsUsed(oliveOil, 1, "tbsp")); // should be 1

// 2. recipe needs 1 tsp, serving is 1 tbsp → 0.333 servings used
console.log(calcServingsUsed(oliveOil, 1, "tsp")); // should be 0.333

// 3. pantry has 33 servings, recipe uses 1 per meal → 33 meals
console.log(howManyMealsCanIMake(
  { ingredients: [{ ingredientId: 2442, name: "Olive Oil", amountInfo: { size: 1, unit: "tbsp" }, aldiProduct: true }] } as unknown as Meal,
  ingredients,
  pantry,
)); // should be 33

// 4. after prepping 2 meals for 4 people → 33 - 8 = 25 remaining
const updatedPantry = updatePantryAfterPrep(pantry, 
  { ingredients: [{ ingredientId: 2442, name: "Olive Oil", amountInfo: { size: 1, unit: "tbsp" }, aldiProduct: true }] } as unknown as Meal,
  ingredients, 2, 4
);
console.log(updatedPantry[2442].servingsRemaining); // should be 25