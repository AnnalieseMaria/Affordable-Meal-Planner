import './pico.pink.css'
import './style.css'
import mealsData from './meals.json' // loads meals.json into JavaScript
import ingredientsData from './ingredients.json'
import type { Meal, Ingredient, MealIngredient} from './meals.ts'
import { generateMealPlan, generateShoppingList, getTotalCost, buildPantryFromPlan, matchesDiet, NO_DIET, calculateMealNutrition, estimateMealCost, getCombinedMacroTargets, nutritionFitScore, nutritionFitReasons, getUsedRecipeIdsByMealType, type DayPlan, type ShoppingListItem, type SpecialDietMember, type MealSlotResult, type NutritionBreakdown} from './mealPlanGenerator.ts'
import OneSignalModule from 'onesignal-cordova-plugin'

const meals: Meal[] = [...(mealsData as unknown as Meal[]), ...getCustomMeals()]
const ingredients: Record<string, Ingredient> = { ...(ingredientsData as unknown as Record<string, Ingredient>) }
for (const ing of getCustomIngredients()) {
  ingredients[ing.ingredientId.toString()] = ing
}

const appElement = document.querySelector<HTMLElement>('#app')!
if (!appElement) throw new Error("Couldn't find element with id 'app'")

// ============================================================
// THEME — light/dark mode.
// The actual colors live in style.css as CSS custom properties, split
// into a `:root` block (light) and a `[data-theme="dark"]` block. This
// module's only job is deciding which one is active and applying it —
// it never touches a color value directly, so retheming later never
// requires changing this file.
// ============================================================
type Theme = 'light' | 'dark';

