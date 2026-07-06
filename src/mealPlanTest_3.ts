// ============================================================
// SAMPLE DATA — swap this out for your real JSON imports later
// ============================================================

type MealTypeSlot = "Breakfast" | "Lunch" | "Dinner";

type Ingredient = {
  name: string;
  aldiProduct: boolean;
  ingredientId: number;
  amountInfo: { size: number; unit: string };
};

type Recipe = {
  recipeId: number;
  name: string;
  recipeServings: number;
  cuisine: string;
  mealType: MealTypeSlot[];
  dietType: string[];
  ingredients: Ingredient[];
};

type PriceInfo = {
  ingredientId: number;
  name: string;
  formattedPrice: string;
  servingsPerContainer: number;
  servingSize: number;
  servingUnit: string;
};

type PriceLookup = Record<string, PriceInfo>;

const sampleRecipes: Recipe[] = [
  // ---------------- BREAKFAST ----------------
  {
    recipeId: 13,
    name: "Egg & Scallion Crepe",
    recipeServings: 1,
    cuisine: "Chinese",
    mealType: ["Breakfast"],
    dietType: ["Vegetarian", "Dairy-Free"],
    ingredients: [
      { name: "All-Purpose Flour", aldiProduct: true, ingredientId: 2387, amountInfo: { size: 0.5, unit: "cup" } },
      { name: "Pasture Raised Eggs", aldiProduct: true, ingredientId: 134, amountInfo: { size: 1, unit: "unit" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 3, unit: "stalk" } },
      { name: "Olive Oil", aldiProduct: true, ingredientId: 868, amountInfo: { size: 1, unit: "tsp" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 1, unit: "tbsp" } },
      { name: "Honey", aldiProduct: true, ingredientId: 2261, amountInfo: { size: 1, unit: "tsp" } },
    ],
  },
  {
    recipeId: 14,
    name: "Steamed Silky Eggs",
    recipeServings: 1,
    cuisine: "Chinese",
    mealType: ["Breakfast", "Lunch"],
    dietType: ["Vegetarian", "Gluten-Free", "Dairy-Free"],
    ingredients: [
      { name: "Pasture Raised Eggs", aldiProduct: true, ingredientId: 134, amountInfo: { size: 1, unit: "unit" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 1, unit: "stalk" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 0.5, unit: "tsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tsp" } },
    ],
  },
  {
    recipeId: 15,
    name: "Plain Congee",
    recipeServings: 2,
    cuisine: "Chinese",
    mealType: ["Breakfast"],
    dietType: ["Vegan", "Vegetarian", "Gluten-Free", "Dairy-Free"],
    ingredients: [
      { name: "Cooked White Rice", aldiProduct: true, ingredientId: 5001, amountInfo: { size: 1, unit: "cup" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 1, unit: "stalk" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 0.5, unit: "tsp" } },
    ],
  },
  {
    recipeId: 16,
    name: "Scallion Pancakes",
    recipeServings: 2,
    cuisine: "Chinese",
    mealType: ["Breakfast", "Lunch"],
    dietType: ["Vegan", "Vegetarian", "Dairy-Free"],
    ingredients: [
      { name: "All-Purpose Flour", aldiProduct: true, ingredientId: 2387, amountInfo: { size: 1, unit: "cup" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 4, unit: "stalk" } },
      { name: "Olive Oil", aldiProduct: true, ingredientId: 868, amountInfo: { size: 2, unit: "tsp" } },
    ],
  },

  // ---------------- LUNCH / DINNER ----------------
  {
    recipeId: 21,
    name: "Chicken Fried Rice",
    recipeServings: 4,
    cuisine: "Chinese",
    mealType: ["Lunch", "Dinner"],
    dietType: ["Dairy-Free"],
    ingredients: [
      { name: "Cooked White Rice", aldiProduct: true, ingredientId: 5001, amountInfo: { size: 3, unit: "cup" } },
      { name: "Chicken Breast", aldiProduct: true, ingredientId: 5002, amountInfo: { size: 1, unit: "lb" } },
      { name: "Pasture Raised Eggs", aldiProduct: true, ingredientId: 134, amountInfo: { size: 2, unit: "unit" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 2, unit: "stalk" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 2, unit: "tbsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tbsp" } },
    ],
  },
  {
    recipeId: 22,
    name: "Beef and Broccoli",
    recipeServings: 4,
    cuisine: "Chinese",
    mealType: ["Dinner"],
    dietType: ["Dairy-Free", "Gluten-Free"],
    ingredients: [
      { name: "Beef Sirloin", aldiProduct: true, ingredientId: 5003, amountInfo: { size: 1, unit: "lb" } },
      { name: "Broccoli Florets", aldiProduct: true, ingredientId: 5004, amountInfo: { size: 2, unit: "cup" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 3, unit: "tbsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tbsp" } },
    ],
  },
  {
    recipeId: 23,
    name: "Vegetable Lo Mein",
    recipeServings: 3,
    cuisine: "Chinese",
    mealType: ["Lunch", "Dinner"],
    dietType: ["Vegan", "Vegetarian", "Dairy-Free"],
    ingredients: [
      { name: "Lo Mein Noodles", aldiProduct: true, ingredientId: 6001, amountInfo: { size: 8, unit: "oz" } },
      { name: "Broccoli Florets", aldiProduct: true, ingredientId: 5004, amountInfo: { size: 1, unit: "cup" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 2, unit: "stalk" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 2, unit: "tbsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tbsp" } },
    ],
  },
  {
    recipeId: 24,
    name: "Kung Pao Chicken",
    recipeServings: 4,
    cuisine: "Chinese",
    mealType: ["Dinner"],
    dietType: ["Dairy-Free"],
    ingredients: [
      { name: "Chicken Breast", aldiProduct: true, ingredientId: 5002, amountInfo: { size: 1, unit: "lb" } },
      { name: "Roasted Peanuts", aldiProduct: true, ingredientId: 6002, amountInfo: { size: 0.5, unit: "cup" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 3, unit: "tbsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tbsp" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 2, unit: "stalk" } },
    ],
  },
  {
    recipeId: 25,
    name: "Mapo Tofu",
    recipeServings: 3,
    cuisine: "Chinese",
    mealType: ["Lunch", "Dinner"],
    dietType: ["Vegan", "Vegetarian", "Dairy-Free", "Gluten-Free"],
    ingredients: [
      { name: "Firm Tofu", aldiProduct: true, ingredientId: 6003, amountInfo: { size: 14, unit: "oz" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 2, unit: "stalk" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 2, unit: "tbsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tbsp" } },
    ],
  },
  {
    recipeId: 26,
    name: "Sweet and Sour Pork",
    recipeServings: 4,
    cuisine: "Chinese",
    mealType: ["Dinner"],
    dietType: ["Dairy-Free"],
    ingredients: [
      { name: "Pork Loin", aldiProduct: true, ingredientId: 6004, amountInfo: { size: 1, unit: "lb" } },
      { name: "Pineapple Chunks", aldiProduct: true, ingredientId: 6005, amountInfo: { size: 1, unit: "cup" } },
      { name: "All-Purpose Flour", aldiProduct: true, ingredientId: 2387, amountInfo: { size: 0.5, unit: "cup" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 2, unit: "tbsp" } },
    ],
  },
  {
    recipeId: 27,
    name: "Dan Dan Noodles",
    recipeServings: 2,
    cuisine: "Chinese",
    mealType: ["Lunch"],
    dietType: ["Dairy-Free"],
    ingredients: [
      { name: "Lo Mein Noodles", aldiProduct: true, ingredientId: 6001, amountInfo: { size: 6, unit: "oz" } },
      { name: "Chicken Breast", aldiProduct: true, ingredientId: 5002, amountInfo: { size: 0.5, unit: "lb" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tbsp" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 1, unit: "tbsp" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 2, unit: "stalk" } },
    ],
  },
  {
    recipeId: 28,
    name: "Vegetable Fried Rice",
    recipeServings: 3,
    cuisine: "Chinese",
    mealType: ["Lunch", "Dinner"],
    dietType: ["Vegan", "Vegetarian", "Dairy-Free", "Gluten-Free"],
    ingredients: [
      { name: "Cooked White Rice", aldiProduct: true, ingredientId: 5001, amountInfo: { size: 2, unit: "cup" } },
      { name: "Broccoli Florets", aldiProduct: true, ingredientId: 5004, amountInfo: { size: 1, unit: "cup" } },
      { name: "Fresh Scallions", aldiProduct: true, ingredientId: 1032, amountInfo: { size: 2, unit: "stalk" } },
      { name: "Low Sodium Soy Sauce", aldiProduct: true, ingredientId: 2339, amountInfo: { size: 1.5, unit: "tbsp" } },
      { name: "Sesame Oil", aldiProduct: true, ingredientId: 3340, amountInfo: { size: 1, unit: "tsp" } },
    ],
  },
];

const samplePriceLookup: PriceLookup = {
  "2387": { ingredientId: 2387, name: "All-Purpose Flour", formattedPrice: "$2.15", servingsPerContainer: 40, servingSize: 0.25, servingUnit: "cup" },
  "134": { ingredientId: 134, name: "Pasture Raised Eggs", formattedPrice: "$4.29", servingsPerContainer: 12, servingSize: 1, servingUnit: "unit" },
  "1032": { ingredientId: 1032, name: "Fresh Scallions", formattedPrice: "$1.49", servingsPerContainer: 8, servingSize: 1, servingUnit: "stalk" },
  "868": { ingredientId: 868, name: "Olive Oil", formattedPrice: "$6.99", servingsPerContainer: 96, servingSize: 1, servingUnit: "tsp" },
  "2339": { ingredientId: 2339, name: "Reduced Sodium Soy Sauce, 15 fl oz", formattedPrice: "$1.75", servingsPerContainer: 30, servingSize: 1, servingUnit: "tbsp" },
  "2261": { ingredientId: 2261, name: "Honey", formattedPrice: "$3.49", servingsPerContainer: 24, servingSize: 1, servingUnit: "tsp" },
  "3340": { ingredientId: 3340, name: "Sesame Oil", formattedPrice: "$4.99", servingsPerContainer: 48, servingSize: 1, servingUnit: "tsp" },
  "5001": { ingredientId: 5001, name: "White Rice", formattedPrice: "$3.99", servingsPerContainer: 12, servingSize: 1, servingUnit: "cup" },
  "5002": { ingredientId: 5002, name: "Chicken Breast", formattedPrice: "$8.99", servingsPerContainer: 3, servingSize: 1, servingUnit: "lb" },
  "5003": { ingredientId: 5003, name: "Beef Sirloin", formattedPrice: "$10.99", servingsPerContainer: 2, servingSize: 1, servingUnit: "lb" },
  "5004": { ingredientId: 5004, name: "Broccoli Florets", formattedPrice: "$2.99", servingsPerContainer: 4, servingSize: 1, servingUnit: "cup" },
  "6001": { ingredientId: 6001, name: "Lo Mein Noodles", formattedPrice: "$2.49", servingsPerContainer: 16, servingSize: 1, servingUnit: "oz" },
  "6002": { ingredientId: 6002, name: "Roasted Peanuts", formattedPrice: "$3.29", servingsPerContainer: 6, servingSize: 0.5, servingUnit: "cup" },
  "6003": { ingredientId: 6003, name: "Firm Tofu", formattedPrice: "$2.19", servingsPerContainer: 1, servingSize: 14, servingUnit: "oz" },
  "6004": { ingredientId: 6004, name: "Pork Loin", formattedPrice: "$7.49", servingsPerContainer: 2, servingSize: 1, servingUnit: "lb" },
  "6005": { ingredientId: 6005, name: "Pineapple Chunks", formattedPrice: "$2.79", servingsPerContainer: 3, servingSize: 1, servingUnit: "cup" },
};

// ============================================================
// DATE HELPERS
// ============================================================

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimeframeDays(timeframe: string): number {
  const days: Record<string, number> = {
    "one week": 7,
    "two weeks": 14,
    "three week": 21,
    "one month": 30,
  };
  return days[timeframe] ?? 7;
}

function getDateStrings(startDate: string, timeframe: string): string[] {
  const start = new Date(startDate + 'T00:00:00');
  const numDays = getTimeframeDays(timeframe);
  const dates: string[] = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ============================================================
// PANTRY / PRICING LOGIC
// ============================================================

type PantryEntry = {
  ingredientId: number;
  name: string;
  remainingAmount: number;
  packagesPurchased: number;
};

type Pantry = Map<number, PantryEntry>;

type Leftover = {
  recipe: Recipe;
  mealType: MealTypeSlot;
  remainingServings: number;
};

function parsePrice(formattedPrice: string): number {
  return parseFloat(formattedPrice.replace('$', ''));
}

function getPackageTotalAmount(price: PriceInfo): number {
  return price.servingsPerContainer * price.servingSize;
}

function getBatchesNeeded(recipe: Recipe, familySize: number): number {
  return Math.ceil(familySize / recipe.recipeServings);
}

function usePantryIngredient(
  pantry: Pantry,
  ingredient: Ingredient,
  priceLookup: PriceLookup,
  batches: number
): void {
  const priceInfo = priceLookup[ingredient.ingredientId.toString()];
  if (!priceInfo) {
    console.warn(`No price found for ${ingredient.name}, skipping`);
    return;
  }

  const needed = ingredient.amountInfo.size * batches;
  let entry = pantry.get(ingredient.ingredientId);

  if (!entry) {
    entry = { ingredientId: ingredient.ingredientId, name: ingredient.name, remainingAmount: 0, packagesPurchased: 0 };
    pantry.set(ingredient.ingredientId, entry);
  }

  const packageAmount = getPackageTotalAmount(priceInfo);
  while (entry.remainingAmount < needed) {
    entry.remainingAmount += packageAmount;
    entry.packagesPurchased += 1;
  }
  entry.remainingAmount -= needed;
}

// Cost to acquire a recipe WITHOUT actually committing/consuming pantry stock.
// Used for "what would this cost right now" checks.
function marginalCost(
  recipe: Recipe,
  pantry: Pantry,
  priceLookup: PriceLookup,
  batches: number
): number {
  let cost = 0;
  for (const ingredient of recipe.ingredients) {
    const priceInfo = priceLookup[ingredient.ingredientId.toString()];
    if (!priceInfo) continue;

    const entry = pantry.get(ingredient.ingredientId);
    const have = entry ? entry.remainingAmount : 0;
    const needed = ingredient.amountInfo.size * batches;

    if (have < needed) {
      const packageAmount = getPackageTotalAmount(priceInfo);
      const shortfall = needed - have;
      const packagesToBuy = Math.ceil(shortfall / packageAmount);
      cost += packagesToBuy * parsePrice(priceInfo.formattedPrice);
    }
  }
  return cost;
}

// The cheapest a pool of recipes COULD cost right now, given current pantry state.
// Used to figure out how much money must be "reserved" for meals still ahead.
function cheapestPossibleCost(
  pool: Recipe[],
  familySize: number,
  pantry: Pantry,
  priceLookup: PriceLookup
): number {
  if (pool.length === 0) return 0;
  const costs = pool.map(recipe => {
    const batches = getBatchesNeeded(recipe, familySize);
    return marginalCost(recipe, pantry, priceLookup, batches);
  });
  return Math.min(...costs);
}

// Same as above, but ignores recipes already used earlier THIS SAME DAY — needed
// because a cheap recipe eaten at breakfast can't also be reserved as the cheap
// fallback for lunch/dinner; the real minimum cost for what's left is higher.
function cheapestPossibleCostExcluding(
  pool: Recipe[],
  excludeToday: Set<number>,
  familySize: number,
  pantry: Pantry,
  priceLookup: PriceLookup
): number {
  const filtered = pool.filter(r => !excludeToday.has(r.recipeId));
  return cheapestPossibleCost(filtered.length > 0 ? filtered : pool, familySize, pantry, priceLookup);
}

// ============================================================
// MEAL PLAN GENERATION (budget-safe, variety-seeking)
// ============================================================

type DayPlan = {
  date: string;
  breakfast: Recipe | null;
  lunch: Recipe | null;
  dinner: Recipe | null;
};

function filterRecipes(
  recipes: Recipe[],
  cuisines: string[],
  dietType: string,
  slot: MealTypeSlot
): Recipe[] {
  return recipes.filter(r =>
    cuisines.includes(r.cuisine) &&
    r.dietType.includes(dietType) &&
    r.mealType.includes(slot)
  );
}

// Picks a meal for one slot: leftovers first (free), then a RANDOM pick among
// everything that fits the remaining budget (after reserving for meals still
// ahead). If nothing "comfortably" fits, falls back to the cheapest option so
// the plan never goes over budget.
function pickAffordableVariedMeal(
  pool: Recipe[],
  mealType: MealTypeSlot,
  familySize: number,
  pantry: Pantry,
  priceLookup: PriceLookup,
  usedIds: Set<number>,
  leftovers: Leftover[],
  remainingBudget: number,
  reserveForRest: number,
  excludeToday: Set<number>,
  fairShareCeiling: number
): { recipe: Recipe | null; cost: number } {
  // 1. Leftovers are always free and always used first — but never repeat
  //    a recipe that's already been eaten earlier THIS SAME DAY
  const leftoverIndex = leftovers.findIndex(
    l => l.mealType === mealType && l.remainingServings >= familySize && !excludeToday.has(l.recipe.recipeId)
  );
  if (leftoverIndex !== -1) {
    const leftover = leftovers[leftoverIndex];
    leftover.remainingServings -= familySize;
    if (leftover.remainingServings <= 0) leftovers.splice(leftoverIndex, 1);
    return { recipe: leftover.recipe, cost: 0 };
  }

  // Never re-pick a recipe already used earlier today (e.g. breakfast recipe
  // showing up again for lunch just because it's tagged for both meal types)
  const poolExcludingToday = pool.filter(r => !excludeToday.has(r.recipeId));
  if (poolExcludingToday.length === 0) return { recipe: null, cost: 0 };

  // Prefer recipes not yet used, for variety — fall back to full pool if exhausted
  const unused = poolExcludingToday.filter(r => !usedIds.has(r.recipeId));
  const idealPool = unused.length > 0 ? unused : poolExcludingToday;

  const scoreRecipes = (recipes: Recipe[]) =>
    recipes.map(recipe => {
      const batches = getBatchesNeeded(recipe, familySize);
      const cost = marginalCost(recipe, pantry, priceLookup, batches);
      return { recipe, batches, cost };
    });

  // Two ceilings combine here:
  // - reserve ceiling: the hard safety floor, ensures enough is left for the
  //   cheapest possible version of every remaining meal this week
  // - fair share ceiling: a softer cap based on an even split of what's left
  //   across all remaining meals this week, so one pricey early pick can't
  //   eat into what later days need for real variety
  const reserveCeiling = remainingBudget - reserveForRest;
  const affordableCeiling = Math.min(reserveCeiling, fairShareCeiling);
  const idealScored = scoreRecipes(idealPool);
  const affordable = idealScored.filter(s => s.cost <= affordableCeiling);

  let chosen;
  if (affordable.length > 0) {
    // Tier 1: random pick among anything that comfortably respects the reserve
    // for future meals — this is where variety comes from
    chosen = affordable[Math.floor(Math.random() * affordable.length)];
  } else {
    // Tier 2: nothing comfortably fits — widen the search to the FULL pool
    // (not just unused recipes) and cap strictly at the true remaining budget,
    // ignoring the softer reserve. This is what actually guarantees we never
    // go over — the old version skipped this check and could overspend.
    const fullScored = scoreRecipes(poolExcludingToday);
    const withinHardBudget = fullScored.filter(s => s.cost <= remainingBudget);

    if (withinHardBudget.length > 0) {
      withinHardBudget.sort((a, b) => a.cost - b.cost);
      chosen = withinHardBudget[0];
    } else {
      // Tier 3: even the cheapest available recipe costs more than what's left
      // in the budget. Rather than break the budget guarantee, skip this meal
      // slot entirely — this should be rare, and only happens when earlier
      // picks used up more of the budget than an ideal plan would have.
      return { recipe: null, cost: 0 };
    }
  }

  usedIds.add(chosen.recipe.recipeId);
  for (const ingredient of chosen.recipe.ingredients) {
    usePantryIngredient(pantry, ingredient, priceLookup, chosen.batches);
  }

  const totalServingsMade = chosen.recipe.recipeServings * chosen.batches;
  const leftoverServings = totalServingsMade - familySize;
  if (leftoverServings > 0) {
    leftovers.push({ recipe: chosen.recipe, mealType, remainingServings: leftoverServings });
  }

  return { recipe: chosen.recipe, cost: chosen.cost };
}

function generateMealPlan(
  allRecipes: Recipe[],
  cuisines: string[],
  dietType: string,
  familySize: number,
  startDate: string,
  timeframe: string,
  priceLookup: PriceLookup,
  weeklyBudget: number
): { plan: DayPlan[]; pantry: Pantry; totalSpend: number } {
  const dates = getDateStrings(startDate, timeframe);
  const breakfastPool = filterRecipes(allRecipes, cuisines, dietType, "Breakfast");
  const lunchPool = filterRecipes(allRecipes, cuisines, dietType, "Lunch");
  const dinnerPool = filterRecipes(allRecipes, cuisines, dietType, "Dinner");

  const pantry: Pantry = new Map();
  const leftovers: Leftover[] = [];
  const usedIds = { breakfast: new Set<number>(), lunch: new Set<number>(), dinner: new Set<number>() };

  const plan: DayPlan[] = [];
  let totalSpend = 0;
  let weekSpend = 0;
  let dayInWeek = 0;

  dates.forEach((date, index) => {
    // Reset the budget window every 7 days (one grocery-budget cycle per week)
    if (dayInWeek === 7) {
      dayInWeek = 0;
      weekSpend = 0;
    }
    const daysRemainingTotal = dates.length - index; // includes today
    const daysRemainingInWeek = Math.min(7 - dayInWeek, daysRemainingTotal);
    const daysLeftInWeekAfterToday = daysRemainingInWeek - 1;

    // Recipes chosen for THIS day only — prevents the same recipe from being
    // picked twice on one day (e.g. Scallion Pancakes for both breakfast and lunch)
    const excludeToday = new Set<number>();

    const dailyMinCost =
      cheapestPossibleCost(breakfastPool, familySize, pantry, priceLookup) +
      cheapestPossibleCost(lunchPool, familySize, pantry, priceLookup) +
      cheapestPossibleCost(dinnerPool, familySize, pantry, priceLookup);
    const reserveForFutureDays = dailyMinCost * daysLeftInWeekAfterToday;

    // Fair-share ceiling: split whatever budget remains evenly across every
    // meal slot still left this week (including the one we're about to pick).
    // This is what actually stops day 1 from spending half the week's budget
    // and starving day 6-7 down to nothing.
    const GENEROSITY = 1.5; // allow some meals to cost a bit above the flat average, for variety
    const mealsRemainingInWeek = daysRemainingInWeek * 3; // today's 3 slots + all future days' slots

    // Breakfast must reserve today's lunch + dinner minimums, plus future days
    const breakfastReserve = reserveForFutureDays +
      cheapestPossibleCostExcluding(lunchPool, excludeToday, familySize, pantry, priceLookup) +
      cheapestPossibleCostExcluding(dinnerPool, excludeToday, familySize, pantry, priceLookup);
    const breakfastFairShare = (weeklyBudget - weekSpend) / mealsRemainingInWeek * GENEROSITY;
    const { recipe: breakfast, cost: bCost } = pickAffordableVariedMeal(
      breakfastPool, "Breakfast", familySize, pantry, priceLookup,
      usedIds.breakfast, leftovers, weeklyBudget - weekSpend, breakfastReserve, excludeToday, breakfastFairShare
    );
    weekSpend += bCost;
    totalSpend += bCost;
    if (breakfast) excludeToday.add(breakfast.recipeId);

    // Lunch must reserve today's dinner minimum (now that breakfast's pick is
    // excluded from that estimate), plus future days
    const lunchReserve = reserveForFutureDays +
      cheapestPossibleCostExcluding(dinnerPool, excludeToday, familySize, pantry, priceLookup);
    const lunchFairShare = (weeklyBudget - weekSpend) / (mealsRemainingInWeek - 1) * GENEROSITY;
    const { recipe: lunch, cost: lCost } = pickAffordableVariedMeal(
      lunchPool, "Lunch", familySize, pantry, priceLookup,
      usedIds.lunch, leftovers, weeklyBudget - weekSpend, lunchReserve, excludeToday, lunchFairShare
    );
    weekSpend += lCost;
    totalSpend += lCost;
    if (lunch) excludeToday.add(lunch.recipeId);

    // Dinner only needs to reserve future days
    const dinnerFairShare = (weeklyBudget - weekSpend) / (mealsRemainingInWeek - 2) * GENEROSITY;
    const { recipe: dinner, cost: dCost } = pickAffordableVariedMeal(
      dinnerPool, "Dinner", familySize, pantry, priceLookup,
      usedIds.dinner, leftovers, weeklyBudget - weekSpend, reserveForFutureDays, excludeToday, dinnerFairShare
    );
    weekSpend += dCost;
    totalSpend += dCost;
    if (dinner) excludeToday.add(dinner.recipeId);

    plan.push({ date, breakfast, lunch, dinner });
    dayInWeek++;
  });

  return { plan, pantry, totalSpend };
}

// ============================================================
// SHOPPING LIST
// ============================================================

type ShoppingListItem = {
  name: string;
  packagesNeeded: number;
  costPerPackage: number;
  totalCost: number;
};

function generateShoppingList(pantry: Pantry, priceLookup: PriceLookup): ShoppingListItem[] {
  const list: ShoppingListItem[] = [];
  for (const entry of pantry.values()) {
    const priceInfo = priceLookup[entry.ingredientId.toString()];
    if (!priceInfo) continue;
    const costPerPackage = parsePrice(priceInfo.formattedPrice);
    list.push({
      name: entry.name,
      packagesNeeded: entry.packagesPurchased,
      costPerPackage,
      totalCost: costPerPackage * entry.packagesPurchased,
    });
  }
  return list;
}

function getTotalCost(shoppingList: ShoppingListItem[]): number {
  return shoppingList.reduce((sum, item) => sum + item.totalCost, 0);
}

// ============================================================
// RUN THE TEST — change these values to try different scenarios
// ============================================================

const testFamilySize = 2;
const testCuisines = ["Chinese"];
const testDietType = "Dairy-Free";
const testStartDate = getLocalDateString();
const testTimeframe = "two weeks";
const testWeeklyBudget = 60; // <-- your weekly grocery budget lives here

const { plan, pantry, totalSpend } = generateMealPlan(
  sampleRecipes,
  testCuisines,
  testDietType,
  testFamilySize,
  testStartDate,
  testTimeframe,
  samplePriceLookup,
  testWeeklyBudget
);

console.log("=== MEAL PLAN ===");
plan.forEach((day, i) => {
  const weekLabel = `(week ${Math.floor(i / 7) + 1})`;
  console.log(
    `${day.date} ${weekLabel} | Breakfast: ${day.breakfast?.name ?? "—"} | Lunch: ${day.lunch?.name ?? "—"} | Dinner: ${day.dinner?.name ?? "—"}`
  );
});

const shoppingList = generateShoppingList(pantry, samplePriceLookup);
console.log("\n=== SHOPPING LIST ===");
shoppingList.forEach(item => {
  console.log(`${item.name}: ${item.packagesNeeded}x @ $${item.costPerPackage.toFixed(2)} = $${item.totalCost.toFixed(2)}`);
});

const numWeeks = Math.ceil(plan.length / 7);
console.log(`\nTotal Cost: $${getTotalCost(shoppingList).toFixed(2)}`);
console.log(`Weekly Budget: $${testWeeklyBudget.toFixed(2)} x ${numWeeks} week(s) = $${(testWeeklyBudget * numWeeks).toFixed(2)} max`);
console.log(totalSpend <= testWeeklyBudget * numWeeks ? "✅ Within budget" : "⚠️ Over budget");
