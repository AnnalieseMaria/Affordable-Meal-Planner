import type { Meal, MealIngredient, Ingredient } from './meals'

// ============================================================
// UNIT CONVERSION — volume units only (cup/tbsp/tsp/fl oz/ml/L/gal).
// These all measure the same physical quantity (volume), so converting
// between them is exact math, never a guess. Weight-based units (oz, lb, g)
// are NOT included here on purpose — converting weight to/from volume
// requires knowing the ingredient's density (a cup of flour and a cup of
// honey don't weigh the same), which we don't have and won't guess at.
// ============================================================

const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  'fl oz': 29.5735,
  ml: 1,
  L: 1000,
  gal: 3785.41,
}

function isVolumeUnit(unit: string | null | undefined): boolean {
  return unit != null && unit in VOLUME_TO_ML
}

function convertVolume(amount: number, fromUnit: string, toUnit: string): number {
  return (amount * VOLUME_TO_ML[fromUnit]) / VOLUME_TO_ML[toUnit]
}

// "unit", "tortilla", and "egg" are just different NAMES for the same idea —
// counting one whole item. "4 tortilla" and "priced per 2 unit" are already
// on the same numeric scale (both counting whole tortillas), so no math is
// needed here, just recognizing the labels are interchangeable.
const COUNT_ALIASES = new Set(['unit', 'tortilla', 'egg'])

// "can"/"bag" as a RECIPE unit means something different from a serving size —
// "1 can" means the whole container, not one serving within it. So "1 can"
// converts to "the total amount in one full package" (servingsPerContainer *
// servingSize), not to price.servingSize directly.
const WHOLE_PACKAGE_UNITS = new Set(['can', 'bag'])

// ============================================================
// MANUAL CONVERSION OVERRIDES — for ingredients where the recipe's unit and
// the price's unit measure genuinely different things (weight vs. volume,
// or a whole item vs. weight) and there's no safe generic formula. Each
// entry says "1 [fromUnit], for THIS specific ingredient, equals X of the
// ingredient's own price.servingUnit." Amounts scale normally from there —
// e.g. if 1 cup = 5 oz, then 1.5 cups = 7.5 oz automatically, no need to
// add a separate entry per amount.
//
// Add a new entry here whenever isMealUsable() blocks a recipe for a unit
// mismatch that isn't resolvable by volume conversion or count/whole-package
// aliasing — that's the signal this table needs a new line.
// ============================================================

type ManualConversion = {
  fromUnit: string   // the unit recipes use for this ingredient
  toAmount: number   // how much ONE fromUnit equals, in this ingredient's price.servingUnit
}

const MANUAL_CONVERSIONS: Record<number, ManualConversion> = {
  147: { fromUnit: 'cup', toAmount: 5.5 },  // Rotisserie Style Pulled Chicken: 1 cup shredded ≈ 5.5 oz
  1260: { fromUnit: 'cup', toAmount: 5 },   // Chicken Fajita Strips: 1 cup sliced ≈ 5 oz (matches Aldi's own 5oz serving size)
  3: { fromUnit: 'cup', toAmount: 6.5 },    // 90 Second Whole Grain Brown Rice (pre-cooked pouch): 1 cup cooked ≈ 6.5 oz
  2596: { fromUnit: 'unit', toAmount: 1 },  // Cinnamon Stick: 1 whole stick ≈ 1 tsp ground-equivalent
  1016: { fromUnit: 'unit', toAmount: 1 },  // Jalapeno Pepper: 1 whole pepper ≈ 1 oz (matches Aldi's own 1oz serving size)
}