function getSystemPreferredTheme(): Theme {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

// A saved choice always wins; if the user has never picked one, fall back
// to whatever the phone's system setting is at first launch.
function loadTheme(): Theme {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return getSystemPreferredTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

let currentTheme: Theme = loadTheme();
applyTheme(currentTheme); // set before the first render so there's no flash of the wrong theme

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type DietType = "Vegan" | "Vegetarian" | "Gluten-Free" | "Dairy-Free" | "Pescatarian" | typeof NO_DIET;
const dietTypes: DietType[] = ["Dairy-Free", "Gluten-Free", "Pescatarian", "Vegan", "Vegetarian", NO_DIET]

// Health conditions are checkboxes, not radio buttons — someone could have
// more than one (e.g. Type 2 Diabetes and a future CVD option together).
type HealthCondition = "Type 2 Diabetes";
const healthConditionOptions: HealthCondition[] = ["Type 2 Diabetes"]

const BASE_CUISINES = ["Mexican", "Chinese", "Soul Food", "Mediterranean"];

function getAllCuisines(): string[] {
  const customCuisines = getCustomMeals()
    .map((m: Meal) => m.cuisine)
    .filter((c: string) => c && !BASE_CUISINES.includes(c));
  return [...BASE_CUISINES, ...Array.from(new Set(customCuisines))];
}

const AISLE_ORDER = [
  "Fresh Produce",
  "Bakery & Bread",
  "Deli",
  "Fresh Meat & Seafood",
  "Dairy & Eggs",
  "Frozen Foods",
  "ALDI Finds",
  "Pantry Essentials",
  "Snacks",
  "Breakfast & Cereals",
  "Beverages",
  "Alcohol",
  "Baby Items",
  "Personal Care",
  "Pet Supplies",
];

// Example implementation:  if Produce (index 0) is compared against Frozen Foods (index 5), you get 0 - 5 = -5
// (negative, so Produce correctly sorts first).
function sortAislesByStoreOrder(aisleNames: string[]): string[] {
  return [...aisleNames].sort((a, b) => { //aisleNames makes copy of the array before sorting
    const indexA = AISLE_ORDER.indexOf(a); //converts aisle name into a number (position in list)
    const indexB = AISLE_ORDER.indexOf(b);
    return indexA - indexB; //produces negative, pos, or 0 result
  });
}

function renderGroceryRow(item: ShoppingListItem): string {
  const isChecked = checkedGroceryItems.has(item.ingredientId);
  const isSettling = settlingGroceryItems.has(item.ingredientId);
  const classes = [
    'grocery-item-row',
    isChecked ? 'is-checked' : '',
    isSettling ? 'is-settling' : ''
  ].filter(Boolean).join(' ');

  return `<div class="${classes}" data-row-id="${item.ingredientId}">
    <input type="checkbox" class="grocery-check" data-id="${item.ingredientId}" ${isChecked ? 'checked' : ''} />
    <span class="grocery-item-name">${item.name}</span>
    <span class="grocery-item-qty">${item.packagesNeeded}×</span>
    <span class="grocery-item-price">$${item.totalCost.toFixed(2)}</span>
  </div>`;
}

type ShoppingFrequency = "weekly" | "biweekly" | "monthly";
const shoppingFrequencyDays: Record<ShoppingFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

type MealPlanInfo = {
  dietType: string;
  healthConditions: string[];
  cuisines: string[];
  familySize: number;
  budget: number;
  shoppingDate: string;
  shoppingFrequency: ShoppingFrequency;
  specialDietMembers: SpecialDietMember[];
  usesSnap: boolean;
};

//saves MealPlanInfo type to Local Storage --> data persists when user exits/returns to app
function saveMealPlanInfo(info: MealPlanInfo){
  localStorage.setItem('mealPlanInfo', JSON.stringify(info)); //setItem stores info under the key mealPlanInfo
}

//loading MealPlanInfo back from Local Storage
function loadMealPlanInfo(): MealPlanInfo | null {
  const raw = localStorage.getItem('mealPlanInfo');
  if (raw == null){
    return null; //failure case #1: nothing was ever saved
  }
    try {
      return JSON.parse(raw) as MealPlanInfo; //SUCCESS case: compile time promise raw is valid JSON text (doesn't do type check)
    } catch {
      return null; //failure case #2: saved data was corrupted/unparseable (not valid JSON)
    }
}

function saveCheckedItems(checkedIds: Set<number>) {
  localStorage.setItem('checkedGroceryItems', JSON.stringify(Array.from(checkedIds)));
}

function loadCheckedItems(): Set<number> {
  const checkedItems = localStorage.getItem('checkedGroceryItems');
  if(checkedItems == null){
    return new Set();
  }
    try {
      return new Set(JSON.parse(checkedItems));
    } catch {
      return new Set();
    }
}

// Same save/load pattern as above, applied to the actual generated plan —
// without this, refreshing the page would lose the plan even though the
// settings that built it are saved, since generatedPlan/etc. are just
// regular variables that reset to null every time the script starts fresh.
function savePlanState(plan: DayPlan[], shoppingList: ShoppingListItem[], totalSpend: number) {
  localStorage.setItem('generatedPlanState', JSON.stringify({ plan, shoppingList, totalSpend }));
}

function loadPlanState(): { plan: DayPlan[]; shoppingList: ShoppingListItem[]; totalSpend: number } | null {
  const raw = localStorage.getItem('generatedPlanState');
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type MealSlotType = 'breakfast' | 'lunch' | 'dinner'
type ActiveSlot = { date: string; mealType: MealSlotType } | null
type DishTarget = { kind: 'main' } | { kind: 'alt'; altIndex: number }

let mealPlanInfo: MealPlanInfo | null = loadMealPlanInfo(); // lets a returning user's saved data flow in immediately on load instead of always starting empty

let generatedPlan: DayPlan[] | null = null;
let generatedShoppingList: ShoppingListItem[] | null = null;
let generatedTotalSpend: number = 0;

let checkedGroceryItems: Set<number> = loadCheckedItems();

// ids currently inside their 850ms "just checked" window — they render
// checked but stay in their aisle until the timer clears them.
let settlingGroceryItems: Set<number> = new Set();
const settleTimers: Record<number, number> = {};
const SETTLE_MS = 850;

const savedPlanState = loadPlanState();
if (savedPlanState) {
  generatedPlan = savedPlanState.plan;
  generatedShoppingList = savedPlanState.shoppingList;
  generatedTotalSpend = savedPlanState.totalSpend;
}

let activeSlot: ActiveSlot = null;       // which calendar cell the popup is currently acting on
let activeDishTarget: DishTarget = { kind: 'main' }; // which dish WITHIN that slot (main, or a specific alt) is being acted on
let popupMode: 'select-dish' | 'split-select' | 'menu' | 'swap' | null = null;
let swapRejectionMessage: string | null = null; // set when a chosen swap doesn't fit the budget
let selectedMeal: Meal | null = null;    // the meal currently shown on the recipe detail page
let selectedMealGroupSize: number | null = null; // how many people that specific dish was portioned/scaled for — main dish vs. one person's own alt dish can differ, so this always travels alongside selectedMeal instead of assuming the whole household's familySize

type Page = "home" | "meal-plan" | "recipe-detail" | "groceries" | "profile" | "add-meal";
const VALID_PAGES: Page[] = ["home", "meal-plan", "recipe-detail", "groceries", "profile", "add-meal"];
const storedPage = localStorage.getItem("currentPage");
const defaultPage: Page = mealPlanInfo ? "home" : "profile";
let currentPage: Page = (storedPage && VALID_PAGES.includes(storedPage as Page)) ? (storedPage as Page) : defaultPage;
let profileViewMode: 'summary' | 'edit' | 'manage-custom' = 'summary';
let recipeDetailReturnPage: Page = "meal-plan"; // where "Back" on recipe-detail should return to

// Returns a NEW day object with just the targeted dish (main, or a specific
// alt dish) updated — used both for direct edits and for building a
// throwaway trial plan before committing a swap.
function withTargetMealSet(day: DayPlan, mealType: MealSlotType, target: DishTarget, meal: Meal | null): DayPlan {
  const slot = day[mealType];
  if (target.kind === 'main') {
    return { ...day, [mealType]: { ...slot, meal } };
  }
  const newAltDishes = slot.altDishes.map((alt, i) => i === target.altIndex ? { ...alt, meal } : alt);
  return { ...day, [mealType]: { ...slot, altDishes: newAltDishes } };
}

function getTargetMeal(date: string, mealType: MealSlotType, target: DishTarget): Meal | null {
  const day = generatedPlan?.find(d => d.date === date);
  if (!day) return null;
  const slot = day[mealType];
  return target.kind === 'main' ? slot.meal : (slot.altDishes[target.altIndex]?.meal ?? null);
}

// How many people the targeted dish (main, or a specific alt dish) is
// actually portioned for — the main dish's group size shrinks whenever
// someone carves out into their own alt dish, and each alt dish is scaled
// for just the people it's for, so this is never simply the whole
// household's familySize.
function getTargetGroupSize(date: string, mealType: MealSlotType, target: DishTarget): number {
  const day = generatedPlan?.find(d => d.date === date);
  const slot = day?.[mealType];
  if (!slot) return mealPlanInfo?.familySize ?? 1;
  return target.kind === 'main' ? slot.mainGroupSize : (slot.altDishes[target.altIndex]?.groupSize ?? 1);
}

function setTargetMeal(date: string, mealType: MealSlotType, target: DishTarget, meal: Meal | null) {
  if (!generatedPlan) return;
  generatedPlan = generatedPlan.map(day => day.date === date ? withTargetMealSet(day, mealType, target, meal) : day);
}

// The diet a dish's swap alternatives should be filtered by — the main
// dish uses the household's overall diet, an alt dish uses that specific
// person's diet instead.
function getTargetDietType(date: string, mealType: MealSlotType, target: DishTarget): string {
  if (target.kind === 'main') return mealPlanInfo!.dietType;
  const day = generatedPlan?.find(d => d.date === date);
  return day?.[mealType]?.altDishes[target.altIndex]?.dietType ?? mealPlanInfo!.dietType;
}

function getTargetLabel(date: string, mealType: MealSlotType, target: DishTarget): string {
  if (target.kind === 'main') return 'Everyone else';
  const day = generatedPlan?.find(d => d.date === date);
  const alt = day?.[mealType]?.altDishes[target.altIndex];
  return alt ? alt.forNames.join(', ') : '';
}

// Special-diet family members who DON'T yet have their own alt dish for this
// slot — meaning they're currently relying on the shared "main" dish to
// cover their diet too.
function getUnsplitSpecialMembers(date: string, mealType: MealSlotType): SpecialDietMember[] {
  if (!mealPlanInfo) return [];
  const day = generatedPlan?.find(d => d.date === date);
  const slot = day?.[mealType];
  if (!slot) return [];
  const splitNames = new Set(slot.altDishes.flatMap(alt => alt.forNames));
  return mealPlanInfo.specialDietMembers.filter(m => !splitNames.has(m.name));
}

// The main/shared dish must satisfy the household's main diet AND every
// special-diet member who ISN'T already split off into their own alt dish —
// otherwise swapping it could silently break compatibility for someone
// still relying on it.
function getImpliedRequiredDiets(date: string, mealType: MealSlotType): string[] {
  if (!mealPlanInfo) return [];
  const unsplit = getUnsplitSpecialMembers(date, mealType);
  return [mealPlanInfo.dietType, ...unsplit.map(m => m.dietType)];
}

// Which health conditions actually apply to a swap target — the household's
// own conditions for the shared main dish, or that specific alt-dish
// person's/group's combined conditions for an individual dish.
function getApplicableHealthConditions(date: string, mealType: MealSlotType, target: DishTarget): string[] {
  if (!mealPlanInfo) return [];
  if (target.kind === 'main') return mealPlanInfo.healthConditions ?? [];

  const day = generatedPlan?.find(d => d.date === date);
  const forNames = day?.[mealType]?.altDishes[target.altIndex]?.forNames ?? [];
  const conditions = new Set<string>();
  for (const member of mealPlanInfo.specialDietMembers) {
    if (forNames.includes(member.name)) {
      for (const condition of member.healthConditions ?? []) conditions.add(condition);
    }
  }
  return [...conditions];
}

// What this same target (the main household, or one alt-dish person/group)
// already ate TODAY across the day's other two meal slots — lets a manual
// swap lean toward the day's health-condition balance the same way the
// automatic generator does. If they're relying on the shared main dish for
// one of those other slots (no alt dish of their own that day), that main
// dish's nutrition counts for them instead.
function getOtherMealsNutritionToday(date: string, mealTypeBeingSwapped: MealSlotType, target: DishTarget): NutritionBreakdown {
  const totals: NutritionBreakdown = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
  const day = generatedPlan?.find(d => d.date === date);
  if (!day) return totals;

  const forNames = target.kind === 'alt' ? (day[mealTypeBeingSwapped]?.altDishes[target.altIndex]?.forNames ?? []) : [];
  const otherMealTypes = (['breakfast', 'lunch', 'dinner'] as MealSlotType[]).filter(mt => mt !== mealTypeBeingSwapped);

  for (const mt of otherMealTypes) {
    const slot = day[mt];
    const dishMeal = target.kind === 'main'
      ? slot.meal
      : (slot.altDishes.find(alt => alt.forNames.some(n => forNames.includes(n)))?.meal ?? slot.meal);
    if (!dishMeal) continue;
    const n = calculateMealNutrition(dishMeal, 1, ingredients);
    totals.calories += n.calories;
    totals.protein += n.protein;
    totals.carbs += n.carbs;
    totals.fat += n.fat;
    totals.fiber += n.fiber;
    totals.sugar += n.sugar;
    totals.sodium += n.sodium;
  }
  return totals;
}

// Builds the small "why is this list ranked this way" note shown above a
// health-condition-aware swap list. Entirely name/count-based — no gender
// involved anywhere — so it reads naturally whether it's the whole
// household, a single-person household, or one or more named people.
function getHealthConditionSwapNote(date: string, mealType: MealSlotType, target: DishTarget, conditions: string[]): string | null {
  if (!mealPlanInfo || conditions.length === 0) return null;
  const conditionText = conditions.join(' and ');

  if (target.kind === 'main') {
    const who = mealPlanInfo.familySize <= 1 ? 'your' : "your household's";
    return `Ranked for ${who} ${conditionText}, based on today's other meals`;
  }

  const day = generatedPlan?.find(d => d.date === date);
  const forNames = day?.[mealType]?.altDishes[target.altIndex]?.forNames ?? [];
  if (forNames.length === 0) return `Ranked for ${conditionText}, based on today's other meals`;

  const namesText = forNames.length === 1
    ? `${forNames[0]}'s`
    : forNames.length === 2
      ? `${forNames[0]} and ${forNames[1]}'s`
      : `${forNames.slice(0, -1).join(', ')}, and ${forNames[forNames.length - 1]}'s`;
  return `Ranked for ${namesText} ${conditionText}, based on today's other meals`;
}

// Pulls a person out of the shared main dish into their own separate alt
// dish (starts empty — the swap screen opens right after so they can pick
// something for real) — usable even when the algorithm didn't think a
// split was necessary, e.g. the family just wants more variety for someone.
function splitOffPerson(date: string, mealType: MealSlotType, member: SpecialDietMember): number {
  if (!generatedPlan) return -1;
  let newAltIndex = -1;
  generatedPlan = generatedPlan.map(day => {
    if (day.date !== date) return day;
    const slot = day[mealType];
    newAltIndex = slot.altDishes.length;
    const newAltDish = { meal: null, forNames: [member.name], dietType: member.dietType, groupSize: 1 };
    return {
      ...day,
      [mealType]: {
        ...slot,
        mainGroupSize: slot.mainGroupSize - 1,
        altDishes: [...slot.altDishes, newAltDish],
      }
    };
  });
  return newAltIndex;
}

// Clears every occurrence of a specific recipe across the WHOLE current
// plan — both the shared main dish and every person's alt dish, regardless
// of which slot the button was clicked from. This is a one-time cleanup of
// THIS generated plan only: it doesn't touch anything used during
// generation, doesn't block the recipe from future plans, and doesn't
// remove it from swap search — someone can always swap it back in
// manually afterward if they actually want it for a specific day.
function removeMealEverywhereInPlan(recipeId: number) {
  if (!generatedPlan) return;
  generatedPlan = generatedPlan.map(day => {
    const clearSlot = (slot: MealSlotResult): MealSlotResult => ({
      ...slot,
      meal: slot.meal?.recipeId === recipeId ? null : slot.meal,
      altDishes: slot.altDishes.map(alt =>
        alt.meal?.recipeId === recipeId ? { ...alt, meal: null } : alt
      ),
    });
    return {
      ...day,
      breakfast: clearSlot(day.breakfast),
      lunch: clearSlot(day.lunch),
      dinner: clearSlot(day.dinner),
    };
  });
}

function renderNutritionDonut(nutrition: NutritionBreakdown): string {
  const proteinCal = nutrition.protein * 4;
  const carbsCal = nutrition.carbs * 4;
  const fatCal = nutrition.fat * 9;
  const totalMacroCal = proteinCal + carbsCal + fatCal;

  const proteinPct = totalMacroCal > 0 ? (proteinCal / totalMacroCal) * 100 : 0;
  const carbsPct = totalMacroCal > 0 ? (carbsCal / totalMacroCal) * 100 : 0;
  const fatPct = totalMacroCal > 0 ? (fatCal / totalMacroCal) * 100 : 0;

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const proteinLength = (proteinPct / 100) * circumference;
  const carbsLength = (carbsPct / 100) * circumference;
  const fatLength = (fatPct / 100) * circumference;

  const proteinOffset = 0;
  const carbsOffset = -proteinLength;
  const fatOffset = -(proteinLength + carbsLength);

  // A small square swatch that reuses the SAME patterned fill as its donut
  // slice (not a flat color) — so someone with color blindness can still
  // tell protein/carbs/fat apart by pattern alone, same as the donut does.
  // This only works because the <pattern> defs below share the page with
  // this swatch's own little <svg> — IDs are global across the document,
  // so url(#donut-protein) here resolves to the same pattern the ring uses.
  const swatch = (patternId: string) =>
    `<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0;"><rect width="14" height="14" rx="3" fill="url(#${patternId})" /></svg>`;

  const nutritionRow = (patternId: string, label: string, grams: number, pct: number) => `
    <div class="nutrition-row">
      ${swatch(patternId)}
      <span class="nutrition-label">${label}</span>
      <span class="nutrition-value">${grams.toFixed(1)}g</span>
      <span class="nutrition-pct">${pct.toFixed(0)}%</span>
    </div>
  `;

  return `
    <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
      <svg width="140" height="140" viewBox="0 0 100 100">
        <defs>
          <pattern id="donut-protein" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="var(--app-donut-protein)" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--app-surface)" stroke-width="1.6" />
          </pattern>
          <pattern id="donut-carbs" patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="var(--app-donut-carbs)" />
            <circle cx="3" cy="3" r="1.1" fill="var(--app-surface)" />
          </pattern>
          <pattern id="donut-fat" patternUnits="userSpaceOnUse" width="5" height="5">
            <rect width="5" height="5" fill="var(--app-donut-fat)" />
            <line x1="0" y1="0" x2="5" y2="5" stroke="var(--app-surface)" stroke-width="1.2" />
            <line x1="5" y1="0" x2="0" y2="5" stroke="var(--app-surface)" stroke-width="1.2" />
          </pattern>
        </defs>
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--app-border)" stroke-width="10" />
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="url(#donut-protein)" stroke-width="10"
            stroke-dasharray="${proteinLength} ${circumference - proteinLength}"
            stroke-dashoffset="${proteinOffset}" />
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="url(#donut-carbs)" stroke-width="10"
            stroke-dasharray="${carbsLength} ${circumference - carbsLength}"
            stroke-dashoffset="${carbsOffset}" />
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="url(#donut-fat)" stroke-width="10"
            stroke-dasharray="${fatLength} ${circumference - fatLength}"
            stroke-dashoffset="${fatOffset}" />
        </g>
        <text x="50" y="47" text-anchor="middle" font-size="16" font-weight="bold" fill="var(--app-text)">${Math.round(nutrition.calories)}</text>
        <text x="50" y="60" text-anchor="middle" font-size="8" fill="var(--app-recipe-muted-2)">kcal</text>
      </svg>
      <div style="flex:1; min-width:160px;">
        ${nutritionRow('donut-protein', 'Protein', nutrition.protein, proteinPct)}
        ${nutritionRow('donut-carbs', 'Carbs', nutrition.carbs, carbsPct)}
        ${nutritionRow('donut-fat', 'Fat', nutrition.fat, fatPct)}
      </div>
    </div>
  `;
}

// Same idea as renderSlotCell, but every dish name is a clickable link
// (tagged with the recipe's id, plus the actual group size it was
// portioned for) instead of plain text — used on Home, where tapping a
// meal should jump straight to its recipe.
function renderClickableSlot(slot: MealSlotResult): string {
  const mainHtml = slot.meal
    ? `<span class="recipe-link" data-recipe-id="${slot.meal.recipeId}" data-group-size="${slot.mainGroupSize}" style="cursor:pointer; text-decoration:underline; color:var(--app-link);">${slot.meal.name}</span>`
    : '—';
  const altHtml = slot.altDishes.map(alt => {
    const dishHtml = alt.meal
      ? `<span class="recipe-link" data-recipe-id="${alt.meal.recipeId}" data-group-size="${alt.groupSize}" style="cursor:pointer; text-decoration:underline; color:var(--app-link);">${alt.meal.name}</span>`
      : '—';
    return `<div style="font-size:0.8em; color:var(--app-text-faint);">+ ${alt.forNames.join(', ')}: ${dishHtml}</div>`;
  }).join('');
  return `${mainHtml}${altHtml}`;
}

// Wires up click handling for every .recipe-link on the current page —
// call this after setting innerHTML anywhere renderClickableSlot is used.
function attachRecipeLinkHandlers() {
  document.querySelectorAll<HTMLElement>('.recipe-link').forEach(link => {
    link.addEventListener('click', () => {
      const recipeId = Number(link.dataset.recipeId);
      const meal = meals.find(m => m.recipeId === recipeId);
      if (meal) {
        selectedMeal = meal;
        selectedMealGroupSize = link.dataset.groupSize ? Number(link.dataset.groupSize) : null;
        recipeDetailReturnPage = "home";
        currentPage = "recipe-detail";
        localStorage.setItem("currentPage", currentPage);
        render();
      }
    });
  });
}

function getMaxBudget(): number {
  if (!mealPlanInfo) return 0;
  // The plan always covers exactly one shopping cycle now, so the budget
  // ceiling is just the per-trip budget itself — no multiplication needed.
  return mealPlanInfo.budget;
}

function recalculateShoppingList() {
  if (!generatedPlan || !mealPlanInfo) return;
  const pantry = buildPantryFromPlan(generatedPlan, ingredients);
  generatedShoppingList = generateShoppingList(pantry, ingredients);
  generatedTotalSpend = getTotalCost(generatedShoppingList);
  savePlanState(generatedPlan, generatedShoppingList, generatedTotalSpend);
}

// Rolls the shopping date forward by exactly one interval and rebuilds a
// fresh plan from the SAME saved settings — no re-entering anything.
// Deliberately placed only on Profile (not Home), and gated behind a
// confirmation, since regenerating can change costs/recipes and shouldn't
// be triggerable by an accidental tap on a casually-visited page.
function generateNextPlan() {
  if (!mealPlanInfo) return;

  const confirmed = window.confirm("This will build a new plan for your next shopping cycle, using your saved settings. Continue?");
  if (!confirmed) return;

  // Capture what the OUTGOING plan used, before it gets replaced, so the
  // new plan can actively avoid repeating it where alternatives exist.
  const previousPlanUsedIds = generatedPlan ? getUsedRecipeIdsByMealType(generatedPlan) : null;

  const intervalDays = shoppingFrequencyDays[mealPlanInfo.shoppingFrequency];
  const nextShoppingDate = new Date(mealPlanInfo.shoppingDate + 'T00:00:00');
  nextShoppingDate.setDate(nextShoppingDate.getDate() + intervalDays);
  const nextShoppingDateStr = nextShoppingDate.toISOString().split('T')[0];

  mealPlanInfo = { ...mealPlanInfo, shoppingDate: nextShoppingDateStr };
  saveMealPlanInfo(mealPlanInfo);
  scheduleShoppingReminder(mealPlanInfo.shoppingDate, intervalDays);

const { plan, pantry, totalSpend } = generateMealPlan(
    meals,
    mealPlanInfo.cuisines,
    mealPlanInfo.dietType,
    mealPlanInfo.familySize,
    mealPlanInfo.shoppingDate,
    intervalDays,
    ingredients,
    mealPlanInfo.budget,
    mealPlanInfo.specialDietMembers,
    mealPlanInfo.healthConditions ?? [],
    previousPlanUsedIds
  );

  generatedPlan = plan;
  generatedShoppingList = generateShoppingList(pantry, ingredients);
  generatedTotalSpend = totalSpend;
  savePlanState(generatedPlan, generatedShoppingList, generatedTotalSpend);

  currentPage = "meal-plan";
  localStorage.setItem("currentPage", currentPage);
  render();
}

function closePopup() {
  // If we're bailing out of picking a meal for a split-off dish that never
  // actually got one (still meal: null), undo the split rather than leaving
  // a dangling empty alt dish — otherwise that person silently vanishes from
  // "give someone a different meal" next time, since the app thinks they're
  // already split off.
  if (activeSlot && activeDishTarget.kind === 'alt' && generatedPlan) {
    const meal = getTargetMeal(activeSlot.date, activeSlot.mealType, activeDishTarget);
    if (meal === null) {
      const { date, mealType } = activeSlot;
      const altIndex = activeDishTarget.altIndex;
      generatedPlan = generatedPlan.map(day => {
        if (day.date !== date) return day;
        const slot = day[mealType];
        const removedGroupSize = slot.altDishes[altIndex]?.groupSize ?? 0;
        return {
          ...day,
          [mealType]: {
            ...slot,
            mainGroupSize: slot.mainGroupSize + removedGroupSize,
            altDishes: slot.altDishes.filter((_, i) => i !== altIndex),
          }
        };
      });
      recalculateShoppingList();
    }
  }

  activeSlot = null;
  popupMode = null;
  swapRejectionMessage = null;
  activeDishTarget = { kind: 'main' };
  document.getElementById('meal-popup-overlay')?.remove();
}

// Jumps straight to viewing/swapping ONE specific dish (main or a
// particular person's alt) — skips the "which dish do you mean" menu
// since the new day-card UI already gives each dish its own tap target.
function openDishMenu(date: string, mealType: MealSlotType, target: DishTarget) {
  activeSlot = { date, mealType };
  activeDishTarget = target;
  swapRejectionMessage = null;
  popupMode = 'menu';
  renderPopup();
}

// Jumps straight to "who should get a different meal" — used by the small
// + button, which only ever shows when there's actually someone left to split off.
function openAddAltDish(date: string, mealType: MealSlotType) {
  activeSlot = { date, mealType };
  swapRejectionMessage = null;
  popupMode = 'split-select';
  renderPopup();
}

function formatWeekRange(startStr: string, endStr: string): string {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  return startMonth === endMonth
    ? `Week of ${startMonth} ${startDay}–${endDay}`
    : `Week of ${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}

function renderPopup() {
  document.getElementById('meal-popup-overlay')?.remove(); //delete old overlay to avoid stacking
  if (!activeSlot || !popupMode || !mealPlanInfo) return;

  const mealTypeLabel = activeSlot.mealType.charAt(0).toUpperCase() + activeSlot.mealType.slice(1);

  const overlay = document.createElement('div');
  overlay.id = 'meal-popup-overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--app-surface); color:var(--app-text); padding:20px; border-radius:8px; min-width:280px; max-width:90%; max-height:80vh; overflow-y:auto;';

  if (popupMode === 'select-dish') {
    const day = generatedPlan?.find(d => d.date === activeSlot!.date);
    const slot = day?.[activeSlot.mealType];
    const canSplitSomeone = getUnsplitSpecialMembers(activeSlot.date, activeSlot.mealType).length > 0;
    box.innerHTML = `
      <h3>Who's eating what — ${mealTypeLabel} on ${activeSlot.date}</h3>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
        <button class="dish-target-option" data-target="main">Everyone else: ${slot?.meal?.name ?? '—'}</button>
        ${(slot?.altDishes ?? []).map((alt, i) =>
          `<button class="dish-target-option" data-target="alt-${i}">${alt.forNames.join(', ')}: ${alt.meal?.name ?? '—'}</button>`
        ).join('')}
        ${canSplitSomeone ? `<button id="popup-split-someone">Give someone a different meal...</button>` : ''}
        <button id="popup-close">Cancel</button>
      </div>
    `;
  } else if (popupMode === 'split-select') {
    const unsplit = getUnsplitSpecialMembers(activeSlot.date, activeSlot.mealType);
    box.innerHTML = `
      <h3>Who should get a different meal?</h3>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
        ${unsplit.map(m => `<button class="split-off-option" data-name="${m.name}" data-diet="${m.dietType}">${m.name} (${m.dietType})</button>`).join('')}
        <button id="popup-close">Cancel</button>
      </div>
    `;
  } else if (popupMode === 'menu') {
    const meal = getTargetMeal(activeSlot.date, activeSlot.mealType, activeDishTarget);
    const targetLabel = getTargetLabel(activeSlot.date, activeSlot.mealType, activeDishTarget);
    box.innerHTML = `
      <h3>${meal?.name ?? 'Empty slot'}</h3>
      <p>${activeSlot.date} — ${mealTypeLabel} (${targetLabel})</p>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
        ${meal ? `<button id="popup-view">View Recipe</button>` : ''}
        <button id="popup-swap">Swap Meal</button>
        ${meal ? `<button id="popup-remove">Clear This Meal</button>` : ''}
        ${meal ? `<button id="popup-remove-all">Remove All Instances From This Plan</button>` : ''}
        <button id="popup-close">Cancel</button>
      </div>
    `;
  } else {
    const meal = getTargetMeal(activeSlot.date, activeSlot.mealType, activeDishTarget);
    const targetLabel = getTargetLabel(activeSlot.date, activeSlot.mealType, activeDishTarget);

    // Swapping the shared "main" dish must keep satisfying EVERY diet still
    // relying on it (the household diet, plus anyone not yet split off) —
    // otherwise a swap could silently break compatibility for someone.
    // Swapping a specific person's alt dish only needs to satisfy THEIR diet.
    const requiredDiets = activeDishTarget.kind === 'main'
      ? getImpliedRequiredDiets(activeSlot.date, activeSlot.mealType)
      : [getTargetDietType(activeSlot.date, activeSlot.mealType, activeDishTarget)];

    // Every diet/cuisine/mealType-eligible recipe is a valid swap candidate,
    // regardless of whether that same recipe already appears elsewhere in
    // today's plan (including as another dish in this very slot) — someone
    // may deliberately want to unify a split back onto one shared dish, and
    // there's no real reason two different slots/people can't eat the same
    // thing on the same day.
    const validAlternatives = meals.filter(m =>
      mealPlanInfo!.cuisines.includes(m.cuisine) &&
      m.mealType.includes(mealTypeLabel) &&
      requiredDiets.every(d => matchesDiet(m, d)) &&
      m.recipeId !== meal?.recipeId
    );

    // If a health condition applies here, lean the LIST toward whichever
    // swaps would keep today's macro balance on track — the same soft nudge
    // the automatic generator uses, just applied to a manual swap. This
    // never hides or blocks an option, it only reorders so better-fitting
    // swaps show up first. fitInfo also carries a relative "how good a fit"
    // percentage plus a couple of plain-language reasons for the top pick(s),
    // so the swap list can show WHY it's ordered this way instead of just
    // silently reordering — that silence is what was confusing when the
    // household's list and one person's list came out in different orders.
    const applicableConditions = getApplicableHealthConditions(activeSlot.date, activeSlot.mealType, activeDishTarget);
    const healthTargets = getCombinedMacroTargets(applicableConditions);
    const fitInfo = new Map<number, { percent: number; reasons: string[] }>();
    let healthConditionNote: string | null = null;
    let orderedAlternatives = validAlternatives;

    if (healthTargets) {
      const alreadyEatenToday = getOtherMealsNutritionToday(activeSlot.date, activeSlot.mealType, activeDishTarget);
      const tracker = {
        calories: alreadyEatenToday.calories,
        carbs: alreadyEatenToday.carbs,
        protein: alreadyEatenToday.protein,
        fat: alreadyEatenToday.fat,
        fiber: alreadyEatenToday.fiber,
        sodium: alreadyEatenToday.sodium,
      };

      const scored = validAlternatives.map(m => ({
        meal: m,
        score: nutritionFitScore(m, calculateMealNutrition(m, 1, ingredients), tracker, healthTargets, 1, ingredients),
      }));

      const scores = scored.map(s => s.score);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const scoreRange = maxScore - minScore || 1; // avoid divide-by-zero when every option scores the same

      for (const s of scored) {
        const percent = Math.round(100 - ((s.score - minScore) / scoreRange) * 100);
        const isBestFit = s.score - minScore < 0.01; // covers ties, not just a single "winner"
        const reasons = isBestFit
          ? nutritionFitReasons(calculateMealNutrition(s.meal, 1, ingredients), tracker, healthTargets, 1)
          : [];
        fitInfo.set(s.meal.recipeId, { percent, reasons });
      }

      orderedAlternatives = scored.sort((a, b) => a.score - b.score).map(s => s.meal);
      healthConditionNote = getHealthConditionSwapNote(activeSlot.date, activeSlot.mealType, activeDishTarget, applicableConditions);
    }

    box.innerHTML = `
      <h3>Swap ${mealTypeLabel} on ${activeSlot.date} (${targetLabel})</h3>
      ${healthConditionNote ? `<p style="font-size:0.8em; color:var(--app-text-faint); margin:-4px 0 8px;">${healthConditionNote}</p>` : ''}
      ${swapRejectionMessage ? `<p style="color:var(--app-danger); font-weight:bold;">${swapRejectionMessage}</p>` : ''}
      ${orderedAlternatives.length === 0 ? '<p>No other matching recipes found for this slot.</p>' : ''}
      <div style="display:flex; flex-direction:column; gap:6px; margin:12px 0;">
        ${orderedAlternatives.map(m => {
          const fit = fitInfo.get(m.recipeId);
          if (!fit) return `<button class="swap-option" data-recipe-id="${m.recipeId}" style="text-align:left;">${m.name}</button>`;
          return `
            <button class="swap-option" data-recipe-id="${m.recipeId}" style="text-align:left; display:flex; flex-direction:column; gap:4px; padding:10px 14px;">
              <span style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <span>${m.name}</span>
                ${fit.reasons.length > 0 ? '<span style="font-size:0.7em; font-weight:bold; white-space:nowrap; opacity:0.85;">Best fit today</span>' : ''}
              </span>
              <span style="display:block; height:4px; background:rgba(255,255,255,0.35); border-radius:4px; overflow:hidden;">
                <span style="display:block; height:100%; width:${fit.percent}%; background:#fff;"></span>
              </span>
              ${fit.reasons.length > 0 ? `<span style="font-size:0.7em; opacity:0.85;">${fit.reasons.slice(0, 2).join(', ')}</span>` : ''}
            </button>
          `;
        }).join('')}
      </div>
      <button id="popup-close">Cancel</button>
    `;
  }

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('popup-close')?.addEventListener('click', closePopup);

  if (popupMode === 'select-dish') {
    document.querySelectorAll('.dish-target-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetStr = (e.currentTarget as HTMLElement).dataset.target!;
        activeDishTarget = targetStr === 'main' ? { kind: 'main' } : { kind: 'alt', altIndex: Number(targetStr.split('-')[1]) };
        popupMode = 'menu';
        renderPopup();
      });
    });
    document.getElementById('popup-split-someone')?.addEventListener('click', () => {
      popupMode = 'split-select';
      renderPopup();
    });
  } else if (popupMode === 'split-select') {

    document.querySelectorAll('.split-off-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget as HTMLElement;
        const name = el.dataset.name!;
        const member = getUnsplitSpecialMembers(activeSlot!.date, activeSlot!.mealType).find(m => m.name === name);
        if (!member) return;
        const newAltIndex = splitOffPerson(activeSlot!.date, activeSlot!.mealType, member);
        recalculateShoppingList();
        if (newAltIndex >= 0) {
          activeDishTarget = { kind: 'alt', altIndex: newAltIndex };
          popupMode = 'swap'; // jump straight to picking their new meal
          swapRejectionMessage = null;
        }
        renderPopup();
      });
    });
  } else if (popupMode === 'menu') {
    document.getElementById('popup-view')?.addEventListener('click', () => {
      const meal = getTargetMeal(activeSlot!.date, activeSlot!.mealType, activeDishTarget);
      if (meal) {
        selectedMeal = meal;
        selectedMealGroupSize = getTargetGroupSize(activeSlot!.date, activeSlot!.mealType, activeDishTarget);
        recipeDetailReturnPage = "meal-plan";
        closePopup();
        currentPage = "recipe-detail";
        localStorage.setItem("currentPage", currentPage);
        render();
      }
    });
    document.getElementById('popup-swap')?.addEventListener('click', () => {
      popupMode = 'swap';
      swapRejectionMessage = null;
      renderPopup();
    });
    document.getElementById('popup-remove')?.addEventListener('click', () => {
      setTargetMeal(activeSlot!.date, activeSlot!.mealType, activeDishTarget, null);
      recalculateShoppingList();
      closePopup();
      render();
    });
    document.getElementById('popup-remove-all')?.addEventListener('click', () => {
      const meal = getTargetMeal(activeSlot!.date, activeSlot!.mealType, activeDishTarget);
      if (!meal) return;
      const confirmed = window.confirm(`Remove "${meal.name}" from every day in this plan? You can still add it back later with Swap.`);
      if (!confirmed) return;
      removeMealEverywhereInPlan(meal.recipeId);
      recalculateShoppingList();
      closePopup();
      render();
    });
  } else {
    document.querySelectorAll('.swap-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const recipeId = Number((e.currentTarget as HTMLElement).dataset.recipeId);
        const candidateMeal = meals.find(m => m.recipeId === recipeId) ?? null;
        if (!candidateMeal || !generatedPlan || !mealPlanInfo) return;

        const trialPlan: DayPlan[] = generatedPlan.map(day =>
          day.date === activeSlot!.date
            ? withTargetMealSet(day, activeSlot!.mealType, activeDishTarget, candidateMeal)
            : day
        );

        const trialPantry = buildPantryFromPlan(trialPlan, ingredients);
        const trialShoppingList = generateShoppingList(trialPantry, ingredients);
        const trialTotal = getTotalCost(trialShoppingList);
        const maxBudget = getMaxBudget();

        if (trialTotal <= maxBudget) {
          generatedPlan = trialPlan;
          generatedShoppingList = trialShoppingList;
          generatedTotalSpend = trialTotal;
          savePlanState(generatedPlan, generatedShoppingList, generatedTotalSpend);
          swapRejectionMessage = null;
          closePopup();
          render();
        } else {
          const overBy = trialTotal - maxBudget;
          swapRejectionMessage = `${candidateMeal.name} would put your plan $${overBy.toFixed(2)} over budget — try a different option.`;
          renderPopup();
        }
      });
    });
  }
}

function renderBottomNav() {
  document.getElementById('bottom-nav')?.remove(); //
  const nav = document.createElement('div'); //creates empty div that doesn't exist on the page yet
  nav.id = 'bottom-nav'; //assigns id to the nav element
  nav.style.cssText = 'position:fixed; bottom:0; left:0; width:100%; display:flex; justify-content:space-around; background:var(--app-nav-bg); border-top:1px solid var(--app-border); box-shadow:0 -2px 6px rgba(0,0,0,0.25); padding:10px 0 calc(4px + env(safe-area-inset-bottom)); z-index:500;';

  const pageIcons: Record<string, string> = {
  'home': `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="24" width="24">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M3.75299 13.944v8.25h6v-6c0 -0.3979 0.15804 -0.7794 0.43931 -1.0607 0.2813 -0.2813 0.6629 -0.4393 1.0607 -0.4393h1.5c0.3978 0 0.7793 0.158 1.0607 0.4393 0.2813 0.2813 0.4393 0.6628 0.4393 1.0607v6h6v-8.25" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M0.752991 12.444 10.942 2.25499c0.1393 -0.13939 0.3047 -0.24997 0.4867 -0.32541 0.1821 -0.07544 0.3772 -0.11427 0.5743 -0.11427 0.1971 0 0.3922 0.03883 0.5742 0.11427 0.1821 0.07544 0.3475 0.18602 0.4868 0.32541L23.253 12.444" stroke-width="1.5"></path>
  </svg>`,
  'meal-plan': `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="24" width="24">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M22.63 14.786 15 22.416l-3.75 0.75 0.75 -3.75 7.63 -7.63c0.3968 -0.3967 0.9349 -0.6195 1.496 -0.6195s1.0992 0.2228 1.496 0.6195l0.008 0.008c0.1967 0.1964 0.3527 0.4296 0.4591 0.6863 0.1065 0.2567 0.1613 0.5318 0.1613 0.8097 0 0.2779 -0.0548 0.5531 -0.1613 0.8098 -0.1064 0.2567 -0.2624 0.4899 -0.4591 0.6862Z" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M9 17.25H2.25c-0.39782 0 -0.77936 -0.158 -1.06066 -0.4393C0.908035 16.5294 0.75 16.1478 0.75 15.75V3.76501c0 -0.39782 0.158035 -0.77935 0.43934 -1.06066 0.2813 -0.2813 0.66284 -0.43934 1.06066 -0.43934h13.5c0.3978 0 0.7794 0.15804 1.0607 0.43934 0.2813 0.28131 0.4393 0.66284 0.4393 1.06066v4.485" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linejoin="round" d="M0.75 6.75h16.5" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.24298 3.75v-3" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M12.743 3.75v-3" stroke-width="1.5"></path>
  </svg>`,
  'groceries': `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="24" width="24">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M4.5 8.625 9 3.375" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.625 15 3.375" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M18.936 20.625H5.064c-0.32478 -0.0059 -0.63806 -0.1213 -0.88907 -0.3275 -0.25101 -0.2062 -0.42505 -0.4911 -0.49393 -0.8085l-2.138 -9c-0.05724 -0.2155 -0.06516 -0.4412 -0.02318 -0.66025 0.04198 -0.21903 0.13279 -0.42578 0.26568 -0.60489 0.13288 -0.1791 0.30443 -0.32595 0.50188 -0.42963 0.19745 -0.10368 0.41573 -0.16152 0.63862 -0.16923h18.148c0.2229 0.00771 0.4412 0.06555 0.6386 0.16923 0.1975 0.10368 0.369 0.25053 0.5019 0.42963 0.1329 0.17911 0.2237 0.38586 0.2657 0.60489 0.042 0.21905 0.034 0.44475 -0.0232 0.66025l-2.138 9c-0.0689 0.3174 -0.2429 0.6023 -0.4939 0.8085 -0.251 0.2062 -0.5643 0.3216 -0.8891 0.3275Z" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M7.5 11.625v6" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M12 11.625v6" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M16.5 11.625v6" stroke-width="1.5"></path>
  </svg>`,
  'profile': `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="24" width="24">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M3.375 7.875c0 1.09402 0.4346 2.1432 1.20818 2.9168C5.35677 11.5654 6.40598 12 7.5 12s2.14323 -0.4346 2.9168 -1.2082c0.7736 -0.7736 1.2082 -1.82278 1.2082 -2.9168 0 -1.09402 -0.4346 -2.14323 -1.2082 -2.91682C9.64323 4.1846 8.59402 3.75 7.5 3.75c-1.09402 0 -2.14323 0.4346 -2.91682 1.20818C3.8096 5.73177 3.375 6.78098 3.375 7.875Z" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M0.75 20.25c0 -1.7902 0.71116 -3.5071 1.97703 -4.773C3.9929 14.2112 5.70979 13.5 7.5 13.5s3.5071 0.7112 4.773 1.977c1.2658 1.2659 1.977 2.9828 1.977 4.773" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M14.3521 10.125c0 0.8951 0.3555 1.7535 0.9885 2.3865 0.6329 0.6329 1.4913 0.9885 2.3864 0.9885 0.8952 0 1.7536 -0.3556 2.3865 -0.9885 0.633 -0.633 0.9885 -1.4914 0.9885 -2.3865 0 -0.89511 -0.3555 -1.75355 -0.9885 -2.38649 -0.6329 -0.63293 -1.4913 -0.98851 -2.3865 -0.98851 -0.8951 0 -1.7535 0.35558 -2.3864 0.98851 -0.633 0.63294 -0.9885 1.49138 -0.9885 2.38649Z" stroke-width="1.5"></path>
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15.813 15.068c0.8351 -0.3078 1.7321 -0.4093 2.6149 -0.2959 0.8827 0.1133 1.725 0.4382 2.4553 0.947 0.7302 0.5088 1.3267 1.1865 1.7388 1.9753 0.412 0.7889 0.6275 1.6656 0.628 2.5556" stroke-width="1.5"></path>
  </svg>`,
};

  const pages: Page[] = ['home', 'meal-plan', 'groceries', 'profile'];

  const buttonsHtml = pages.map(page => {
    const isActive = page === currentPage;
    const color = isActive ? 'var(--app-nav-active)' : 'var(--app-nav-inactive)';
    return `
    <button class="nav-tab" data-page="${page}" style="background:none; border:none; display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; color:${color};">
      ${pageIcons[page]}
      <div style="font-size:0.7em;">${page}</div>
    </button>
  `;
}).join('');
  nav.innerHTML = buttonsHtml;
  document.body.appendChild(nav); //makes nav a child of whatever element method is called on (document.body meaning nav is sibling to app)

  nav.querySelectorAll<HTMLElement>('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = btn.dataset.page as Page; //
      localStorage.setItem("currentPage", currentPage); //saves new page value in local storage with key currentPage
      render();
    })
  })
}

const SERVING_UNITS = ["1/4 tsp","1/2 tsp","3/4 tsp","tsp","tbsp","1/4 cup","1/2 cup","3/4 cup","cup","fl oz","oz","can","spear","slice","tomato","tortilla","olive","slices","egg","mini avocado","g","stick","stalk","pepper","medium onion"] as const;
const RECIPE_AMOUNT_UNITS = ["1/4 tsp","1/2 tsp","3/4 tsp","tsp","tbsp","1/4 cup","1/2 cup","3/4 cup","cup","fl oz","oz","tortilla","can","stalk","unit","bag","egg"] as const;

// Common cooking/baking fractions, checked closest-first. A small tolerance
// (0.03) lets slightly-off decimals from scaling (e.g. 0.49999 from a
// family-size scale factor) still snap to "1/2" instead of showing a
// decimal — but anything that doesn't land near one of these just falls
// back to a plain decimal instead of being forced into a wrong fraction.
const COMMON_FRACTIONS: { value: number; display: string }[] = [
  { value: 1 / 8, display: '⅛' },
  { value: 1 / 4, display: '¼' },
  { value: 1 / 3, display: '⅓' },
  { value: 3 / 8, display: '⅜' },
  { value: 1 / 2, display: '½' },
  { value: 5 / 8, display: '⅝' },
  { value: 2 / 3, display: '⅔' },
  { value: 3 / 4, display: '¾' },
  { value: 7 / 8, display: '⅞' },
];
const FRACTION_TOLERANCE = 0.03;

function formatIngredientAmount(amount: number): string {
  const whole = Math.floor(amount);
  const remainder = amount - whole;

  // Close enough to a clean whole number — no ".00" clutter (also catches
  // floating-point drift from scaling, like 1.9999 → "2").
  if (remainder < FRACTION_TOLERANCE || remainder > 1 - FRACTION_TOLERANCE) {
    const rounded = remainder > 1 - FRACTION_TOLERANCE ? whole + 1 : whole;
    return rounded.toString();
  }

  // Close enough to a common cooking fraction.
  const closestFraction = COMMON_FRACTIONS.find(f => Math.abs(remainder - f.value) < FRACTION_TOLERANCE);
  if (closestFraction) {
    return whole > 0 ? `${whole}${closestFraction.display}` : closestFraction.display;
  }

  // Doesn't land near a clean fraction — fall back to a decimal, trimmed
  // of trailing zeros (so "2.50" still shows as "2.5", not a fake fraction).
  return amount.toFixed(2).replace(/\.?0+$/, '');
}

const MEAL_TYPE_OPTIONS = ["Breakfast", "Lunch", "Dinner"];

type DraftIngredientEntry = {
  ingredientId: number;
  name: string;
  aldiProduct: boolean;
  amountSize: number;
  amountUnit: MealIngredient['amountInfo']['unit'];
};

type AddMealDraft = {
  name: string;
  cuisine: string;
  isNewCuisine: boolean;
  mealTypes: string[];
  dietTypes: string[];
  recipeServings: number;
  steps: string[];
  ingredientEntries: DraftIngredientEntry[];
};

function createEmptyMealDraft(): AddMealDraft {
  return {
    name: '',
    cuisine: '',
    isNewCuisine: false,
    mealTypes: [],
    dietTypes: [],
    recipeServings: 1,
    steps: [''],
    ingredientEntries: [],
  };
}

let addMealDraft: AddMealDraft = createEmptyMealDraft();
let ingredientSearchQuery = '';
let showNewIngredientForm = false;

function searchIngredientCatalog(query: string): Ingredient[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const queryWords = q.split(/\s+/);

  const matches = Object.values(ingredients).filter(ing => {
    const haystack = ing.name.toLowerCase();
    return queryWords.every(word => haystack.includes(word));
  });

  matches.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aStarts = aName.startsWith(q) ? 0 : 1;
    const bStarts = bName.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return aName.length - bName.length;
  });

  return matches.slice(0, 8);
}

function renderNewIngredientForm(): string {
  return `
    <div id="new-ingredient-form" style="border:1px solid var(--app-border); padding:12px; margin:12px 0;">
      <h3>New Ingredient</h3>
      <div class="form-row"><label for="new-ing-name">Name</label><input id="new-ing-name" /></div>
      <div class="form-row"><label for="new-ing-category">Category</label>
        <select id="new-ing-category">
          ${AISLE_ORDER.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label for="new-ing-price">Price per package ($)</label><input id="new-ing-price" type="number" step="0.01" min="0" /></div>
      <div class="form-row"><label for="new-ing-serving-size">Serving Size</label><input id="new-ing-serving-size" type="number" step="0.01" min="0" /></div>
      <div class="form-row"><label for="new-ing-serving-unit">Serving Unit</label>
        <select id="new-ing-serving-unit">${SERVING_UNITS.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
      </div>
      <div class="form-row"><label for="new-ing-servings-per-container">Servings per Package</label><input id="new-ing-servings-per-container" type="number" min="1" /></div>
      <fieldset>
        <legend>Nutrition (per serving)</legend>
        <div class="form-row"><label for="new-ing-calories">Calories</label><input id="new-ing-calories" type="number" /></div>
        <div class="form-row"><label for="new-ing-protein">Protein (g)</label><input id="new-ing-protein" type="number" /></div>
        <div class="form-row"><label for="new-ing-carbs">Carbs (g)</label><input id="new-ing-carbs" type="number" /></div>
        <div class="form-row"><label for="new-ing-fat">Fat (g)</label><input id="new-ing-fat" type="number" /></div>
        <div class="form-row"><label for="new-ing-fiber">Fiber (g)</label><input id="new-ing-fiber" type="number" /></div>
        <div class="form-row"><label for="new-ing-sugar">Sugar (g)</label><input id="new-ing-sugar" type="number" /></div>
        <div class="form-row"><label for="new-ing-sodium">Sodium (mg)</label><input id="new-ing-sodium" type="number" /></div>
      </fieldset>
      <fieldset>
        <legend>Dietary Flags</legend>
        <div><input type="checkbox" id="new-ing-is-meat" /> <label for="new-ing-is-meat">Contains Meat</label></div>
        <div><input type="checkbox" id="new-ing-is-fish" /> <label for="new-ing-is-fish">Contains Fish</label></div>
        <div><input type="checkbox" id="new-ing-is-dairy" /> <label for="new-ing-is-dairy">Contains Dairy</label></div>
        <div><input type="checkbox" id="new-ing-is-egg" /> <label for="new-ing-is-egg">Contains Egg</label></div>
        <div><input type="checkbox" id="new-ing-contains-gluten" /> <label for="new-ing-contains-gluten">Contains Gluten</label></div>
        <div><input type="checkbox" id="new-ing-contains-nuts" /> <label for="new-ing-contains-nuts">Contains Nuts</label></div>
        <div><input type="checkbox" id="new-ing-snap-eligible" /> <label for="new-ing-snap-eligible">SNAP/EBT Eligible</label></div>
      </fieldset>
      <button type="button" id="confirm-new-ingredient">Add Ingredient to Meal</button>
      <button type="button" id="cancel-new-ingredient">Cancel</button>
    </div>
  `;
}

function addIngredientEntryToDraft(ingredientId: number, name: string, aldiProduct: boolean) {
  addMealDraft.ingredientEntries.push({
    ingredientId,
    name,
    aldiProduct,
    amountSize: 1,
    amountUnit: 'unit',
  });
}

function renderIngredientSearchResults() {
  const container = document.getElementById('ingredient-search-results');
  if (!container) return;
  const searchResults = searchIngredientCatalog(ingredientSearchQuery);
  container.innerHTML = `
    ${searchResults.map(ing => `
      <div class="ingredient-search-result" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${ing.name} (${ing.formattedPrice})</span>
        <button type="button" class="pick-search-result" data-id="${ing.ingredientId}">Add</button>
      </div>
    `).join('')}
    ${ingredientSearchQuery.trim() && searchResults.length === 0 ? '<p>No matches found.</p>' : ''}
  `;
  container.querySelectorAll<HTMLElement>('.pick-search-result').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const ing = ingredients[id.toString()];
      if (ing) addIngredientEntryToDraft(id, ing.name, true);
      ingredientSearchQuery = '';
      render();
    });
  });
}

function wireAddMealPage() {
  document.getElementById('cancel-add-meal')?.addEventListener('click', () => {
    currentPage = "profile";
    localStorage.setItem("currentPage", currentPage);
    render();
  });

  document.getElementById('meal-name')?.addEventListener('change', (e) => {
    addMealDraft.name = (e.currentTarget as HTMLInputElement).value;
  });
  document.getElementById('meal-cuisine')?.addEventListener('change', (e) => {
    const value = (e.currentTarget as HTMLSelectElement).value;
    if (value === '__new__') {
      addMealDraft.isNewCuisine = true;
      addMealDraft.cuisine = '';
    } else {
      addMealDraft.isNewCuisine = false;
      addMealDraft.cuisine = value;
    }
    render();
  });
  document.getElementById('meal-cuisine-new')?.addEventListener('change', (e) => {
    addMealDraft.cuisine = (e.currentTarget as HTMLInputElement).value.trim();
  });
  document.getElementById('meal-servings')?.addEventListener('change', (e) => {
    addMealDraft.recipeServings = Number((e.currentTarget as HTMLInputElement).value) || 1;
  });

  document.querySelectorAll<HTMLInputElement>('.meal-type-check').forEach(cb => {
    cb.addEventListener('change', () => {
      addMealDraft.mealTypes = cb.checked
        ? [...addMealDraft.mealTypes, cb.value]
        : addMealDraft.mealTypes.filter(v => v !== cb.value);
    });
  });
  document.querySelectorAll<HTMLInputElement>('.diet-type-check').forEach(cb => {
    cb.addEventListener('change', () => {
      addMealDraft.dietTypes = cb.checked
        ? [...addMealDraft.dietTypes, cb.value]
        : addMealDraft.dietTypes.filter(v => v !== cb.value);
    });
  });

  document.querySelectorAll<HTMLInputElement>('.draft-ingredient-amount-size').forEach(input => {
    input.addEventListener('change', () => {
      const i = Number(input.dataset.index);
      addMealDraft.ingredientEntries[i].amountSize = Number(input.value) || 0;
    });
  });
  document.querySelectorAll<HTMLSelectElement>('.draft-ingredient-amount-unit').forEach(select => {
    select.addEventListener('change', () => {
      const i = Number(select.dataset.index);
      addMealDraft.ingredientEntries[i].amountUnit = select.value as MealIngredient['amountInfo']['unit'];
    });
  });
  document.querySelectorAll<HTMLElement>('.remove-ingredient-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      addMealDraft.ingredientEntries.splice(i, 1);
      render();
    });
  });

  document.getElementById('ingredient-search')?.addEventListener('input', (e) => {
    ingredientSearchQuery = (e.currentTarget as HTMLInputElement).value;
    renderIngredientSearchResults();
  });
  renderIngredientSearchResults();

  document.getElementById('show-new-ingredient-form')?.addEventListener('click', () => {
    showNewIngredientForm = true;
    render();
  });
  document.getElementById('cancel-new-ingredient')?.addEventListener('click', () => {
    showNewIngredientForm = false;
    render();
  });
  document.getElementById('confirm-new-ingredient')?.addEventListener('click', () => {
    const name = (document.getElementById('new-ing-name') as HTMLInputElement).value.trim();
    if (!name) {
      alert('Please enter an ingredient name.');
      return;
    }
    const category = (document.getElementById('new-ing-category') as HTMLSelectElement).value;
    const price = Number((document.getElementById('new-ing-price') as HTMLInputElement).value) || 0;
    const servingSize = Number((document.getElementById('new-ing-serving-size') as HTMLInputElement).value) || null;
    const servingUnit = (document.getElementById('new-ing-serving-unit') as HTMLSelectElement).value as Ingredient['servingUnit'];
    const servingsPerContainer = Number((document.getElementById('new-ing-servings-per-container') as HTMLInputElement).value) || null;

    const newIngredientId = Date.now();
    const newIngredient: Ingredient = {
      ingredientId: newIngredientId,
      name,
      brandName: 'Custom',
      comparisonPriceUnit: servingUnit ?? 'unit',
      usaSnapEligible: (document.getElementById('new-ing-snap-eligible') as HTMLInputElement).checked,
      formattedPrice: `$${price.toFixed(2)}`,
      categoryName: category,
      mainCategoryName: category,
      isMeat: (document.getElementById('new-ing-is-meat') as HTMLInputElement).checked,
      isFish: (document.getElementById('new-ing-is-fish') as HTMLInputElement).checked,
      isDairy: (document.getElementById('new-ing-is-dairy') as HTMLInputElement).checked,
      isEgg: (document.getElementById('new-ing-is-egg') as HTMLInputElement).checked,
      containsGluten: (document.getElementById('new-ing-contains-gluten') as HTMLInputElement).checked,
      containsNuts: (document.getElementById('new-ing-contains-nuts') as HTMLInputElement).checked,
      calories: Number((document.getElementById('new-ing-calories') as HTMLInputElement).value) || 0,
      protein: Number((document.getElementById('new-ing-protein') as HTMLInputElement).value) || 0,
      carbs: Number((document.getElementById('new-ing-carbs') as HTMLInputElement).value) || 0,
      fat: Number((document.getElementById('new-ing-fat') as HTMLInputElement).value) || 0,
      fiber: Number((document.getElementById('new-ing-fiber') as HTMLInputElement).value) || 0,
      sugar: Number((document.getElementById('new-ing-sugar') as HTMLInputElement).value) || 0,
      sodium: Number((document.getElementById('new-ing-sodium') as HTMLInputElement).value) || 0,
      nutritionFlagged: false,
      servingsPerContainer,
      servingSize,
      servingUnit,
      servingDisplay: servingSize ? `${servingSize} ${servingUnit}` : null,
    };

    ingredients[newIngredientId.toString()] = newIngredient;
    saveCustomIngredient(newIngredient);
    addIngredientEntryToDraft(newIngredientId, name, false);

    showNewIngredientForm = false;
    render();
  });

  document.querySelectorAll<HTMLInputElement>('.draft-step-input').forEach(input => {
    input.addEventListener('change', () => {
      const i = Number(input.dataset.index);
      addMealDraft.steps[i] = input.value;
    });
  });
  document.querySelectorAll<HTMLElement>('.remove-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      addMealDraft.steps.splice(i, 1);
      render();
    });
  });
  document.getElementById('add-step')?.addEventListener('click', () => {
    addMealDraft.steps.push('');
    render();
  });

  document.getElementById('submit-add-meal')?.addEventListener('click', () => {
    if (!addMealDraft.name.trim()) { alert('Please enter a meal name.'); return; }
    if (!addMealDraft.cuisine.trim()) { alert('Please choose or enter a cuisine.'); return; }
    if (addMealDraft.mealTypes.length === 0) { alert('Please select at least one meal type.'); return; }
    if (addMealDraft.ingredientEntries.length === 0) { alert('Please add at least one ingredient.'); return; }
    const cleanSteps = addMealDraft.steps.map(s => s.trim()).filter(s => s !== '');
    if (cleanSteps.length === 0) { alert('Please add at least one step.'); return; }

    const mealIngredients: MealIngredient[] = addMealDraft.ingredientEntries.map(entry => ({
      name: entry.name,
      aldiProduct: entry.aldiProduct,
      ingredientId: entry.ingredientId,
      amountInfo: { size: entry.amountSize, unit: entry.amountUnit },
    }));

    const newMeal: Meal = {
      recipeId: Date.now(),
      name: addMealDraft.name.trim(),
      recipeServings: addMealDraft.recipeServings,
      culturalName: null,
      cuisine: addMealDraft.cuisine,
      region: '',
      mealType: addMealDraft.mealTypes,
      complexity: '',
      prepTimeMinutes: 0,
      dietType: addMealDraft.dietTypes,
      nutritionHighlights: [],
      estimatedNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
      hasNonAldiIngredients: addMealDraft.ingredientEntries.some(e => !e.aldiProduct),
      culturalContext: null,
      ingredients: mealIngredients,
      steps: cleanSteps,
      mealPrep: false,
    };

    meals.push(newMeal);
    saveCustomMeal(newMeal);

    alert('Meal added! It will be included next time you generate a meal plan.');
    currentPage = "profile";
    localStorage.setItem("currentPage", currentPage);
    render();
  });
}

function render() {
switch (currentPage) {
  case "home": {
    if (!mealPlanInfo || !generatedPlan || !generatedShoppingList) {
      appElement.innerHTML = `
        <h1>Welcome!</h1>
        <p>Let's get your household set up so we can build your first meal plan.</p>
        <button id="go-to-profile">Set Up Profile</button>
      `;
      document.getElementById('go-to-profile')?.addEventListener('click', () => {
        currentPage = "profile";
        localStorage.setItem("currentPage", currentPage);
        render();
      });
      break;
    }

    const todayStr = getLocalDateString();
    const today = generatedPlan.find(d => d.date === todayStr);

    let todaySectionHtml: string;
    if (today) {
      todaySectionHtml = `
        <h2>Today's Meals</h2>
        <ul>
          <li><strong>Breakfast:</strong> ${renderClickableSlot(today.breakfast)}</li>
          <li><strong>Lunch:</strong> ${renderClickableSlot(today.lunch)}</li>
          <li><strong>Dinner:</strong> ${renderClickableSlot(today.dinner)}</li>
        </ul>
      `;
    } else if (todayStr < generatedPlan[0].date) {
      todaySectionHtml = `<p>Your current plan starts ${generatedPlan[0].date}.</p>`;
    } else {
      todaySectionHtml = `<p>Your current plan has ended — head to Profile to generate your next one when you're ready.</p>`;
    }

    appElement.innerHTML = `
      <h1>Home</h1>
      ${todaySectionHtml}

      <button id="go-to-meal-plan">View Full Meal Plan</button>
    `;

    attachRecipeLinkHandlers();

    document.getElementById('go-to-meal-plan')?.addEventListener('click', () => {
      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    });
    break;
  }

  case "profile": {
    const todayStr = getLocalDateString();
  if(!mealPlanInfo || profileViewMode === 'edit'){
    appElement.innerHTML = `

      ${mealPlanInfo ? '<button type="button" id="cancel-edit-settings">Cancel</button>' : ''}
      <h1>Affordable Meal Planner</h1>
      <form id="info-form">

        <fieldset>
          <legend>Diet Type</legend>
        ${dietTypes.map(type => `
            <div>
            <input type="radio" id="${type}" name="dietType" value="${type}" />
            <label for="${type}">${type}</label>
            </div>
          `).join("")}
        </fieldset>
        <fieldset>
          <legend>Health Condition</legend>
          <p style="font-size:0.85em; color:var(--app-text-faint); margin:0 0 8px;">Optional. Meals will lean toward nutrition guidance for these conditions, balanced across the whole day rather than requiring every single meal to match. Check any that apply.</p>
        ${healthConditionOptions.map(condition => `
            <div>
            <input type="checkbox" id="health-${condition}" name="healthCondition" value="${condition}" />
            <label for="health-${condition}">${condition}</label>
            </div>
          `).join("")}
        </fieldset>
        <fieldset>
          <legend>Cuisines</legend>
           ${getAllCuisines().map(type => `
            <div>
            <input type="checkbox" id="${type}" name="cuisine" value="${type}" />
            <label for="${type}">${type}</label>
            </div>
          `).join("")}
        </fieldset>

        <div class="form-row">
        <span class="label-with-info">
          <label for="familySize">Family Size</label>
          <button type="button" class="info-icon" data-tooltip="Counts everyone, including different-diet members.">i</button>
        </span>
        <input id="familySize" name="familySize" type="number" required />
        </div>

        <div class="form-row">
        <label for="budget">Grocery Budget per Shopping Trip</label>
        <span class='currency-field'>
        <input type="number" id="budget" name="budget" step="0.01" min="0.00"/>
        </span>
        </div>

        <div class="form-row">
        <label for="usesSnap">I use SNAP/EBT benefits</label>
        <input type="checkbox" id="usesSnap" name="usesSnap" />
        </div>

        <div class="form-row">
        <label for="shoppingFrequency">How often do you grocery shop?</label>
        <select name="shoppingFrequency" id="shoppingFrequency">
          <option value="">Please select an option</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly (every 2 weeks)</option>
          <option value="monthly">Monthly</option>
        </select>
        </div>

        <div class="form-row">
        <label for="shoppingDate">What day will you grocery shop?</label>
        <input type="date" id="shoppingDate" name="shoppingDate" value="${todayStr}" min="${todayStr}" required />
        </div>
        <p style="font-size:0.85em; color:var(--app-text-faint);">Pick any upcoming date that falls on your regular shopping day — this sets the pattern going forward (e.g. if you shop weekly, every future trip lands on this same day of the week; biweekly, every 2 weeks on this day; monthly, this same date each month). Your meal plan starts the day after each trip.</p>

        <div>
          <p><strong>Does anyone in your family eat differently?</strong></p>
          <div id="special-diet-members"></div>
          <button type="button" id="add-special-diet-member">+ Add a family member with a different diet</button>
        </div>

        <input type="submit" value="Submit Form" />
      </form>`;

    let specialDietMemberCount = 0;

function addSpecialDietMemberRow() {
      const container = document.getElementById('special-diet-members');
      if (!container) return;
      const rowId = specialDietMemberCount++;
      const rowHtml = `
        <div class="form-row special-diet-row" data-row-id="${rowId}">
          <input type="text" placeholder="Name" class="special-diet-name" required />
          <select class="special-diet-type" required>
            <option value="">Diet</option>
            ${dietTypes.map(type => `<option value="${type}">${type}</option>`).join('')}
          </select>
          <button type="button" class="remove-special-diet-row">Remove</button>
          <div class="special-diet-health-conditions">
            ${healthConditionOptions.map(condition => `
              <label><input type="checkbox" class="special-diet-health-condition" value="${condition}" /> ${condition}</label>
            `).join('')}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', rowHtml);
      const newRow = container.querySelector(`[data-row-id="${rowId}"]`);
      newRow?.querySelector('.remove-special-diet-row')?.addEventListener('click', () => {
        newRow.remove();
      });
    }

    document.getElementById('add-special-diet-member')?.addEventListener('click', addSpecialDietMemberRow);
    document.getElementById('cancel-edit-settings')?.addEventListener('click', () => {
      profileViewMode = 'summary';
      render();
    });
    const infoForm = document.getElementById('info-form') as HTMLFormElement | null;
    if (!infoForm) { throw new Error("bad"); }

    infoForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(infoForm);

    const specialDietMembers: SpecialDietMember[] = [];
      document.querySelectorAll('.special-diet-row').forEach(row => {
        const name = (row.querySelector('.special-diet-name') as HTMLInputElement)?.value.trim();
        const dietType = (row.querySelector('.special-diet-type') as HTMLSelectElement)?.value;
        const healthConditions = Array.from(row.querySelectorAll('.special-diet-health-condition'))
          .filter((cb): cb is HTMLInputElement => (cb as HTMLInputElement).checked)
          .map(cb => cb.value);
        if (name && dietType) {
          specialDietMembers.push({ name, dietType, healthConditions });
        }
      });

      const enteredFamilySize = Number(formData.get('familySize'));
      if (specialDietMembers.length >= enteredFamilySize) {
        alert('At least one family member must be on the main diet.');
        return;
      }

      mealPlanInfo = {
        dietType: formData.get('dietType') as string,
        healthConditions: formData.getAll('healthCondition') as string[],
        cuisines: formData.getAll('cuisine') as string[],
        familySize: Number(formData.get('familySize')),
        budget: Number(formData.get('budget')),
        shoppingDate: formData.get('shoppingDate') as string,
        shoppingFrequency: formData.get('shoppingFrequency') as ShoppingFrequency,
        specialDietMembers,
        usesSnap: formData.get('usesSnap') === 'on',
      };
      profileViewMode = 'summary';
      saveMealPlanInfo(mealPlanInfo);
      scheduleShoppingReminder(mealPlanInfo.shoppingDate, shoppingFrequencyDays[mealPlanInfo.shoppingFrequency]);


      const { plan, pantry, totalSpend } = generateMealPlan(
        meals,
        mealPlanInfo.cuisines,
        mealPlanInfo.dietType,
        mealPlanInfo.familySize,
        mealPlanInfo.shoppingDate,
        shoppingFrequencyDays[mealPlanInfo.shoppingFrequency],
        ingredients,
        mealPlanInfo.budget,
        mealPlanInfo.specialDietMembers,
        mealPlanInfo.healthConditions ?? []
      );

      generatedPlan = plan;
      generatedShoppingList = generateShoppingList(pantry, ingredients);
      generatedTotalSpend = totalSpend;
      savePlanState(generatedPlan, generatedShoppingList, generatedTotalSpend);

      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    })
  } else if (profileViewMode === 'manage-custom') {
    const customMeals: Meal[] = getCustomMeals();
    const customIngredients: Ingredient[] = getCustomIngredients();
    appElement.innerHTML = `
      <button id="back-to-profile-summary" style="margin-bottom:16px;">Cancel</button>
      <h1>Manage Custom Meals</h1>

      <h2>Your Custom Meals</h2>
      ${customMeals.length === 0 ? "<p>You haven't added any custom meals yet.</p>" : ''}
      <ul>
        ${customMeals.map((m: Meal) => `
          <li>${m.name} <button class="delete-custom-meal" data-id="${m.recipeId}">Delete</button></li>
        `).join('')}
      </ul>

      <h2>Your Custom Ingredients</h2>
      ${customIngredients.length === 0 ? "<p>You haven't added any custom ingredients yet.</p>" : ''}
      <ul>
        ${customIngredients.map((i: Ingredient) => `
          <li>${i.name} <button class="delete-custom-ingredient" data-id="${i.ingredientId}">Delete</button></li>
        `).join('')}
      </ul>
    `;

    document.querySelectorAll<HTMLElement>('.delete-custom-meal').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (confirm('Delete this custom meal? This cannot be undone.')) {
          deleteCustomMeal(id);
          render();
        }
      });
    });

    document.querySelectorAll<HTMLElement>('.delete-custom-ingredient').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const inUse = getCustomMeals().some((m: Meal) => m.ingredients.some(ing => ing.ingredientId === id));
        if (inUse) {
          alert('This ingredient is used in one of your custom meals — remove that meal first.');
          return;
        }
        if (confirm('Delete this custom ingredient? This cannot be undone.')) {
          deleteCustomIngredient(id);
          render();
        }
      });
    });

    document.getElementById('back-to-profile-summary')?.addEventListener('click', () => {
      profileViewMode = 'summary';
      render();
    });
  } else {
    const info = mealPlanInfo;
    appElement.innerHTML = `
      <h1>Profile</h1>
      <p><strong>Diet:</strong> ${info.dietType}</p>
      ${info.healthConditions && info.healthConditions.length > 0 ? `<p><strong>Health Conditions:</strong> ${info.healthConditions.join(', ')}</p>` : ''}
      <p><strong>Cuisines:</strong> ${info.cuisines.join(', ')}</p>
      <p><strong>Family Size:</strong> ${info.familySize}</p>
      <p><strong>Budget per Trip:</strong> $${info.budget}</p>
      <p><strong>Shopping Frequency:</strong> ${info.shoppingFrequency}</p>
      <p><strong>Shopping Day:</strong> ${info.shoppingDate}</p>
      <p><strong>SNAP/EBT:</strong> ${info.usesSnap ? 'Yes' : 'No'}</p>
      ${info.specialDietMembers.length > 0 ? `<p><strong>Family members with different diets:</strong> ${info.specialDietMembers.map(m => `${m.name} (${m.dietType}${m.healthConditions?.length ? ', ' + m.healthConditions.join(', ') : ''})`).join(', ')}</p>` : ''}

      <div style="display:flex; flex-direction:column; gap:12px; margin-top:20px;">
        <button id="edit-settings" style="width:100%; display:block;">Edit Settings</button>
        <button id="add-own-meal" style="width:100%; display:block;">Add Your Own Meal</button>
        <button id="manage-custom" style="width:100%; display:block;">Manage Custom Meals</button>
        <button id="generate-next-plan" style="width:100%; display:block;">Generate Next Plan (using current settings)</button>
      </div>
    `;

    document.getElementById('edit-settings')?.addEventListener('click', () => {
      profileViewMode = 'edit';
      render();
    });
      document.getElementById('add-own-meal')?.addEventListener('click', () => {
      addMealDraft = createEmptyMealDraft();
      ingredientSearchQuery = '';
      showNewIngredientForm = false;
      currentPage = "add-meal";
      localStorage.setItem("currentPage", currentPage);
      render();
    });
      document.getElementById('generate-next-plan')?.addEventListener('click', generateNextPlan);
      document.getElementById('manage-custom')?.addEventListener('click', () => {
        profileViewMode = 'manage-custom';
        render();
    });
  }
  break;
}

  case "meal-plan": {
    if (!generatedPlan || !generatedShoppingList || !mealPlanInfo) {
      appElement.innerHTML = `
        <h1>No meal plan yet</h1>
        <p>Please set up your profile first.</p>
        <button id="back-to-form">Go to Profile</button>
      `;
      document.getElementById('back-to-form')?.addEventListener('click', () => {
        currentPage = "profile";
        localStorage.setItem("currentPage", currentPage);
        render();
      });
      break;
    }

    const maxBudget = getMaxBudget();
    const spentSoFar = getTotalCost(generatedShoppingList);
    const budgetPct = Math.min(100, (spentSoFar / maxBudget) * 100);

    // Break the calendar into 7-day chunks purely for readability — this is
    // unrelated to shopping frequency (even a monthly shopper's full plan
    // shows here broken into weeks), and every single day still renders,
    // nothing is hidden or paginated away.
    const weekChunks: DayPlan[][] = [];
    for (let i = 0; i < generatedPlan.length; i += 7) {
      weekChunks.push(generatedPlan.slice(i, i + 7));
    }

    appElement.innerHTML = `
      <div class="meal-plan-page">
      <h1>Your Meal Plan</h1>
       <div class="budget-bar-wrapper">
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width: ${budgetPct}%"></div>
          <div class="budget-bar-bubble" style="left: ${budgetPct}%">$${spentSoFar.toFixed(2)}</div>
        </div>
        <span class="budget-bar-total">$${maxBudget.toFixed(2)}</span>
      </div>
      ${weekChunks.map((chunk, i) => `
        <details class="week-accordion" ${i === 0 ? 'open' : ''}>
          <summary>${formatWeekRange(chunk[0].date, chunk[chunk.length - 1].date)}</summary>

             <div class="day-card-list">
            ${chunk.map(day => {
              const dateObj = new Date(day.date + 'T00:00:00');
              const dayNum = String(dateObj.getDate()).padStart(2, '0');
              const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
              const mealTypes: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];
              return `
                <div class="day-row">
                  <div class="day-badge">
                    <span class="day-badge-num">${dayNum}</span>
                    <span class="day-badge-weekday">${weekday}</span>
                  </div>
                  <div class="day-card">
                    ${mealTypes.map(mealType => {
                      const slot = day[mealType];
                      const canAddAlt = getUnsplitSpecialMembers(day.date, mealType).length > 0;
                      return `
                        <div class="meal-section">
                          <div class="meal-section-header">
                            <p class="meal-section-label">${mealType.charAt(0).toUpperCase() + mealType.slice(1)}</p>
                            ${canAddAlt ? `<button type="button" class="add-alt-dish" data-date="${day.date}" data-mealtype="${mealType}" aria-label="Add alternate meal">+</button>` : ''}
                          </div>
                          <p class="meal-main-name" data-date="${day.date}" data-mealtype="${mealType}">${slot.meal?.name ?? '—'}</p>
                          ${slot.altDishes.length > 0 ? `
                            <div class="alt-dish-chips">
                              ${slot.altDishes.map((alt, i) => `
                                <button type="button" class="alt-dish-chip" data-date="${day.date}" data-mealtype="${mealType}" data-altindex="${i}">${alt.forNames.join(', ')}: ${alt.meal?.name ?? '—'}</button>
                              `).join('')}
                            </div>
                          ` : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <button type="button" class="collapse-week-btn">▲ Collapse</button>
        </details>
      `).join('')}

      </div>
    `;



    document.querySelectorAll<HTMLElement>('.meal-main-name').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date!;
        const mealType = el.dataset.mealtype as MealSlotType;
        openDishMenu(date, mealType, { kind: 'main' });
      });
    });

    document.querySelectorAll<HTMLElement>('.alt-dish-chip').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date!;
        const mealType = el.dataset.mealtype as MealSlotType;
        const altIndex = Number(el.dataset.altindex);
        openDishMenu(date, mealType, { kind: 'alt', altIndex });
      });
    });

    document.querySelectorAll<HTMLElement>('.collapse-week-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const details = btn.closest('details');
        if (details) details.removeAttribute('open');
        window.scrollTo(0, 0);
      });
    });

    document.querySelectorAll<HTMLElement>('.add-alt-dish').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date!;
        const mealType = el.dataset.mealtype as MealSlotType;
        openAddAltDish(date, mealType);
      });
    });
    break;
  }

  case "recipe-detail": {
    if (!selectedMeal || !mealPlanInfo) {
      appElement.innerHTML = `<h1>No recipe selected</h1><button id="back-to-plan">Back to plan</button>`;
      document.getElementById('back-to-plan')?.addEventListener('click', () => {
        currentPage = recipeDetailReturnPage;
        localStorage.setItem("currentPage", currentPage);
        render();
      });
      break;
    }

    const meal = selectedMeal;
    const originalServings = meal.recipeServings ?? 1;
    // The group size this specific dish was actually portioned for — the
    // shared main dish and an individual's own split-off alt dish can have
    // very different group sizes, so this always prefers the value carried
    // alongside selectedMeal over blindly assuming the whole household.
    const groupSize = selectedMealGroupSize ?? mealPlanInfo.familySize;
    const scaleFactor = groupSize / originalServings;
    const perPersonNutrition = calculateMealNutrition(meal, 1, ingredients);

    // Per-serving cost for THIS dish at its actual portioned size — reuses
    // the same marginal-cost math the generator/shopping list already rely
    // on (estimateMealCost), just scaled down to a single-serving price
    // instead of a whole-dish or whole-trip total.
    const dishCost = estimateMealCost(meal, groupSize, ingredients);
    const perServingCost = groupSize > 0 ? dishCost / groupSize : 0;
    const prepTimeDisplay = meal.prepTimeMinutes ? `${meal.prepTimeMinutes} min` : '—';

    appElement.innerHTML = `
      <div class="recipe-page">
      <button id="back-to-plan" class="recipe-back-btn">← Back to plan</button>
      <h1>${meal.name}</h1>
      ${meal.culturalName ? `<p class="recipe-cultural-name">${meal.culturalName}</p>` : ''}

      <div class="recipe-stats-row">
        <div class="recipe-stat">
          <p class="recipe-stat-label">Serves</p>
          <p class="recipe-stat-value">${groupSize}</p>
        </div>
        <div class="recipe-stat">
          <p class="recipe-stat-label">Prep Time</p>
          <p class="recipe-stat-value">${prepTimeDisplay}</p>
        </div>
        <div class="recipe-stat">
          <p class="recipe-stat-label">Per Serving</p>
          <p class="recipe-stat-value">$${perServingCost.toFixed(2)}</p>
        </div>
      </div>

      <div class="recipe-section">
        <h2>Nutrition (per person)</h2>
        ${renderNutritionDonut(perPersonNutrition)}
      </div>

      <div class="recipe-section">
        <h2>Ingredients</h2>
        <div class="recipe-ingredient-list">
          ${meal.ingredients.map(ing => {
            const scaledSize = ing.amountInfo.size * scaleFactor;
            return `
              <div class="recipe-ingredient-row">
                <span class="recipe-ingredient-qty">${formatIngredientAmount(scaledSize)} ${ing.amountInfo.unit}</span>
                <span class="recipe-ingredient-name">${ing.name}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <h2>Steps</h2>
      <div class="recipe-steps">
        ${meal.steps.map((step, i) => `
          <div class="recipe-step-row">
            <span class="recipe-step-num">${i + 1}</span>
            <span class="recipe-step-text">${step}</span>
          </div>
        `).join('')}
      </div>

      ${meal.culturalContext ? `
        <div class="recipe-about-dish">
          <h2>About This Dish</h2>
          <p class="recipe-about-origin">Origin: ${meal.culturalContext.origin}</p>
          <p class="recipe-about-context">${meal.culturalContext.context}</p>
        </div>
      ` : ''}
      </div>
    `;

    document.getElementById('back-to-plan')?.addEventListener('click', () => {
      currentPage = recipeDetailReturnPage;
      localStorage.setItem("currentPage", currentPage);
      render();
    });
    break;
  }

  case "add-meal": {
    const draft = addMealDraft;
    const searchResults = searchIngredientCatalog(ingredientSearchQuery);

    appElement.innerHTML = `
      <button id="cancel-add-meal" style="margin-bottom:16px;">Cancel</button>
      <h1>Add Your Own Meal</h1>

      <div class="form-row"><label for="meal-name">Meal Name</label><input id="meal-name" value="${draft.name}" /></div>

      <div class="form-row"><label for="meal-cuisine">Cuisine</label>
        <select id="meal-cuisine">
          <option value="">Select...</option>
          ${getAllCuisines().map(c => `<option value="${c}" ${draft.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}
          <option value="__new__" ${draft.isNewCuisine ? 'selected' : ''}>Other (type your own)...</option>
        </select>
        ${draft.isNewCuisine ? `<input type="text" id="meal-cuisine-new" placeholder="Enter cuisine name" value="${draft.cuisine}" style="margin-top:6px;" />` : ''}
      </div>

      <fieldset>
        <legend>Meal Type</legend>
        ${MEAL_TYPE_OPTIONS.map(mt => `
          <div><input type="checkbox" class="meal-type-check" id="mt-${mt}" value="${mt}" ${draft.mealTypes.includes(mt) ? 'checked' : ''}/> <label for="mt-${mt}">${mt}</label></div>
        `).join('')}
      </fieldset>

      <fieldset>
        <legend>Diet Type(s) this meal fits</legend>
        ${dietTypes.map(dt => `
          <div><input type="checkbox" class="diet-type-check" id="dt-${dt}" value="${dt}" ${draft.dietTypes.includes(dt) ? 'checked' : ''}/> <label for="dt-${dt}">${dt}</label></div>
        `).join('')}
      </fieldset>

      <div class="form-row"><label for="meal-servings">Servings</label><input id="meal-servings" type="number" min="1" value="${draft.recipeServings}" /></div>

      <h2>Ingredients</h2>
      <div id="draft-ingredient-list">
        ${draft.ingredientEntries.map((entry, i) => `
          <div class="draft-ingredient-row" style="display:flex; align-items:center; gap:8px;">
            <input type="number" step="0.01" class="draft-ingredient-amount-size" data-index="${i}" value="${entry.amountSize}" style="width:70px;" />
            <select class="draft-ingredient-amount-unit" data-index="${i}">
              ${RECIPE_AMOUNT_UNITS.map(u => `<option value="${u}" ${entry.amountUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
            <span>${entry.name}${entry.aldiProduct ? '' : ' (custom)'}</span>
            <button type="button" class="remove-ingredient-entry" data-index="${i}">Remove</button>
          </div>
        `).join('')}
      </div>

      <div class="form-row"><label for="ingredient-search">Search Aldi ingredients</label>
        <input id="ingredient-search" value="${ingredientSearchQuery}" placeholder="e.g. chicken breast" />
      </div>
      <div id="ingredient-search-results">
        ${searchResults.map(ing => `
          <div class="ingredient-search-result" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${ing.name} (${ing.formattedPrice})</span>
            <button type="button" class="pick-search-result" data-id="${ing.ingredientId}">Add</button>
          </div>
        `).join('')}
        ${ingredientSearchQuery.trim() && searchResults.length === 0 ? '<p>No matches found.</p>' : ''}
      </div>
      <button type="button" id="show-new-ingredient-form">Can't find it? Add a new ingredient</button>

      ${showNewIngredientForm ? renderNewIngredientForm() : ''}

      <h2>Steps</h2>
      <div id="draft-steps-list">
        ${draft.steps.map((step, i) => `
          <div class="draft-step-row" style="display:flex; gap:8px;">
            <input type="text" class="draft-step-input" data-index="${i}" value="${step}" placeholder="Step ${i + 1}" style="flex:1;" />
            <button type="button" class="remove-step" data-index="${i}">Remove</button>
          </div>
        `).join('')}
      </div>
      <button type="button" id="add-step">+ Add Step</button>

      <div style="margin-top:20px;">
        <button type="button" id="submit-add-meal" style="width:100%;">Save Meal</button>
      </div>
    `;

    wireAddMealPage();
    break;
  }

  case "groceries": {
    if (!generatedPlan || !generatedShoppingList || !mealPlanInfo) {


      appElement.innerHTML = `
      <h1>No shopping list yet</h1>
      <p>Please set up your profile first.</p>
      <button id="go-to-profile">Go to Profile</button>
    `;
    document.getElementById('go-to-profile')?.addEventListener('click', () => {
      currentPage = "profile";
      localStorage.setItem("currentPage", currentPage);
      render();
    });
      break;
    }

    const itemsByAisle: Record<string, ShoppingListItem[]> = {};

    for (const item of generatedShoppingList) {
      const aisle = ingredients[item.ingredientId.toString()].mainCategoryName;
      if (!itemsByAisle[aisle]) {
        itemsByAisle[aisle] = [];
      }
        itemsByAisle[aisle].push(item);
    }

    let snapEligibleTotal = 0;
    let notEligibleTotal = 0;
    for (const item of generatedShoppingList) {
      const isEligible = ingredients[item.ingredientId.toString()].usaSnapEligible;
      if (isEligible) {
        snapEligibleTotal += item.totalCost;
      } else {
        notEligibleTotal += item.totalCost;
      }
    }

  const itemsInCart = generatedShoppingList.filter(
      item => checkedGroceryItems.has(item.ingredientId)
              && !settlingGroceryItems.has(item.ingredientId)
    );
    const cartTotal = itemsInCart.reduce((sum, i) => sum + i.totalCost, 0);
    const itemsLeft = generatedShoppingList.length - itemsInCart.length;
    const budgetPct = generatedTotalSpend > 0
      ? Math.min(100, (cartTotal / generatedTotalSpend) * 100)
      : 0;

    appElement.innerHTML = `
      <div class="shopping-page">

        <div class="shopping-head">
          <div class="shopping-head-top">
            <div>
              <h1>Shopping list</h1>
              <div class="shopping-head-meta">
                Aldi · ${mealPlanInfo.shoppingDate} · ${itemsLeft} item${itemsLeft === 1 ? '' : 's'} left
              </div>
            </div>
            <div class="shopping-head-total">
              <strong>$${cartTotal.toFixed(2)}</strong>
              <span>in cart</span>
            </div>
          </div>
          <div class="shopping-bar">
            <div class="shopping-bar-fill" style="width: ${budgetPct}%"></div>
            </div>
        </div>

        ${sortAislesByStoreOrder(Object.keys(itemsByAisle)).map(aisle => {
          // an item leaves its aisle only once its settle timer has fired
          const stillHere = itemsByAisle[aisle].filter(
            item => !checkedGroceryItems.has(item.ingredientId)
                    || settlingGroceryItems.has(item.ingredientId)
          );
          if (stillHere.length === 0) return '';
          const aisleSubtotal = itemsByAisle[aisle].reduce((sum, i) => sum + i.totalCost, 0);
          return `
          <div class="aisle-header">
            <span>${aisle}</span>
            <span class="aisle-meta">${itemsByAisle[aisle].length} · $${aisleSubtotal.toFixed(2)}</span>
          </div>
          <div class="groceries-list">
            ${stillHere.map(item => renderGroceryRow(item)).join('')}
          </div>`;
        }).join('')}

        ${itemsInCart.length > 0 ? `
        <div class="cart-group">
          <div class="aisle-header">
            <span>In the cart</span>
            <span class="aisle-meta">${itemsInCart.length} items · $${cartTotal.toFixed(2)}</span>
          </div>
          <div class="groceries-list">
            ${itemsInCart.map(item => renderGroceryRow(item)).join('')}
          </div>
        </div>` : ''}

        <div class="shopping-total">
          <span>Trip total</span>
          <strong>$${getTotalCost(generatedShoppingList).toFixed(2)}</strong>
        </div>

        ${mealPlanInfo.usesSnap ? `
        <p class="snap-note">
          $${snapEligibleTotal.toFixed(2)} SNAP-eligible · $${notEligibleTotal.toFixed(2)} needs another payment method
        </p>` : ''}

      </div>
    `;
   

  document.querySelectorAll<HTMLInputElement>('.grocery-check').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const id = Number(checkbox.dataset.id);
      const row = checkbox.closest('.grocery-item-row') as HTMLElement | null;

      // cancel any timer already running for this id (double-tap)
      if (settleTimers[id]) {
        clearTimeout(settleTimers[id]);
        delete settleTimers[id];
      }

      if (checkbox.checked) {
        checkedGroceryItems.add(id);
        settlingGroceryItems.add(id);
        // paint the checked state immediately, in place — no re-render yet
        row?.classList.add('is-checked', 'is-settling');

        settleTimers[id] = window.setTimeout(() => {
          delete settleTimers[id];
          settlingGroceryItems.delete(id);
          render(); // now it moves down into "In the cart"
        }, SETTLE_MS);
      } else {
        checkedGroceryItems.delete(id);
        settlingGroceryItems.delete(id);
        render(); // unchecking returns it to its aisle right away
      }

      saveCheckedItems(checkedGroceryItems);
    });
  });
      document.querySelectorAll<HTMLElement>('.grocery-item-row').forEach(row => {
      row.addEventListener('click', e => {
        if ((e.target as HTMLElement).classList.contains('grocery-check')) return;
        row.querySelector<HTMLInputElement>('.grocery-check')?.click();
      });
    });
    break;
  }
}
renderBottomNav();
}

// TODO: build this yourself — check how many days away the next shopping
// trip is, and if it's coming up soon, show a real OS-level notification
// (the Notification API, not just an in-page message) prompting a review.
function checkShoppingReminder() {
  if(!mealPlanInfo) {
    return; //stops running function when theres no meal plan info to work with --> prevents error for shopingdate being nonexistent on app startup for first time user
  }
  const intervalDays = shoppingFrequencyDays[mealPlanInfo.shoppingFrequency];
  const nextShoppingDate = new Date(mealPlanInfo.shoppingDate + 'T00:00:00');
  nextShoppingDate.setDate(nextShoppingDate.getDate() + intervalDays);

  const today = new Date(getLocalDateString() + 'T00:00:00');
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = Math.round((nextShoppingDate.getTime() - today.getTime()) / msPerDay);
  if (daysUntil != 1) {
    return;
  }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted'){
      const notification =  new Notification('Upcoming Grocery Shopping Trip', {
        body: "Tommorow is a grocery shopping day! Don't forget to generate a new meal plan :)",
        requireInteraction: true,
      })
      notification.onclick = () => {
        currentPage = "profile";
        localStorage.setItem("currentPage", currentPage);
        render();
        window.focus();
      }
  }
}

const OneSignal: any = (OneSignalModule as any).default
const ONESIGNAL_APP_ID = '5ee077fb-a3e5-4002-bfc1-7dfa9323eb34'

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('deviceExternalId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('deviceExternalId', id)
  }
  return id
}

const NOTIFICATION_PROXY_URL = 'https://meal-planner-notifications.vercel.app/api/schedule-reminder'

function getStoredReminderNotificationId(): string | null {
  return localStorage.getItem('reminderNotificationId')
}

async function scheduleShoppingReminder(shoppingDateStr: string, intervalDays: number) {
  const nextShoppingDate = new Date(shoppingDateStr + 'T08:00:00')
  nextShoppingDate.setDate(nextShoppingDate.getDate() + intervalDays)
  if (nextShoppingDate.getTime() <= Date.now()) return

  const previousNotificationId = getStoredReminderNotificationId()

  try {
    const response = await fetch(NOTIFICATION_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        externalId: getOrCreateDeviceId(),
        sendAfterISO: nextShoppingDate.toISOString(),
        previousNotificationId: previousNotificationId ?? undefined,
      }),
    })
    const data = await response.json()
    if (data.notificationId) {
      localStorage.setItem('reminderNotificationId', data.notificationId)
    } else {
      console.error('Reminder scheduling failed:', data)
    }
  } catch (err: any) {
    console.error('Failed to reach notification proxy:', err?.message ?? String(err))
  }
}

async function initOneSignal() {
  try {
    console.log('OneSignal object:', OneSignal)
    OneSignal.initialize(ONESIGNAL_APP_ID)
    console.log('OneSignal initialized OK')
    const deviceId = getOrCreateDeviceId()
    console.log('Device external ID:', deviceId)
    OneSignal.login(deviceId)
    console.log('OneSignal login called OK')
    const result = await OneSignal.Notifications.requestPermission(true)
    console.log('Permission request result:', result)
  } catch (err) {
    console.error('OneSignal init failed:', err)
  }
}

initOneSignal()

OneSignal.Notifications.addEventListener('click', (event: any) => {
  const targetPage = event?.notification?.additionalData?.targetPage
  if (targetPage === 'profile') {
    currentPage = 'profile'
    localStorage.setItem('currentPage', currentPage)
    render()
  }
})

render();

// The web Notification API doesn't exist inside Capacitor's iOS WebView (or reliably on Android),
// so calling it unguarded crashes app startup there. Only run this on platforms that actually support it —
// real cross-platform reminders on-device will need the @capacitor/local-notifications plugin instead.
if (typeof Notification !== 'undefined') {
  Notification.requestPermission().then(permission => {
    console.log('Permission result:', permission);
    checkShoppingReminder(); //only applicable when user has enabled notifications so put inside function
  })
}

// insert CRUD logic here

//function for user adding a custom meal
function saveCustomMeal(newMeal: Meal) {
  const mealList = JSON.parse(localStorage.getItem("custom-meals") ?? "[]");
  mealList.push(newMeal);
  localStorage.setItem("custom-meals", JSON.stringify(mealList));
};

function getCustomMeals(): Meal[] {
  const customMealsString = localStorage.getItem("custom-meals");

  if (customMealsString != null) {
    const customMealsObj = JSON.parse(customMealsString);
    console.log(customMealsObj);
    return customMealsObj;
  } else {
    console.log("no custom meals have been added");
    return [];
  }
};

function saveCustomIngredient(ingredient: Ingredient) {
  const list = JSON.parse(localStorage.getItem("custom-ingredients") ?? "[]");
  list.push(ingredient);
  localStorage.setItem("custom-ingredients", JSON.stringify(list));
}

function getCustomIngredients(): Ingredient[] {
  const raw = localStorage.getItem("custom-ingredients");
  if (raw == null) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function deleteCustomMeal(recipeId: number) {
  const mealList = getCustomMeals().filter((m: Meal) => m.recipeId !== recipeId);
  localStorage.setItem("custom-meals", JSON.stringify(mealList));

  // also remove it from the live in-memory meals array, so it stops
  // being suggested immediately instead of only after a page refresh
  const index = meals.findIndex(m => m.recipeId === recipeId);
  if (index !== -1) meals.splice(index, 1);
}

function deleteCustomIngredient(ingredientId: number) {
  const ingredientList = getCustomIngredients().filter((i: Ingredient) => i.ingredientId !== ingredientId);
  localStorage.setItem("custom-ingredients", JSON.stringify(ingredientList));

  // same reasoning as above — remove it from the live in-memory object
  delete ingredients[ingredientId.toString()];
}

console.log(getCustomMeals());
