import type { Meal, MealIngredient, Ingredient } from './meals'

// ============================================================
// UNIT CONVERSION — volume units only (cup/tbsp/tsp/fl oz/ml/L/gal).
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

const COUNT_ALIASES = new Set(['unit', 'tortilla', 'egg', 'tomato', 'clove', 'tea bag', 'link'])
const WHOLE_PACKAGE_UNITS = new Set(['can', 'bag'])

type ManualConversion = {
  fromUnit: string
  toAmount: number
}

const MANUAL_CONVERSIONS: Record<number, ManualConversion> = {
  147: { fromUnit: 'cup', toAmount: 5.5 },
  1260: { fromUnit: 'cup', toAmount: 5 },
  3: { fromUnit: 'cup', toAmount: 6.5 },
  2596: { fromUnit: 'stick', toAmount: 1 }, //change unit to stick here, in meals.json, and in amountInfo.unit type union as well 
  1016: { fromUnit: 'unit', toAmount: 1 },
  1032: { fromUnit: 'stalk', toAmount: 0.3667 }, // Green Onions: 1 stalk ≈ 0.3667 oz (from the product's own "1 1/2 stalks = 0.55 oz" display)
}

const PERISHABLE_SHELF_LIFE_DAYS: Record<number, number> = {
  986: 7,
  995: 7,
  1000: 7,
  1062: 7,
  1076: 7,
  1081: 7,
  1020: 7,
  1090: 7,
  1093: 7,
}

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

  return null
}

export function isMealUsable(meal: Meal, ingredients: Record<string, Ingredient>): boolean {
  if (meal.recipeServings === null) return false

  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) return false
    const price = ingredients[ing.ingredientId.toString()]
    if (!price) return false
    if (price.servingSize === null) return false
    if (ing.amountInfo.unit === 'hello') return false
    if (getNeededAmountInPriceUnits(ing, price, 1) === null) return false
  }

  return true
}

export function getUsableMeals(meals: Meal[], ingredients: Record<string, Ingredient>): Meal[] {
  return meals.filter(meal => isMealUsable(meal, ingredients))
}

export function getDateStrings(startDate: string, totalDays: number): string[] {
  const start = new Date(startDate + 'T00:00:00')
  const dates: string[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

type PantryEntry = {
  ingredientId: number
  name: string
  remainingAmount: number
  packagesPurchased: number
  lastPurchaseDayIndex: number
}

type Pantry = Map<number, PantryEntry>

function parsePrice(formattedPrice: string): number {
  return parseFloat(formattedPrice.replace('$', ''))
}

function getPackageTotalAmount(price: Ingredient): number {
  return (price.servingsPerContainer ?? 1) * (price.servingSize ?? 1)
}

function getScaleFactor(meal: Meal, familySize: number): number {
  const servings = meal.recipeServings ?? 1
  return familySize / servings
}

function agePerishables(pantry: Pantry, dayIndex: number): void {
  for (const entry of pantry.values()) {
    const shelfLife = PERISHABLE_SHELF_LIFE_DAYS[entry.ingredientId]
    if (shelfLife === undefined) continue
    if (dayIndex - entry.lastPurchaseDayIndex >= shelfLife) {
      entry.remainingAmount = 0
    }
  }
}

function isMealStillFreshOnDay(meal: Meal, dayInCycle: number): boolean {
  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) continue
    const shelfLife = PERISHABLE_SHELF_LIFE_DAYS[ing.ingredientId]
    if (shelfLife === undefined) continue
    if (dayInCycle >= shelfLife) return false
  }
  return true
}

function usePantryIngredient(
  pantry: Pantry,
  ing: MealIngredient,
  ingredients: Record<string, Ingredient>,
  scaleFactor: number,
  dayIndex: number
): void {
  if (ing.ingredientId === null) return
  const price = ingredients[ing.ingredientId.toString()]
  if (!price) return

  const needed = getNeededAmountInPriceUnits(ing, price, scaleFactor)
  if (needed === null) return

  let entry = pantry.get(ing.ingredientId)

  if (!entry) {
    entry = { ingredientId: ing.ingredientId, name: ing.name, remainingAmount: 0, packagesPurchased: 0, lastPurchaseDayIndex: dayIndex }
    pantry.set(ing.ingredientId, entry)
  }

  const packageAmount = getPackageTotalAmount(price)
  while (entry.remainingAmount < needed) {
    entry.remainingAmount += packageAmount
    entry.packagesPurchased += 1
    entry.lastPurchaseDayIndex = dayIndex
  }
  entry.remainingAmount -= needed
}

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
    if (needed === null) continue

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

