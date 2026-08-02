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

const COUNT_ALIASES = new Set(['unit', 'tortilla', 'egg', 'tomato', 'clove', 'tea bag', 'mini avocado', 'link', 'piece', 'naan', "spear", 'stalk', 'pepper', 'medium onion', 'slice', 'pepper', 'lime', 'bun'])
const WHOLE_PACKAGE_UNITS = new Set(['can', 'bag', "package"])

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
    if (ing.ingredientId == null) return false
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

export type NutritionBreakdown = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
}

export function calculateMealNutrition(
  meal: Meal,
  familySize: number,
  ingredients: Record<string, Ingredient>
): NutritionBreakdown {
  const scaleFactor = getScaleFactor(meal, familySize)
  const totals: NutritionBreakdown = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }

  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) continue
    const price = ingredients[ing.ingredientId.toString()]
    if (!price) continue

    const needed = getNeededAmountInPriceUnits(ing, price, scaleFactor)
    if (needed === null) continue

    const servingSize = price.servingSize ?? 1
    const servingsUsed = needed / servingSize

    totals.calories += servingsUsed * (price.calories ?? 0)
    totals.protein += servingsUsed * (price.protein ?? 0)
    totals.carbs += servingsUsed * (price.carbs ?? 0)
    totals.fat += servingsUsed * (price.fat ?? 0)
    totals.fiber += servingsUsed * (price.fiber ?? 0)
    totals.sugar += servingsUsed * (price.sugar ?? 0)
    totals.sodium += servingsUsed * (price.sodium ?? 0)
  }

  return totals
}

export type MacroTargets = {
  carbsRatio: number        // fraction of the day's ACTUAL calories that should come from carbs
  proteinRatio: number      // fraction of the day's ACTUAL calories that should come from protein
  fiberPer1000Kcal: number  // grams of fiber recommended per 1,000 kcal actually eaten
  fatPerDay: number         // informational only — see the fat-quality note below
  sodiumPerDayMax: number   // absolute ceiling — sodium guidance does NOT scale with calorie intake
}

// Daily macro targets per health condition, based on ADA / USDA Dietary
// Guidelines. Carbs, protein, and fiber are all expressed as a share of
// calories (or per 1,000 kcal) rather than a fixed gram number, because
// that's how the underlying guidance actually works — a 1,200-calorie day
// and a 2,000-calorie day shouldn't share the same gram ceiling. The actual
// gram target gets computed at scoring time from each day's REAL tracked
// calories, not a fixed assumption. These are soft DAILY targets, not
// per-meal minimums — the generator balances the whole day toward them
// rather than requiring every single meal to individually hit them.
//
// Sodium is the one exception — its 2,300mg/day ceiling is a flat guideline
// (blood pressure / kidney load), not tied to how many calories someone eats.
//
// Total fat is NOT scored directly. What actually matters for diabetes risk
// is fat QUALITY (saturated vs. unsaturated), not total grams — a total-fat
// equation would score bacon as "better" than avocado or salmon, which is
// backwards. We don't have gram-level saturated fat data per ingredient, so
// fat quality is instead handled by fatQualityAdjustment() below, using a
// preference nudge rather than a precise number.
export const HEALTH_CONDITION_TARGETS: Record<string, MacroTargets> = {
  'Type 2 Diabetes': {
    carbsRatio: 0.45,        // mid-range of 40-50% guidance
    proteinRatio: 0.20,      // mid-range of 15-25% guidance
    fiberPer1000Kcal: 14,    // ADA/USDA guidance: ~14g per 1,000 kcal
    fatPerDay: 67,           // informational only, not scored
    sodiumPerDayMax: 2300,   // ADA/USDA guidance: under 2,300mg/day
  },
}