// Computes how much of an ingredient is needed, expressed in the PRICE
// entry's unit (price.servingUnit) — converting the recipe's amount first
// if the units differ but are safely resolvable. Returns null if the units
// don't match and can't be safely resolved (e.g. recipe uses cup, price
// uses oz-by-weight) — callers should treat null as "can't compute this."
//
// `scaleFactor` is a CONTINUOUS multiplier (familySize / recipeServings) —
// not rounded to whole batches. A recipe serving 4 scaled for a family of 3
// uses scaleFactor 0.75, so "4 tortillas" correctly becomes "3 tortillas,"
// with nothing left over.
function getNeededAmountInPriceUnits(ing: MealIngredient, price: Ingredient, scaleFactor: number): number | null {
  const recipeUnit = ing.amountInfo.unit
  const priceUnit = price.servingUnit

  if (priceUnit == null) return null

  if (recipeUnit === priceUnit) {
    return ing.amountInfo.size * scaleFactor
  }

  if (ing.ingredientId !== null && MANUAL_CONVERSIONS[ing.ingredientId]?.fromUnit === recipeUnit) {
    const conversion = MANUAL_CONVERSIONS[ing.ingredientId]
    return ing.amountInfo.size * conversion.toAmount * scaleFactor
  }

  if (COUNT_ALIASES.has(recipeUnit) && COUNT_ALIASES.has(priceUnit)) {
    return ing.amountInfo.size * scaleFactor
  }

  if (WHOLE_PACKAGE_UNITS.has(recipeUnit)) {
    return ing.amountInfo.size * getPackageTotalAmount(price) * scaleFactor
  }

  if (isVolumeUnit(recipeUnit) && isVolumeUnit(priceUnit)) {
    const convertedSize = convertVolume(ing.amountInfo.size, recipeUnit, priceUnit)
    return convertedSize * scaleFactor
  }

  // Units differ and aren't resolvable by any of the above — can't safely
  // convert (e.g. cup vs oz-by-weight, or a whole item vs a weight)
  return null
}

// ============================================================
// DATA QUALITY CHECK — filters out recipes that aren't ready yet
// (missing recipeServings, unlinked ingredients, missing price info,
// unresolvable unit mismatches, or the "hello" placeholder unit bug).
// Reusable across any cuisine.
// ============================================================

export function isMealUsable(meal: Meal, ingredients: Record<string, Ingredient>): boolean {
  if (meal.recipeServings === null) return false

  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) return false
    const price = ingredients[ing.ingredientId.toString()]
    if (!price) return false
    if (price.servingSize === null) return false
    if (ing.amountInfo.unit === 'hello') return false
    // scaleFactor=1 here is just a probe to confirm the unit pair is
    // resolvable — the actual scale factor doesn't matter for this check
    if (getNeededAmountInPriceUnits(ing, price, 1) === null) return false
  }

  return true
}

export function getUsableMeals(meals: Meal[], ingredients: Record<string, Ingredient>): Meal[] {
  return meals.filter(meal => isMealUsable(meal, ingredients))
}

// ============================================================
// DATE HELPERS
// ============================================================

export function getTimeframeDays(timeframe: string): number {
  const days: Record<string, number> = {
    'one week': 7,
    'two weeks': 14,
    'three week': 21,
    'one month': 30,
  }
  return days[timeframe] ?? 7
}