function pickAffordableVariedMeal(
  pool: Meal[],
  familySize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>,
  usedIds: Set<number>,
  remainingBudget: number,
  reserveForRest: number,
  excludeToday: Set<number>,
  fairShareCeiling: number,
  dayIndex: number
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
      return { meal: null, cost: 0 }
    }
  }

  usedIds.add(chosen.meal.recipeId)
  for (const ing of chosen.meal.ingredients) {
    usePantryIngredient(pantry, ing, ingredients, chosen.scaleFactor, dayIndex)
  }

  return { meal: chosen.meal, cost: chosen.cost }
}

export function buildPantryFromPlan(
  plan: DayPlan[],
  familySize: number,
  ingredients: Record<string, Ingredient>
) {
  const pantry: Pantry = new Map()
  plan.forEach((day, dayIndex) => {
    agePerishables(pantry, dayIndex)
    const dayMeals = [day.breakfast, day.lunch, day.dinner].filter((m): m is Meal => m !== null)
    for (const meal of dayMeals) {
      const scaleFactor = getScaleFactor(meal, familySize)
      for (const ing of meal.ingredients) {
        usePantryIngredient(pantry, ing, ingredients, scaleFactor, dayIndex)
      }
    }
  })
  return pantry
}

export function generateMealPlan(
  allMeals: Meal[],
  cuisines: string[],
  dietType: string,
  familySize: number,
  shoppingDate: string,
  shoppingIntervalDays: number,
  ingredients: Record<string, Ingredient>,
  budgetPerTrip: number
): { plan: DayPlan[]; pantry: Pantry; totalSpend: number } {
  const usableMeals = getUsableMeals(allMeals, ingredients)

  // The meal plan always starts the day AFTER your shopping day — you shop
  // Saturday, the plan covers Sunday onward. This is a fixed, predictable
  // rule rather than a separately-chosen start date, which avoids any
  // possibility of the two dates contradicting each other (e.g. "start
  // Sunday but shop Wednesday" — the app has no way to know what you'd eat
  // in that gap).
  //
  // The plan always covers exactly ONE shopping cycle (however long that is
  // — a week, two weeks, a month) — the app is meant to be revisited once
  // that cycle is about to run out (e.g. via a reminder before the next
  // shopping trip), rather than generating multiple trips' worth up front.
  const planStart = new Date(shoppingDate + 'T00:00:00')
  planStart.setDate(planStart.getDate() + 1)
  const planStartDate = planStart.toISOString().split('T')[0]

  const totalDays = shoppingIntervalDays
  const dates = getDateStrings(planStartDate, totalDays)
  const breakfastPool = filterMealsForSlot(usableMeals, cuisines, dietType, 'Breakfast')
  const lunchPool = filterMealsForSlot(usableMeals, cuisines, dietType, 'Lunch')
  const dinnerPool = filterMealsForSlot(usableMeals, cuisines, dietType, 'Dinner')

  const pantry: Pantry = new Map()
  const usedIds = { breakfast: new Set<number>(), lunch: new Set<number>(), dinner: new Set<number>() }

  const plan: DayPlan[] = []
  let totalSpend = 0
  let cycleSpend = 0

  const GENEROSITY = 1.5

  dates.forEach((date, index) => {
    // Simple, guaranteed-clean counter for budget/shopping-trip boundaries —
    // since planStartDate is always exactly 1 day after a real shopping day,
    // this can never land mid-cycle the way an independently-chosen start
    // date could. Resets every shoppingIntervalDays, starting from day 0.
    const dayInBudgetCycle = index % shoppingIntervalDays
    if (dayInBudgetCycle === 0) {
      cycleSpend = 0
    }

    // For PERISHABLE freshness specifically, the real shopping trip happened
    // 1 day before the plan started — so day 0 of the plan is already "1 day
    // post-shopping," not "day 0 fresh."
    const dayInCycle = dayInBudgetCycle + 1

    agePerishables(pantry, index)

    const freshBreakfastPool = breakfastPool.filter(m => isMealStillFreshOnDay(m, dayInCycle))
    const freshLunchPool = lunchPool.filter(m => isMealStillFreshOnDay(m, dayInCycle))
    const freshDinnerPool = dinnerPool.filter(m => isMealStillFreshOnDay(m, dayInCycle))

    const daysRemainingTotal = dates.length - index
    const daysRemainingInCycle = Math.min(shoppingIntervalDays - dayInBudgetCycle, daysRemainingTotal)
    const daysLeftInCycleAfterToday = daysRemainingInCycle - 1

    const excludeToday = new Set<number>()

    const dailyMinCost =
      cheapestPossibleCost(freshBreakfastPool, familySize, pantry, ingredients) +
      cheapestPossibleCost(freshLunchPool, familySize, pantry, ingredients) +
      cheapestPossibleCost(freshDinnerPool, familySize, pantry, ingredients)
    const reserveForFutureDays = dailyMinCost * daysLeftInCycleAfterToday

    const mealsRemainingInCycle = daysRemainingInCycle * 3

    const breakfastReserve = reserveForFutureDays +
      cheapestPossibleCostExcluding(freshLunchPool, excludeToday, familySize, pantry, ingredients) +
      cheapestPossibleCostExcluding(freshDinnerPool, excludeToday, familySize, pantry, ingredients)
    const breakfastFairShare = (budgetPerTrip - cycleSpend) / mealsRemainingInCycle * GENEROSITY
    const { meal: breakfast, cost: bCost } = pickAffordableVariedMeal(
      freshBreakfastPool, familySize, pantry, ingredients,
      usedIds.breakfast, budgetPerTrip - cycleSpend, breakfastReserve, excludeToday, breakfastFairShare, index
    )
    cycleSpend += bCost
    totalSpend += bCost
    if (breakfast) excludeToday.add(breakfast.recipeId)

    const lunchReserve = reserveForFutureDays +
      cheapestPossibleCostExcluding(freshDinnerPool, excludeToday, familySize, pantry, ingredients)
    const lunchFairShare = (budgetPerTrip - cycleSpend) / (mealsRemainingInCycle - 1) * GENEROSITY
    const { meal: lunch, cost: lCost } = pickAffordableVariedMeal(
      freshLunchPool, familySize, pantry, ingredients,
      usedIds.lunch, budgetPerTrip - cycleSpend, lunchReserve, excludeToday, lunchFairShare, index
    )
    cycleSpend += lCost
    totalSpend += lCost
    if (lunch) excludeToday.add(lunch.recipeId)

    const dinnerFairShare = (budgetPerTrip - cycleSpend) / (mealsRemainingInCycle - 2) * GENEROSITY
    const { meal: dinner, cost: dCost } = pickAffordableVariedMeal(
      freshDinnerPool, familySize, pantry, ingredients,
      usedIds.dinner, budgetPerTrip - cycleSpend, reserveForFutureDays, excludeToday, dinnerFairShare, index
    )
    cycleSpend += dCost
    totalSpend += dCost

    plan.push({ date, breakfast, lunch, dinner })
  })

  return { plan, pantry, totalSpend }
}

