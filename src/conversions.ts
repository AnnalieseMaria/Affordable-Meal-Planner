import type { Ingredient, Meal } from "./meals";

// --- Types ---

export type PantryItem = {
  ingredientId: number;
  servingsRemaining: number;
};

export type ShoppingItem = {
  ingredientId: number;
  name: string;
  containersToBuy: number;
  shortage: number;
};

// --- Unit conversion map (base unit is tbsp) ---

const TO_TBSP: Record<string, number> = {
  "1/4 tsp": 1 / 12,
  "1/2 tsp": 1 / 6,
  "3/4 tsp": 1 / 4,
  "1 tsp":   1 / 3,
  "tsp":     1 / 3,
  "tbsp":    1,
  "1/4 cup": 4,
  "1/2 cup": 8,
  "3/4 cup": 12,
  "cup":     16,
  "fl oz":   2,
  "oz":      2,
  "unit":    1,
  "can":     1,
};

// --- Core conversion ---

function toTbsp(amount: number, unit: string): number {
  const ratio = TO_TBSP[unit];
  if (!ratio) throw new Error(`Unknown unit: ${unit}`);
  return amount * ratio;
}

export function calcServingsUsed(
  ingredient: Ingredient,
  recipeSize: number,
  recipeUnit: string,
): number {
  if (ingredient.servingSize === null || ingredient.servingUnit === null) {
    throw new Error(`Missing serving info for ingredient: ${ingredient.name}`);
  }
  const recipeInTbsp  = toTbsp(recipeSize, recipeUnit);
  const servingInTbsp = toTbsp(ingredient.servingSize, ingredient.servingUnit);
  return recipeInTbsp / servingInTbsp;
}

// --- How many times can you make this meal? ---

export function howManyMealsCanIMake(
  recipe: Meal,
  ingredients: Record<number, Ingredient>,
  pantry: Record<number, PantryItem>,
): number {
  const counts = recipe.ingredients
    .filter(ri => ri.ingredientId !== null)
    .map(ri => {
      const ingredient = ingredients[ri.ingredientId!];
      const pantryItem = pantry[ri.ingredientId!];
      if (!pantryItem) return 0;

      const servingsUsedPerMeal = calcServingsUsed(
        ingredient,
        ri.amountInfo.size,
        ri.amountInfo.unit,
      );

      return Math.floor(pantryItem.servingsRemaining / servingsUsedPerMeal);
    });

  return Math.min(...counts);
}

// --- What do you need to buy? ---

export function calcShoppingList(
  recipe: Meal,
  ingredients: Record<number, Ingredient>,
  pantry: Record<number, PantryItem>,
  mealsNeeded: number,
  servingsPerMeal: number,
): ShoppingItem[] {
  const totalMeals = mealsNeeded * servingsPerMeal;

  return recipe.ingredients
    .filter(ri => ri.ingredientId !== null)
    .map(ri => {
      const ingredient = ingredients[ri.ingredientId!];
      const pantryItem = pantry[ri.ingredientId!];

      const servingsUsedPerMeal = calcServingsUsed(
        ingredient,
        ri.amountInfo.size,
        ri.amountInfo.unit,
      );

      const totalServingsNeeded = servingsUsedPerMeal * totalMeals;
      const alreadyHave = pantryItem?.servingsRemaining ?? 0;
      const shortage = totalServingsNeeded - alreadyHave;
      const containersToBuy = shortage > 0
        ? Math.ceil(shortage / (ingredient.servingsPerContainer ?? 1))
        : 0;

      return {
        ingredientId: ri.ingredientId!,
        name: ri.name,
        shortage: Math.max(0, shortage),
        containersToBuy,
      };
    });
}

// --- Update pantry after prepping a meal ---

export function updatePantryAfterPrep(
  pantry: Record<number, PantryItem>,
  recipe: Meal,
  ingredients: Record<number, Ingredient>,
  mealsPrepped: number,
  servingsPerMeal: number,
): Record<number, PantryItem> {
  const totalMeals = mealsPrepped * servingsPerMeal;
  const updatedPantry = { ...pantry };

  recipe.ingredients
    .filter(ri => ri.ingredientId !== null)
    .forEach(ri => {
      const ingredient = ingredients[ri.ingredientId!];
      const servingsUsed = calcServingsUsed(
        ingredient,
        ri.amountInfo.size,
        ri.amountInfo.unit,
      ) * totalMeals;

      updatedPantry[ri.ingredientId!] = {
        ...updatedPantry[ri.ingredientId!],
        servingsRemaining:
          (updatedPantry[ri.ingredientId!]?.servingsRemaining ?? 0) - servingsUsed,
      };
    });

  return updatedPantry;
}