// Merges however many health conditions apply to one person/group into a
// single set of targets, by taking the STRICTEST bound per field — e.g. if
// two conditions disagreed on the sodium ceiling, the lower (stricter) one
// wins, so the day's balance never accidentally under-restricts someone.
// Returns null for an empty list, meaning "no condition applies here, don't
// nudge anything" — replaces the old single-sentinel-string design.
export function getCombinedMacroTargets(healthConditions: string[]): MacroTargets | null {
  const applicable = healthConditions
    .map(condition => HEALTH_CONDITION_TARGETS[condition])
    .filter((t): t is MacroTargets => t !== undefined)

  if (applicable.length === 0) return null

  return {
    carbsRatio: Math.min(...applicable.map(t => t.carbsRatio)),
    proteinRatio: Math.max(...applicable.map(t => t.proteinRatio)),
    fiberPer1000Kcal: Math.max(...applicable.map(t => t.fiberPer1000Kcal)),
    fatPerDay: Math.min(...applicable.map(t => t.fatPerDay)),
    sodiumPerDayMax: Math.min(...applicable.map(t => t.sodiumPerDayMax)),
  }
}

export type DailyNutritionTracker = {
  calories: number
  carbs: number
  protein: number
  fat: number
  fiber: number
  sodium: number
}

// Ingredient name fragments that reliably signal a plant-based unsaturated
// fat source, for cases where isFish/containsNuts alone wouldn't catch it
// (avocado and cooking oils aren't flagged as fish or nuts in the data).
const UNSATURATED_FAT_NAME_HINTS = ['avocado', 'olive oil', 'canola oil', 'sunflower oil', 'flaxseed', 'chia seed']

// Recipe text that suggests frying/breading — a real limitation of ANY
// ingredient-level nutrition data (even true saturated fat grams) is that
// it describes the raw ingredient, not what high-heat oil does to a dish
// during cooking. Scanning the recipe's own name/steps is the honest way
// to catch that, since it's a preparation effect, not an ingredient one.
const FRIED_PREP_KEYWORDS = ['fried', 'fry', 'deep-fry', 'deep fry', 'breaded', 'battered']

function isLikelyFried(meal: Meal): boolean {
  const text = `${meal.name} ${meal.steps.join(' ')}`.toLowerCase()
  return FRIED_PREP_KEYWORDS.some(keyword => text.includes(keyword))
}

// A soft nudge toward better fat QUALITY, not quantity. Rather than a flat
// yes/no "does this meal contain meat/dairy," this weights the signal by
// how many actual fat GRAMS each ingredient contributes (using the fat
// field you already track) — so a lean cut like chicken breast (a few
// grams of fat) barely moves this, while a fatty cut like bacon, or a
// cream-heavy sauce, moves it a lot. That's what lets grilled chicken and
// bacon — or plain yogurt and a cream sauce — land differently, instead of
// all being treated as one "meat" or "dairy" bucket.
function fatQualityAdjustment(meal: Meal, ingredients: Record<string, Ingredient>): number {
  const scaleFactor = getScaleFactor(meal, 1) // per-person basis, matching the rest of the day's macro scoring

  let unsaturatedLeaningFat = 0
  let saturatedLeaningFat = 0

  for (const ing of meal.ingredients) {
    if (ing.ingredientId === null) continue
    const price = ingredients[ing.ingredientId.toString()]
    if (!price) continue

    const needed = getNeededAmountInPriceUnits(ing, price, scaleFactor)
    if (needed === null) continue

    const servingSize = price.servingSize ?? 1
    const servingsUsed = needed / servingSize
    const fatFromThisIngredient = servingsUsed * (price.fat ?? 0)
    if (fatFromThisIngredient <= 0) continue

    const nameLower = price.name.toLowerCase()
    const isUnsaturatedSource = price.isFish || price.containsNuts || UNSATURATED_FAT_NAME_HINTS.some(hint => nameLower.includes(hint))
    const isSaturatedSource = price.isMeat || price.isDairy

    if (isUnsaturatedSource) unsaturatedLeaningFat += fatFromThisIngredient
    else if (isSaturatedSource) saturatedLeaningFat += fatFromThisIngredient
  }

  // Small per-gram weight so this nudges the score rather than overriding
  // the carb/protein/fiber/sodium balance — tune this constant once you've
  // seen it play out against real meals.
  const FAT_GRAM_WEIGHT = 0.02
  const friedPrepPenalty = isLikelyFried(meal) ? 0.2 : 0

  return (saturatedLeaningFat - unsaturatedLeaningFat) * FAT_GRAM_WEIGHT + friedPrepPenalty
}

const TOTAL_MEALS_PER_DAY = 3
const REFERENCE_CALORIES_PER_DAY = 2000 // fallback only — used before any real data exists for the day