export function getDateStrings(startDate: string, timeframe: string): string[] {
  const start = new Date(startDate + 'T00:00:00')
  const numDays = getTimeframeDays(timeframe)
  const dates: string[] = []
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

// ============================================================
// PANTRY / PRICING LOGIC
// ============================================================

type PantryEntry = {
  ingredientId: number
  name: string
  remainingAmount: number
  packagesPurchased: number
}

type Pantry = Map<number, PantryEntry>

function parsePrice(formattedPrice: string): number {
  return parseFloat(formattedPrice.replace('$', ''))
}

function getPackageTotalAmount(price: Ingredient): number {
  // servingSize/servingsPerContainer are guaranteed non-null here because
  // isMealUsable() already filtered out recipes with incomplete price data
  return (price.servingsPerContainer ?? 1) * (price.servingSize ?? 1)
}

// Continuous scaling factor — NOT rounded to whole batches. A recipe that
// serves 4, scaled for a family of 3, gives 0.75 — so every ingredient in
// that recipe (and its cost) scales down exactly to what 3 people need,
// with nothing left over and nothing under-bought.
function getScaleFactor(meal: Meal, familySize: number): number {
  const servings = meal.recipeServings ?? 1
  return familySize / servings
}

function usePantryIngredient(
  pantry: Pantry,
  ing: MealIngredient,
  ingredients: Record<string, Ingredient>,
  scaleFactor: number
): void {
  if (ing.ingredientId === null) return
  const price = ingredients[ing.ingredientId.toString()]
  if (!price) return

  const needed = getNeededAmountInPriceUnits(ing, price, scaleFactor)
  // null means the units couldn't be resolved — isMealUsable() should have
  // already filtered this meal out, but bail safely just in case
  if (needed === null) return

  let entry = pantry.get(ing.ingredientId)

  if (!entry) {
    entry = { ingredientId: ing.ingredientId, name: ing.name, remainingAmount: 0, packagesPurchased: 0 }
    pantry.set(ing.ingredientId, entry)
  }

  // Buying still happens in whole packages — you can't buy 0.75 of a bag of
  // rice from the store — but the amount NEEDED is now exact, not rounded.
  const packageAmount = getPackageTotalAmount(price)
  while (entry.remainingAmount < needed) {
    entry.remainingAmount += packageAmount
    entry.packagesPurchased += 1
  }
  entry.remainingAmount -= needed
}

// Standalone cost estimate for a single meal, assuming an EMPTY pantry
// (i.e. "if I had to buy everything for this from scratch right now").
// This deliberately ignores whatever's actually in the current plan's
// pantry — it's meant for contexts like a "swap this meal" picker, where
// showing a consistent, comparable price per option matters more than
// perfectly reflecting mid-week pantry state.
export function estimateMealCost(
  meal: Meal,
  familySize: number,
  ingredients: Record<string, Ingredient>
): number {
  const scaleFactor = getScaleFactor(meal, familySize)
  let cost = 0
  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) continue
    const price = ingredients[ing.ingredientId.toString()]
    if (!price) continue

    const needed = getNeededAmountInPriceUnits(ing, price, scaleFactor)
    if (needed === null) continue

    const packageAmount = getPackageTotalAmount(price)
    const packagesToBuy = Math.ceil(needed / packageAmount)
    cost += packagesToBuy * parsePrice(price.formattedPrice)
  }
  return cost
}

function marginalCost(
  meal: Meal,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>,
  scaleFactor: number
): number {
  let cost = 0
  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) continue
    const price = ingredients[ing.ingredientId.toString()]
    if (!price) continue

    const needed = getNeededAmountInPriceUnits(ing, price, scaleFactor)
    if (needed === null) continue // shouldn't happen for a usable meal, but stay safe

    const entry = pantry.get(ing.ingredientId)
    const have = entry ? entry.remainingAmount : 0

    if (have < needed) {
      const packageAmount = getPackageTotalAmount(price)
      const shortfall = needed - have
      const packagesToBuy = Math.ceil(shortfall / packageAmount)
      cost += packagesToBuy * parsePrice(price.formattedPrice)
    }
  }
  return cost
}

function cheapestPossibleCost(
  pool: Meal[],
  familySize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>
): number {
  if (pool.length === 0) return 0
  const costs = pool.map(meal => marginalCost(meal, pantry, ingredients, getScaleFactor(meal, familySize)))
  return Math.min(...costs)
}

function cheapestPossibleCostExcluding(
  pool: Meal[],
  excludeToday: Set<number>,
  familySize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>
): number {
  const filtered = pool.filter(m => !excludeToday.has(m.recipeId))
  return cheapestPossibleCost(filtered.length > 0 ? filtered : pool, familySize, pantry, ingredients)
}

// ============================================================
// MEAL PLAN GENERATION (budget-safe, variety-seeking)
// ============================================================

export type DayPlan = {
  date: string
  breakfast: Meal | null
  lunch: Meal | null
  dinner: Meal | null
}

export function filterMealsForSlot(
  meals: Meal[],
  cuisines: string[],
  dietType: string,
  slot: string
): Meal[] {
  return meals.filter(m =>
    cuisines.includes(m.cuisine) &&
    m.dietType.includes(dietType) &&
    m.mealType.includes(slot)
  )
}

