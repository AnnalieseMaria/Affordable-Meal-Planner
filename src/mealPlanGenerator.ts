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
export type SpecialDietMember = {
  name: string
  dietType: string
}

type SpecialDietGroup = {
  dietType: string
  names: string[]
}

// Groups individual family members by diet — so 2 people who are both
// vegan share ONE alt dish (scaled for 2), rather than generating two
// separate single-portion dishes.
function groupSpecialDietMembers(members: SpecialDietMember[]): SpecialDietGroup[] {
  const groups = new Map<string, string[]>()
  for (const member of members) {
    const existing = groups.get(member.dietType) ?? []
    existing.push(member.name)
    groups.set(member.dietType, existing)
  }
  return [...groups.entries()].map(([dietType, names]) => ({ dietType, names }))
}

export type AltDish = {
  meal: Meal | null
  forNames: string[]
  dietType: string
  groupSize: number
}

export type MealSlotResult = {
  meal: Meal | null
  mainGroupSize: number
  altDishes: AltDish[]
}

export type DayPlan = {
  date: string
  breakfast: MealSlotResult
  lunch: MealSlotResult
  dinner: MealSlotResult
}

// Every dish being cooked for a given day, each tagged with how many people
// it actually serves — used by cost/pantry calculations, which don't need
// to know anything about the diet-splitting logic, just "this meal, for
// this many people."
function getAllDishesForDay(day: DayPlan): { meal: Meal; groupSize: number }[] {
  const dishes: { meal: Meal; groupSize: number }[] = []
  for (const slot of [day.breakfast, day.lunch, day.dinner]) {
    if (slot.meal) dishes.push({ meal: slot.meal, groupSize: slot.mainGroupSize })
    for (const alt of slot.altDishes) {
      if (alt.meal) dishes.push({ meal: alt.meal, groupSize: alt.groupSize })
    }
  }
  return dishes
}

// "No Diet" isn't a real diet tag any recipe has — it's a sentinel meaning
// "don't filter by diet at all, this person/household can eat anything."
// Every diet check should go through this function rather than checking
// meal.dietType.includes(...) directly, so NO_DIET is handled consistently
// everywhere instead of needing a special case at every call site.
export const NO_DIET = 'No Diet' as const

export function matchesDiet(meal: Meal, dietType: string): boolean {
  if (dietType === NO_DIET) return true
  return meal.dietType.includes(dietType)
}

export function filterMealsForSlot(
  meals: Meal[],
  cuisines: string[],
  dietType: string,
  slot: string
): Meal[] {
  return meals.filter(m =>
    cuisines.includes(m.cuisine) &&
    matchesDiet(m, dietType) &&
    m.mealType.includes(slot)
  )
}

// Same idea, but doesn't filter by diet at all — used internally when we
// need to re-filter the SAME base pool by several different diets (main
// household diet, plus each special-diet group) without re-querying the
// full recipe list each time.
function filterMealsBySlotAndCuisine(meals: Meal[], cuisines: string[], slot: string): Meal[] {
  return meals.filter(m => cuisines.includes(m.cuisine) && m.mealType.includes(slot))
}