// Estimates how many calories today will add up to, based on what's
// actually been eaten so far, instead of always assuming a fixed 2,000 —
// a 1,200-calorie day and a 2,000-calorie day shouldn't share the same
// carb/protein/fiber gram targets, since those are really percentages of
// calories, not fixed numbers. Falls back to the standard 2,000 reference
// only for the very first meal of the day, when there's no real data yet —
// it self-corrects as soon as a real meal is tracked.
function estimateTodaysCalories(tracker: DailyNutritionTracker, mealsRemainingToday: number): number {
  const mealsSoFar = TOTAL_MEALS_PER_DAY - mealsRemainingToday
  if (mealsSoFar <= 0 || tracker.calories <= 0) return REFERENCE_CALORIES_PER_DAY
  const averageCaloriesPerMealSoFar = tracker.calories / mealsSoFar
  return averageCaloriesPerMealSoFar * TOTAL_MEALS_PER_DAY
}

// Scores how well a candidate meal helps the WHOLE DAY trend toward its
// macro targets, instead of requiring every individual meal to hit them.
// It figures out what's left to "spend" (or, for fiber, still needs to be
// eaten) for the rest of the day, spreads that remaining amount evenly
// across the meals still to come, and prefers meals close to that per-meal
// share. Fiber and sodium are one-sided: fiber is a floor (more is never
// bad), sodium is a ceiling (less is never bad), so only shortfalls (fiber)
// or overages (sodium) are penalized.
export function nutritionFitScore(
  meal: Meal,
  mealNutrition: NutritionBreakdown,
  tracker: DailyNutritionTracker,
  targets: MacroTargets,
  mealsRemainingToday: number,
  ingredients: Record<string, Ingredient>
): number {
  const projectedCalories = estimateTodaysCalories(tracker, mealsRemainingToday)
  const targetCarbsGrams = (targets.carbsRatio * projectedCalories) / 4
  const targetProteinGrams = (targets.proteinRatio * projectedCalories) / 4
  const targetFiberGrams = targets.fiberPer1000Kcal * (projectedCalories / 1000)

  const idealCarbs = (targetCarbsGrams - tracker.carbs) / mealsRemainingToday
  const idealProtein = (targetProteinGrams - tracker.protein) / mealsRemainingToday
  const idealFiber = (targetFiberGrams - tracker.fiber) / mealsRemainingToday
  const idealSodium = (targets.sodiumPerDayMax - tracker.sodium) / mealsRemainingToday

  // Normalize each macro's error against its own target so bigger gram
  // numbers (like carbs or sodium) don't automatically dominate.
  const carbError = Math.abs(mealNutrition.carbs - idealCarbs) / targetCarbsGrams
  const proteinError = Math.abs(mealNutrition.protein - idealProtein) / targetProteinGrams
  const fiberError = Math.max(0, idealFiber - mealNutrition.fiber) / targetFiberGrams
  const sodiumError = Math.max(0, mealNutrition.sodium - idealSodium) / targets.sodiumPerDayMax

  return carbError + proteinError + fiberError + sodiumError + fatQualityAdjustment(meal, ingredients)
}

// Turns the same macro math nutritionFitScore uses into short, plain-language
// reasons a meal is a good fit today — e.g. "Lower carb", "Adds fiber" — so
// the swap UI can explain WHY the top-ranked option is ranked there instead
// of just showing an opaque number. Only surfaces a reason the meal actually
// earns (never invents one), ranked strongest first so the UI can show just
// the top one or two. Kept in sync with nutritionFitScore's math on purpose —
// if that scoring changes, update the thresholds here too.
export function nutritionFitReasons(
  mealNutrition: NutritionBreakdown,
  tracker: DailyNutritionTracker,
  targets: MacroTargets,
  mealsRemainingToday: number
): string[] {
  const projectedCalories = estimateTodaysCalories(tracker, mealsRemainingToday)
  const targetCarbsGrams = (targets.carbsRatio * projectedCalories) / 4
  const targetFiberGrams = targets.fiberPer1000Kcal * (projectedCalories / 1000)

  const idealCarbs = (targetCarbsGrams - tracker.carbs) / mealsRemainingToday
  const idealFiber = (targetFiberGrams - tracker.fiber) / mealsRemainingToday
  const idealSodium = (targets.sodiumPerDayMax - tracker.sodium) / mealsRemainingToday

  const reasons: { label: string; strength: number }[] = []

  // Comes in under what's left to "spend" on carbs today.
  const carbSlack = (idealCarbs - mealNutrition.carbs) / targetCarbsGrams
  if (carbSlack > 0.03) reasons.push({ label: 'Lower carb', strength: carbSlack })

  // Meets or beats the fiber still needed today.
  const fiberSurplus = (mealNutrition.fiber - idealFiber) / targetFiberGrams
  if (fiberSurplus > 0.03) reasons.push({ label: 'Adds fiber', strength: fiberSurplus })

  // Comes in under the sodium ceiling still available today.
  const sodiumSlack = (idealSodium - mealNutrition.sodium) / targets.sodiumPerDayMax
  if (sodiumSlack > 0.03) reasons.push({ label: 'Lower sodium', strength: sodiumSlack })

  return reasons.sort((a, b) => b.strength - a.strength).map(r => r.label)
}