// Picks a meal for one slot, always scaled exactly to family size (no
// leftover-banking / forced-repeat system — every day picks independently).
// Falls back to the cheapest option that fits the remaining budget, and
// skips the slot entirely (rather than breaking budget) if nothing fits.
function pickAffordableVariedMeal(
  pool: Meal[],
  familySize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>,
  usedIds: Set<number>,
  remainingBudget: number,
  reserveForRest: number,
  excludeToday: Set<number>,
  fairShareCeiling: number
): { meal: Meal | null; cost: number } {
  const poolExcludingToday = pool.filter(m => !excludeToday.has(m.recipeId))
  if (poolExcludingToday.length === 0) return { meal: null, cost: 0 }

  const unused = poolExcludingToday.filter(m => !usedIds.has(m.recipeId))
  const idealPool = unused.length > 0 ? unused : poolExcludingToday

  const scoreMeals = (mealList: Meal[]) =>
    mealList.map(meal => {
      const scaleFactor = getScaleFactor(meal, familySize)
      const cost = marginalCost(meal, pantry, ingredients, scaleFactor)
      return { meal, scaleFactor, cost }
    })

  const reserveCeiling = remainingBudget - reserveForRest
  const affordableCeiling = Math.min(reserveCeiling, fairShareCeiling)
  const idealScored = scoreMeals(idealPool)
  const affordable = idealScored.filter(s => s.cost <= affordableCeiling)

  let chosen
  if (affordable.length > 0) {
    chosen = affordable[Math.floor(Math.random() * affordable.length)]
  } else {
    const fullScored = scoreMeals(poolExcludingToday)
    const withinHardBudget = fullScored.filter(s => s.cost <= remainingBudget)

    if (withinHardBudget.length > 0) {
      withinHardBudget.sort((a, b) => a.cost - b.cost)
      chosen = withinHardBudget[0]
    } else {
      // Even the cheapest option costs more than what's left — skip this
      // slot rather than break the budget guarantee
      return { meal: null, cost: 0 }
    }
  }

  usedIds.add(chosen.meal.recipeId)
  for (const ing of chosen.meal.ingredients) {
    usePantryIngredient(pantry, ing, ingredients, chosen.scaleFactor)
  }

  return { meal: chosen.meal, cost: chosen.cost }
}

// Rebuilds a pantry (and therefore a shopping list + cost) from an EXISTING
// plan — used after a manual edit like a swap or removal, where we're not
// re-running the selection algorithm, just recalculating what buying
// everything in the CURRENT plan actually costs.
export function buildPantryFromPlan(
  plan: DayPlan[],
  familySize: number,
  ingredients: Record<string, Ingredient>
) {
  const pantry: Pantry = new Map()
  for (const day of plan) {
    const dayMeals = [day.breakfast, day.lunch, day.dinner].filter((m): m is Meal => m !== null)
    for (const meal of dayMeals) {
      const scaleFactor = getScaleFactor(meal, familySize)
      for (const ing of meal.ingredients) {
        usePantryIngredient(pantry, ing, ingredients, scaleFactor)
      }
    }
  }
  return pantry
}