function pickAffordableVariedMeal(
  pool: Meal[],
  groupSize: number,
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
      const scaleFactor = getScaleFactor(meal, groupSize)
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

// Tries to find ONE meal that satisfies the main diet AND every special
// diet at once (shared, no extra cost). If nothing like that exists (or
// nothing affordable does), falls back to a separate main dish for the
// main group plus one alt dish per special-diet group.
function fillMealSlot(
  allDietPool: Meal[], // already filtered by cuisine + mealType, NOT yet by diet
  mainDietType: string,
  specialDietGroups: SpecialDietGroup[],
  mainGroupSize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>,
  usedIds: Set<number>,
  remainingBudget: number,
  reserveForRest: number,
  excludeToday: Set<number>,
  fairShareCeiling: number,
  dayIndex: number
): { result: MealSlotResult; cost: number } {
  const familySize = mainGroupSize + specialDietGroups.reduce((sum, g) => sum + g.names.length, 0)
  const allRequiredDiets = [mainDietType, ...specialDietGroups.map(g => g.dietType)]
  const sharedPool = allDietPool.filter(m => allRequiredDiets.every(d => matchesDiet(m, d)))

  if (sharedPool.length > 0) {
    const { meal, cost } = pickAffordableVariedMeal(
      sharedPool, familySize, pantry, ingredients, usedIds,
      remainingBudget, reserveForRest, excludeToday, fairShareCeiling, dayIndex
    )
    if (meal) {
      return { result: { meal, mainGroupSize: familySize, altDishes: [] }, cost }
    }
  }

  // No shared meal worked — split into a main dish + alt dish(es)
  const mainPool = allDietPool.filter(m => matchesDiet(m, mainDietType))
  const { meal: mainMeal, cost: mainCost } = pickAffordableVariedMeal(
    mainPool, mainGroupSize, pantry, ingredients, usedIds,
    remainingBudget, reserveForRest, excludeToday, fairShareCeiling, dayIndex
  )

  let totalCost = mainCost
  let runningBudget = remainingBudget - mainCost
  const altDishes: AltDish[] = []

  for (const group of specialDietGroups) {
    const altPool = allDietPool.filter(m => matchesDiet(m, group.dietType))
    const { meal: altMeal, cost: altCost } = pickAffordableVariedMeal(
      altPool, group.names.length, pantry, ingredients, usedIds,
      runningBudget, reserveForRest, excludeToday, fairShareCeiling, dayIndex
    )
    if (altMeal) {
      altDishes.push({ meal: altMeal, forNames: group.names, dietType: group.dietType, groupSize: group.names.length })
      totalCost += altCost
      runningBudget -= altCost
    }
  }

  return { result: { meal: mainMeal, mainGroupSize, altDishes }, cost: totalCost }
}

// Cheapest possible cost for an ENTIRE slot, accounting for the fact that
// a split (main dish + alt dishes) might be needed — this is what the
// reserve/budget-safety math uses, so it must never underestimate. If we
// only checked the shared-pool cost, an empty shared pool would wrongly
// look "free" (cheapestPossibleCost returns 0 for an empty pool), when in
// reality a split still costs real money.
function cheapestPossibleSlotCost(
  allDietPool: Meal[],
  mainDietType: string,
  specialDietGroups: SpecialDietGroup[],
  mainGroupSize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>
): number {
  const mainPool = allDietPool.filter(m => matchesDiet(m, mainDietType))
  let cost = cheapestPossibleCost(mainPool, mainGroupSize, pantry, ingredients)
  for (const group of specialDietGroups) {
    const altPool = allDietPool.filter(m => matchesDiet(m, group.dietType))
    cost += cheapestPossibleCost(altPool, group.names.length, pantry, ingredients)
  }
  return cost
}

export function buildPantryFromPlan(
  plan: DayPlan[],
  ingredients: Record<string, Ingredient>
) {
  const pantry: Pantry = new Map()
  plan.forEach((day, dayIndex) => {
    agePerishables(pantry, dayIndex)
    for (const { meal, groupSize } of getAllDishesForDay(day)) {
      const scaleFactor = getScaleFactor(meal, groupSize)
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
  budgetPerTrip: number,
  specialDietMembers: SpecialDietMember[] = []
): { plan: DayPlan[]; pantry: Pantry; totalSpend: number } {
  const usableMeals = getUsableMeals(allMeals, ingredients)

  const specialDietGroups = groupSpecialDietMembers(specialDietMembers)
  const specialCount = specialDietGroups.reduce((sum, g) => sum + g.names.length, 0)
  const mainGroupSize = familySize - specialCount

  // The meal plan always starts the day AFTER your shopping day — you shop
  // Saturday, the plan covers Sunday onward. The plan always covers exactly
  // ONE shopping cycle — the app is meant to be revisited once that cycle
  // is about to run out, rather than generating multiple trips' worth up front.
  const planStart = new Date(shoppingDate + 'T00:00:00')
  planStart.setDate(planStart.getDate() + 1)
  const planStartDate = planStart.toISOString().split('T')[0]

  const totalDays = shoppingIntervalDays
  const dates = getDateStrings(planStartDate, totalDays)
  const breakfastPool = filterMealsBySlotAndCuisine(usableMeals, cuisines, 'Breakfast')
  const lunchPool = filterMealsBySlotAndCuisine(usableMeals, cuisines, 'Lunch')
  const dinnerPool = filterMealsBySlotAndCuisine(usableMeals, cuisines, 'Dinner')

  const pantry: Pantry = new Map()
  const usedIds = { breakfast: new Set<number>(), lunch: new Set<number>(), dinner: new Set<number>() }

  const plan: DayPlan[] = []
  let totalSpend = 0
  let cycleSpend = 0

  const GENEROSITY = 1.5

  dates.forEach((date, index) => {
    const dayInBudgetCycle = index % shoppingIntervalDays
    if (dayInBudgetCycle === 0) {
      cycleSpend = 0
    }

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
      cheapestPossibleSlotCost(freshBreakfastPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients) +
      cheapestPossibleSlotCost(freshLunchPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients) +
      cheapestPossibleSlotCost(freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients)
    const reserveForFutureDays = dailyMinCost * daysLeftInCycleAfterToday

    const mealsRemainingInCycle = daysRemainingInCycle * 3

    const breakfastReserve = reserveForFutureDays +
      cheapestPossibleSlotCost(freshLunchPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients) +
      cheapestPossibleSlotCost(freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients)
    const breakfastFairShare = (budgetPerTrip - cycleSpend) / mealsRemainingInCycle * GENEROSITY
    const { result: breakfast, cost: bCost } = fillMealSlot(
      freshBreakfastPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients,
      usedIds.breakfast, budgetPerTrip - cycleSpend, breakfastReserve, excludeToday, breakfastFairShare, index
    )
    cycleSpend += bCost
    totalSpend += bCost
    if (breakfast.meal) excludeToday.add(breakfast.meal.recipeId)

    const lunchReserve = reserveForFutureDays +
      cheapestPossibleSlotCost(freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients)
    const lunchFairShare = (budgetPerTrip - cycleSpend) / (mealsRemainingInCycle - 1) * GENEROSITY
    const { result: lunch, cost: lCost } = fillMealSlot(
      freshLunchPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients,
      usedIds.lunch, budgetPerTrip - cycleSpend, lunchReserve, excludeToday, lunchFairShare, index
    )
    cycleSpend += lCost
    totalSpend += lCost
    if (lunch.meal) excludeToday.add(lunch.meal.recipeId)

    const dinnerFairShare = (budgetPerTrip - cycleSpend) / (mealsRemainingInCycle - 2) * GENEROSITY
    const { result: dinner, cost: dCost } = fillMealSlot(
      freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients,
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

export function generateShoppingListsByInterval(
  plan: DayPlan[],
  intervalDays: number,
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
      for (const { meal, groupSize } of getAllDishesForDay(day)) {
        const scaleFactor = getScaleFactor(meal, groupSize)
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