// Whether a SPECIFIC meal, added to what's already been tracked today,
// represents a genuine problem for someone's health condition — not just
// "a slightly better option exists." Only trips for a meaningful violation
// (this meal alone pushes the day's carb or sodium ceiling well past 100%),
// so it stays rare by design — automatic splitting should be reserved for
// real problems, not everyday ranking differences. Tune this if it fires
// too often or too rarely once you've seen it play out against real meals.
const POOR_HEALTH_FIT_OVERAGE_THRESHOLD = 0.15 // 15% past the day's ceiling

function isPoorHealthFit(
  mealNutrition: NutritionBreakdown,
  tracker: DailyNutritionTracker,
  targets: MacroTargets,
  mealsRemainingToday: number
): boolean {
  const projectedCalories = estimateTodaysCalories(tracker, mealsRemainingToday)
  const targetCarbsGrams = (targets.carbsRatio * projectedCalories) / 4

  const projectedCarbs = tracker.carbs + mealNutrition.carbs
  const projectedSodium = tracker.sodium + mealNutrition.sodium

  const carbOverage = (projectedCarbs - targetCarbsGrams) / targetCarbsGrams
  const sodiumOverage = (projectedSodium - targets.sodiumPerDayMax) / targets.sodiumPerDayMax

  return carbOverage > POOR_HEALTH_FIT_OVERAGE_THRESHOLD || sodiumOverage > POOR_HEALTH_FIT_OVERAGE_THRESHOLD
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

export type SpecialDietMember = {
  name: string
  dietType: string
  healthConditions: string[]
}

type SpecialDietGroup = {
  groupKey: string
  dietType: string
  names: string[]
  healthConditions: string[]
}

// Groups individual family members by diet — so 2 people who are both
// vegan share ONE alt dish (scaled for 2), rather than generating two
// separate single-portion dishes. Health conditions merge too: the group's
// conditions are the UNION of every member's conditions in that group, so
// their shared alt dish stays aware of whichever conditions apply to anyone
// eating it.
function groupSpecialDietMembers(members: SpecialDietMember[]): SpecialDietGroup[] {
  const groups = new Map<string, { dietType: string; names: string[]; healthConditions: Set<string> }>()
  for (const member of members) {
    const conditionSignature = [...(member.healthConditions ?? [])].sort().join(',')
    const groupKey = `${member.dietType}::${conditionSignature}`
    const existing = groups.get(groupKey) ?? { dietType: member.dietType, names: [], healthConditions: new Set<string>() }
    existing.names.push(member.name)
    for (const condition of member.healthConditions ?? []) existing.healthConditions.add(condition)
    groups.set(groupKey, existing)
  }
  return [...groups.entries()].map(([groupKey, g]) => ({
    groupKey,
    dietType: g.dietType,
    names: g.names,
    healthConditions: [...g.healthConditions],
  }))
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
  dayIndex: number,
  healthConditions: string[] = [],
  dailyTracker: DailyNutritionTracker | null = null,
  mealsRemainingToday: number = 1
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

  const healthTargets = getCombinedMacroTargets(healthConditions)

  let chosen
  if (affordable.length > 0) {
    if (healthTargets && dailyTracker) {
      const withNutritionScore = affordable.map(s => ({
        ...s,
        nutritionScore: nutritionFitScore(
          s.meal,
          calculateMealNutrition(s.meal, 1, ingredients), // 1 = per-person nutrition, regardless of how many the dish is scaled to serve
          dailyTracker,
          healthTargets,
          mealsRemainingToday,
          ingredients
        ),
      }))
      withNutritionScore.sort((a, b) => a.nutritionScore - b.nutritionScore)
      // Randomize within the better-fitting half rather than always picking
      // the single "best" meal, so there's still day-to-day variety.
      const shortlistSize = Math.max(1, Math.ceil(withNutritionScore.length / 2))
      const shortlist = withNutritionScore.slice(0, shortlistSize)
      chosen = shortlist[Math.floor(Math.random() * shortlist.length)]
    } else {
      chosen = affordable[Math.floor(Math.random() * affordable.length)]
    }
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

  if (healthTargets && dailyTracker) {
    const chosenNutrition = calculateMealNutrition(chosen.meal, 1, ingredients)
    dailyTracker.calories += chosenNutrition.calories
    dailyTracker.carbs += chosenNutrition.carbs
    dailyTracker.protein += chosenNutrition.protein
    dailyTracker.fat += chosenNutrition.fat
    dailyTracker.fiber += chosenNutrition.fiber
    dailyTracker.sodium += chosenNutrition.sodium
  }

  return { meal: chosen.meal, cost: chosen.cost }
}

// Picks WHICH meal a group would eat from a pool, WITHOUT yet purchasing
// anything or committing pantry consumption — nutrition-per-person doesn't
// depend on group size, so the choice itself can be made before we know the
// final headcount. Reserves the recipe's identity in usedIds immediately
// (so it can't get double-picked elsewhere today), but the real cost/pantry
// commitment happens later, via commitMealPurchase, once the final group
// size is known.
function chooseMealForGroup(
  pool: Meal[],
  groupSize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>,
  usedIds: Set<number>,
  remainingBudget: number,
  reserveForRest: number,
  excludeToday: Set<number>,
  fairShareCeiling: number,
  healthConditions: string[] = [],
  dailyTracker: DailyNutritionTracker | null = null,
  mealsRemainingToday: number = 1
): Meal | null {
  const poolExcludingToday = pool.filter(m => !excludeToday.has(m.recipeId))
  if (poolExcludingToday.length === 0) return null

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

  const healthTargets = getCombinedMacroTargets(healthConditions)

  let chosen
  if (affordable.length > 0) {
    if (healthTargets && dailyTracker) {
      const withNutritionScore = affordable.map(s => ({
        ...s,
        nutritionScore: nutritionFitScore(
          s.meal,
          calculateMealNutrition(s.meal, 1, ingredients),
          dailyTracker,
          healthTargets,
          mealsRemainingToday,
          ingredients
        ),
      }))
      withNutritionScore.sort((a, b) => a.nutritionScore - b.nutritionScore)
      const shortlistSize = Math.max(1, Math.ceil(withNutritionScore.length / 2))
      const shortlist = withNutritionScore.slice(0, shortlistSize)
      chosen = shortlist[Math.floor(Math.random() * shortlist.length)]
    } else {
      chosen = affordable[Math.floor(Math.random() * affordable.length)]
    }
  } else {
    const fullScored = scoreMeals(poolExcludingToday)
    const withinHardBudget = fullScored.filter(s => s.cost <= remainingBudget)

    if (withinHardBudget.length > 0) {
      withinHardBudget.sort((a, b) => a.cost - b.cost)
      chosen = withinHardBudget[0]
    } else {
      return null
    }
  }

  usedIds.add(chosen.meal.recipeId)
  return chosen.meal
}

// Actually purchases/commits a meal already chosen via chooseMealForGroup,
// scaled for whatever the FINAL group size turns out to be — this is what
// lets a shared dish get bought for exactly however many people actually
// end up eating it, instead of always the full original headcount.
function commitMealPurchase(
  meal: Meal,
  groupSize: number,
  pantry: Pantry,
  ingredients: Record<string, Ingredient>,
  dayIndex: number,
  healthConditions: string[] = [],
  dailyTracker: DailyNutritionTracker | null = null
): number {
  const scaleFactor = getScaleFactor(meal, groupSize)
  const cost = marginalCost(meal, pantry, ingredients, scaleFactor)

  for (const ing of meal.ingredients) {
    usePantryIngredient(pantry, ing, ingredients, scaleFactor, dayIndex)
  }

  const healthTargets = getCombinedMacroTargets(healthConditions)
  if (healthTargets && dailyTracker) {
    const chosenNutrition = calculateMealNutrition(meal, 1, ingredients)
    dailyTracker.calories += chosenNutrition.calories
    dailyTracker.carbs += chosenNutrition.carbs
    dailyTracker.protein += chosenNutrition.protein
    dailyTracker.fat += chosenNutrition.fat
    dailyTracker.fiber += chosenNutrition.fiber
    dailyTracker.sodium += chosenNutrition.sodium
  }

  return cost
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
  dayIndex: number,
  healthConditions: string[] = [],
  dailyTracker: DailyNutritionTracker | null = null,
  mealsRemainingToday: number = 1,
  altGroupTrackers: Map<string, DailyNutritionTracker> | null = null
): { result: MealSlotResult; cost: number } {
  const familySize = mainGroupSize + specialDietGroups.reduce((sum, g) => sum + g.names.length, 0)
  const allRequiredDiets = [mainDietType, ...specialDietGroups.map(g => g.dietType)]
  const sharedPool = allDietPool.filter(m => allRequiredDiets.every(d => matchesDiet(m, d)))

  if (sharedPool.length > 0) {
    const chosenSharedMeal = chooseMealForGroup(
      sharedPool, familySize, pantry, ingredients, usedIds,
      remainingBudget, reserveForRest, excludeToday, fairShareCeiling,
      healthConditions, dailyTracker, mealsRemainingToday
    )

    if (chosenSharedMeal) {
      // This dish satisfies everyone's DIET, but diet compatibility is the
      // only thing checked to get here — it could still be a real problem
      // for someone's individual health condition. Carve anyone out for
      // whom THIS SPECIFIC dish is a genuine problem into their own dish
      // instead of silently serving it to them.
      const sharedMealNutrition = calculateMealNutrition(chosenSharedMeal, 1, ingredients)
      const carveOutGroups: SpecialDietGroup[] = []
      const stayingGroups: SpecialDietGroup[] = []
      for (const group of specialDietGroups) {
        const groupTargets = getCombinedMacroTargets(group.healthConditions)
        const groupTracker = altGroupTrackers?.get(group.groupKey) ?? null
        if (groupTargets && groupTracker && isPoorHealthFit(sharedMealNutrition, groupTracker, groupTargets, mealsRemainingToday)) {
          carveOutGroups.push(group)
        } else {
          stayingGroups.push(group)
        }
      }

      // Try to find each carved-out group their own dish BEFORE committing
      // the shared dish's purchase, so the shared dish gets bought/scaled
      // for exactly however many people actually end up eating it — not
      // the original full family size.
      let runningBudget = remainingBudget
      let altTotalCost = 0
      const altDishes: AltDish[] = []
      const trulyCarvedOut: SpecialDietGroup[] = []
      const revertedToShared: SpecialDietGroup[] = []

      for (const group of carveOutGroups) {
        const altPool = allDietPool.filter(m => matchesDiet(m, group.dietType) && m.recipeId !== chosenSharedMeal.recipeId)
        const groupTracker = altGroupTrackers?.get(group.groupKey) ?? null
        const { meal: altMeal, cost: altCost } = pickAffordableVariedMeal(
          altPool, group.names.length, pantry, ingredients, usedIds,
          runningBudget, reserveForRest, excludeToday, fairShareCeiling, dayIndex,
          group.healthConditions, groupTracker, mealsRemainingToday
        )
        if (altMeal) {
          altDishes.push({ meal: altMeal, forNames: group.names, dietType: group.dietType, groupSize: group.names.length })
          runningBudget -= altCost
          altTotalCost += altCost
          trulyCarvedOut.push(group)
        } else {
          // No affordable/available alternative — they end up eating the
          // shared dish after all, so they're not actually carved out.
          revertedToShared.push(group)
        }
      }

      const finalSharedGroupSize = familySize - trulyCarvedOut.reduce((sum, g) => sum + g.names.length, 0)
      const sharedCost = commitMealPurchase(
        chosenSharedMeal, finalSharedGroupSize, pantry, ingredients, dayIndex,
        healthConditions, dailyTracker
      )

      // Everyone NOT carved out — whether never flagged, or their alt
      // search came up empty — ends up eating the shared dish, so their own
      // personal tracker (if they have a health condition) needs it too, so
      // later meals today see their true running total either way.
      for (const group of [...stayingGroups, ...revertedToShared]) {
        if (group.healthConditions.length === 0) continue
        const groupTracker = altGroupTrackers?.get(group.groupKey)
        if (!groupTracker) continue
        groupTracker.calories += sharedMealNutrition.calories
        groupTracker.carbs += sharedMealNutrition.carbs
        groupTracker.protein += sharedMealNutrition.protein
        groupTracker.fat += sharedMealNutrition.fat
        groupTracker.fiber += sharedMealNutrition.fiber
        groupTracker.sodium += sharedMealNutrition.sodium
      }

      return {
        result: { meal: chosenSharedMeal, mainGroupSize: finalSharedGroupSize, altDishes },
        cost: sharedCost + altTotalCost
      }
    }
  }

  // No shared meal worked — split into a main dish + alt dish(es). The main
  // dish is still "the household eating together," so it stays health-
  // condition aware; each alt dish below is now ALSO health-condition aware
  // for whichever conditions its own group members have, tracked against
  // its own running daily tracker — so someone split into their own dish
  // still gets their day balanced, not just the shared main dish.
  const mainPool = allDietPool.filter(m => matchesDiet(m, mainDietType))
  const { meal: mainMeal, cost: mainCost } = pickAffordableVariedMeal(
    mainPool, mainGroupSize, pantry, ingredients, usedIds,
    remainingBudget, reserveForRest, excludeToday, fairShareCeiling, dayIndex,
    healthConditions, dailyTracker, mealsRemainingToday
  )

  let totalCost = mainCost
  let runningBudget = remainingBudget - mainCost
  const altDishes: AltDish[] = []

  for (const group of specialDietGroups) {
    const altPool = allDietPool.filter(m => matchesDiet(m, group.dietType))
    const groupTracker = altGroupTrackers?.get(group.groupKey) ?? null
    const { meal: altMeal, cost: altCost } = pickAffordableVariedMeal(
      altPool, group.names.length, pantry, ingredients, usedIds,
      runningBudget, reserveForRest, excludeToday, fairShareCeiling, dayIndex,
      group.healthConditions, groupTracker, mealsRemainingToday
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

// Every recipe actually being served in a slot — the shared main dish AND
// every alt dish — needs to be excluded from the rest of today's slots.
// Previously only the main dish's recipeId was tracked here, which is why
// someone split into their own alt dish could get served the same alt
// dish twice in one day (e.g. lunch and dinner).
function addSlotRecipesToExcludeToday(slot: MealSlotResult, excludeToday: Set<number>): void {
  if (slot.meal) excludeToday.add(slot.meal.recipeId)
  for (const alt of slot.altDishes) {
    if (alt.meal) excludeToday.add(alt.meal.recipeId)
  }
}

// Every distinct recipe — main dish AND every alt dish — used anywhere in
// an already-generated plan, split out by meal type. Used to seed the NEXT
// plan's "already used" tracking so regenerating with the same settings
// actively prefers genuinely different recipes over repeating the exact
// same week, instead of starting from a blank slate with no memory of what
// was just served.
export function getUsedRecipeIdsByMealType(plan: DayPlan[]): { breakfast: Set<number>; lunch: Set<number>; dinner: Set<number> } {
  const result = { breakfast: new Set<number>(), lunch: new Set<number>(), dinner: new Set<number>() }
  for (const day of plan) {
    for (const mealType of ['breakfast', 'lunch', 'dinner'] as const) {
      const slot = day[mealType]
      if (slot.meal) result[mealType].add(slot.meal.recipeId)
      for (const alt of slot.altDishes) {
        if (alt.meal) result[mealType].add(alt.meal.recipeId)
      }
    }
  }
  return result
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
  specialDietMembers: SpecialDietMember[] = [],
  healthConditions: string[] = [],
  previousPlanUsedIds: { breakfast: Set<number>; lunch: Set<number>; dinner: Set<number> } | null = null  
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
  // Seeding with the previous plan's picks (if any) means "unused" candidates
  // this cycle actively exclude last week's choices first — a repeat only
  // happens if literally nothing else in the pool qualifies.
  const usedIds = {
  breakfast: new Set<number>(previousPlanUsedIds?.breakfast ?? []),
  lunch: new Set<number>(previousPlanUsedIds?.lunch ?? []),
  dinner: new Set<number>(previousPlanUsedIds?.dinner ?? []),
}

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

    // Fresh macro tally for THIS day only — health-condition balancing
    // works within a single day (breakfast/lunch/dinner), not across the
    // whole shopping cycle. Each special-diet group gets its OWN fresh
    // tracker too, so a person split into their own alt dish has their day
    // balanced separately from the shared main dish's tally.
    const dailyTracker: DailyNutritionTracker = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, sodium: 0 }
    const altGroupTrackers = new Map<string, DailyNutritionTracker>(
      specialDietGroups.map(g => [g.groupKey, { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, sodium: 0 }])
    )

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
    const remainingBudgetToday = budgetPerTrip - cycleSpend
    const reserveForFutureDaysUncapped = dailyMinCost * daysLeftInCycleAfterToday
    const reserveForFutureDays = Math.max(0, Math.min(reserveForFutureDaysUncapped, remainingBudgetToday - dailyMinCost))
    console.log(`[reserve check] day ${index}: uncapped=${reserveForFutureDaysUncapped.toFixed(2)}, capped=${reserveForFutureDays.toFixed(2)}, remainingBudgetToday=${remainingBudgetToday.toFixed(2)}`)

    const mealsRemainingInCycle = daysRemainingInCycle * 3

    const breakfastReserve = reserveForFutureDays +
      cheapestPossibleSlotCost(freshLunchPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients) +
      cheapestPossibleSlotCost(freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients)
    const breakfastFairShare = (budgetPerTrip - cycleSpend) / mealsRemainingInCycle * GENEROSITY
    const { result: breakfast, cost: bCost } = fillMealSlot(
      freshBreakfastPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients,
      usedIds.breakfast, budgetPerTrip - cycleSpend, breakfastReserve, excludeToday, breakfastFairShare, index,
      healthConditions, dailyTracker, 3, altGroupTrackers
    )
    cycleSpend += bCost
    totalSpend += bCost
    addSlotRecipesToExcludeToday(breakfast, excludeToday)

    const lunchReserve = reserveForFutureDays +
      cheapestPossibleSlotCost(freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients)
    const lunchFairShare = (budgetPerTrip - cycleSpend) / (mealsRemainingInCycle - 1) * GENEROSITY
    const { result: lunch, cost: lCost } = fillMealSlot(
      freshLunchPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients,
      usedIds.lunch, budgetPerTrip - cycleSpend, lunchReserve, excludeToday, lunchFairShare, index,
      healthConditions, dailyTracker, 2, altGroupTrackers
    )
    cycleSpend += lCost
    totalSpend += lCost
    addSlotRecipesToExcludeToday(lunch, excludeToday)

    const dinnerFairShare = (budgetPerTrip - cycleSpend) / (mealsRemainingInCycle - 2) * GENEROSITY
    const { result: dinner, cost: dCost } = fillMealSlot(
      freshDinnerPool, dietType, specialDietGroups, mainGroupSize, pantry, ingredients,
      usedIds.dinner, budgetPerTrip - cycleSpend, reserveForFutureDays, excludeToday, dinnerFairShare, index,
      healthConditions, dailyTracker, 1, altGroupTrackers
    )
    cycleSpend += dCost
    totalSpend += dCost

    plan.push({ date, breakfast, lunch, dinner })
  })

  return { plan, pantry, totalSpend }
}

export type ShoppingListItem = {
  ingredientId: number
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
    for (const [id, entry] of pantry) { // entry is one PantryEntry obejct (id, name, amt left over, packages you've bought, last date purchased)
      const before = purchasedBefore.get(id) ?? 0
      const newThisTrip = entry.packagesPurchased - before
      if (newThisTrip > 0) {
        const price = ingredients[id.toString()]
        if (!price) continue
        const costPerPackage = parsePrice(price.formattedPrice)
        tripList.push({
          ingredientId: id,
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
      ingredientId: entry.ingredientId,
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