export function generateMealPlan(
  allMeals: Meal[],
  cuisines: string[],
  dietType: string,
  familySize: number,
  startDate: string,
  timeframe: string,
  ingredients: Record<string, Ingredient>,
  weeklyBudget: number
): { plan: DayPlan[]; pantry: Pantry; totalSpend: number } {
  // Only ever plan using recipes with complete, trustworthy data
  const usableMeals = getUsableMeals(allMeals, ingredients)

  const dates = getDateStrings(startDate, timeframe)
  const breakfastPool = filterMealsForSlot(usableMeals, cuisines, dietType, 'Breakfast')
  const lunchPool = filterMealsForSlot(usableMeals, cuisines, dietType, 'Lunch')
  const dinnerPool = filterMealsForSlot(usableMeals, cuisines, dietType, 'Dinner')

  const pantry: Pantry = new Map()
  const usedIds = { breakfast: new Set<number>(), lunch: new Set<number>(), dinner: new Set<number>() }

  const plan: DayPlan[] = []
  let totalSpend = 0
  let weekSpend = 0
  let dayInWeek = 0

  const GENEROSITY = 1.5

  dates.forEach((date, index) => {
    if (dayInWeek === 7) {
      dayInWeek = 0
      weekSpend = 0
    }

    const daysRemainingTotal = dates.length - index
    const daysRemainingInWeek = Math.min(7 - dayInWeek, daysRemainingTotal)
    const daysLeftInWeekAfterToday = daysRemainingInWeek - 1

    const excludeToday = new Set<number>()

    const dailyMinCost =
      cheapestPossibleCost(breakfastPool, familySize, pantry, ingredients) +
      cheapestPossibleCost(lunchPool, familySize, pantry, ingredients) +
      cheapestPossibleCost(dinnerPool, familySize, pantry, ingredients)
    const reserveForFutureDays = dailyMinCost * daysLeftInWeekAfterToday

    const mealsRemainingInWeek = daysRemainingInWeek * 3

    const breakfastReserve = reserveForFutureDays +
      cheapestPossibleCostExcluding(lunchPool, excludeToday, familySize, pantry, ingredients) +
      cheapestPossibleCostExcluding(dinnerPool, excludeToday, familySize, pantry, ingredients)
    const breakfastFairShare = (weeklyBudget - weekSpend) / mealsRemainingInWeek * GENEROSITY
    const { meal: breakfast, cost: bCost } = pickAffordableVariedMeal(
      breakfastPool, familySize, pantry, ingredients,
      usedIds.breakfast, weeklyBudget - weekSpend, breakfastReserve, excludeToday, breakfastFairShare
    )
    weekSpend += bCost
    totalSpend += bCost
    if (breakfast) excludeToday.add(breakfast.recipeId)

    const lunchReserve = reserveForFutureDays +
      cheapestPossibleCostExcluding(dinnerPool, excludeToday, familySize, pantry, ingredients)
    const lunchFairShare = (weeklyBudget - weekSpend) / (mealsRemainingInWeek - 1) * GENEROSITY
    const { meal: lunch, cost: lCost } = pickAffordableVariedMeal(
      lunchPool, familySize, pantry, ingredients,
      usedIds.lunch, weeklyBudget - weekSpend, lunchReserve, excludeToday, lunchFairShare
    )
    weekSpend += lCost
    totalSpend += lCost
    if (lunch) excludeToday.add(lunch.recipeId)

    const dinnerFairShare = (weeklyBudget - weekSpend) / (mealsRemainingInWeek - 2) * GENEROSITY
    const { meal: dinner, cost: dCost } = pickAffordableVariedMeal(
      dinnerPool, familySize, pantry, ingredients,
      usedIds.dinner, weeklyBudget - weekSpend, reserveForFutureDays, excludeToday, dinnerFairShare
    )
    weekSpend += dCost
    totalSpend += dCost

    plan.push({ date, breakfast, lunch, dinner })
    dayInWeek++
  })

  return { plan, pantry, totalSpend }
}

// ============================================================
// SHOPPING LIST
// ============================================================

export type ShoppingListItem = {
  name: string
  packagesNeeded: number
  costPerPackage: number
  totalCost: number
}

export function generateShoppingList(pantry: Pantry, ingredients: Record<string, Ingredient>): ShoppingListItem[] {
  const list: ShoppingListItem[] = []
  for (const entry of pantry.values()) {
    const price = ingredients[entry.ingredientId.toString()]
    if (!price) continue
    const costPerPackage = parsePrice(price.formattedPrice)
    list.push({
      name: entry.name,
      packagesNeeded: entry.packagesPurchased,
      costPerPackage,
      totalCost: costPerPackage * entry.packagesPurchased,
    })
  }
  return list
}

export function getTotalCost(shoppingList: ShoppingListItem[]): number {
  return shoppingList.reduce((sum, item) => sum + item.totalCost, 0)
}