export type ShoppingListItem = {
  name: string
  packagesNeeded: number
  costPerPackage: number
  totalCost: number
}

// Breaks the shopping list down by SHOPPING TRIP, accounting for pantry
// carryover between trips — e.g. if trip 1 buys a whole bag of rice but only
// uses half, trip 2's list won't include another bag unless it actually
// needs more than what's already sitting in the pantry. Each trip's list
// only shows what's NEWLY purchased that trip, not a running cumulative total.
// Since generateMealPlan always produces a plan that's an exact multiple of
// intervalDays (no partial cycles), simple fixed-size chunking is safe here.
export function generateShoppingListsByInterval(
  plan: DayPlan[],
  intervalDays: number,
  familySize: number,
  ingredients: Record<string, Ingredient>
): ShoppingListItem[][] {
  const pantry: Pantry = new Map()
  const tripLists: ShoppingListItem[][] = []

  for (let tripStart = 0; tripStart < plan.length; tripStart += intervalDays) {
    const tripDays = plan.slice(tripStart, tripStart + intervalDays)

    const purchasedBefore = new Map<number, number>()
    for (const [id, entry] of pantry) {
      purchasedBefore.set(id, entry.packagesPurchased)
    }

    tripDays.forEach((day, localIndex) => {
      const dayIndex = tripStart + localIndex
      agePerishables(pantry, dayIndex)
      const dayMeals = [day.breakfast, day.lunch, day.dinner].filter((m): m is Meal => m !== null)
      for (const meal of dayMeals) {
        const scaleFactor = getScaleFactor(meal, familySize)
        for (const ing of meal.ingredients) {
          usePantryIngredient(pantry, ing, ingredients, scaleFactor, dayIndex)
        }
      }
    })

    const tripList: ShoppingListItem[] = []
    for (const [id, entry] of pantry) {
      const before = purchasedBefore.get(id) ?? 0
      const newThisTrip = entry.packagesPurchased - before
      if (newThisTrip > 0) {
        const price = ingredients[id.toString()]
        if (!price) continue
        const costPerPackage = parsePrice(price.formattedPrice)
        tripList.push({
          name: entry.name,
          packagesNeeded: newThisTrip,
          costPerPackage,
          totalCost: costPerPackage * newThisTrip,
        })
      }
    }
    tripLists.push(tripList)
  }

  return tripLists
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
