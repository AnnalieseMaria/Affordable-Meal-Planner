import './pico.pink.css'
import './style.css'
import mealsData from './meals.json' // loads meals.json into JavaScript
import ingredientsData from './ingredients.json'
import type { Meal, Ingredient } from './meals.ts'
import { filterMeals } from './filters.ts'
// import { getMealCost } from './filters.ts' // old per-package cost model — replaced by the pantry-aware generator below
import { generateMealPlan, generateShoppingList, getTotalCost, buildPantryFromPlan, matchesDiet, NO_DIET, calculateMealNutrition, type DayPlan, type ShoppingListItem, type SpecialDietMember, type MealSlotResult, type NutritionBreakdown} from './mealPlanGenerator.ts'

const meals = mealsData as unknown as Meal[]
const ingredients = ingredientsData as unknown as Record<string, Ingredient>
const filtered = filterMeals(meals, { cuisine: 'Mediterranean', dietType: 'Vegetarian', perMealBudget: null })
console.log(filtered)

const appElement = document.querySelector<HTMLElement>('#app')!
if (!appElement) throw new Error("Couldn't find element with id 'app'")

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type DietType = "Vegan" | "Vegetarian" | "Gluten-Free" | "Dairy-Free" | "Pescatarian" | typeof NO_DIET;
const dietTypes: DietType[] = ["Dairy-Free", "Gluten-Free", "Pescatarian", "Vegan", "Vegetarian", NO_DIET]

type Cuisines = "Mexican" | "Chinese" | "Soul Food" | "Mediterranean";
const cuisines: Cuisines[] = ["Mexican", "Chinese", "Soul Food", "Mediterranean"]

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

type ShoppingFrequency = "weekly" | "biweekly" | "monthly";
const shoppingFrequencyDays: Record<ShoppingFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

type MealPlanInfo = {
  dietType: string;
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

type Page = "home" | "meal-plan" | "recipe-detail" | "groceries" | "profile";
const VALID_PAGES: Page[] = ["home", "meal-plan", "recipe-detail", "groceries", "profile"];
const storedPage = localStorage.getItem("currentPage");
const defaultPage: Page = mealPlanInfo ? "home" : "profile";
let currentPage: Page = (storedPage && VALID_PAGES.includes(storedPage as Page)) ? (storedPage as Page) : defaultPage;
let profileViewMode: 'summary' | 'edit' = 'summary';

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

function renderSlotCell(slot: MealSlotResult): string {
  const mainName = slot.meal?.name ?? '—';
  const altTags = slot.altDishes.map(alt =>
    `<div style="font-size:0.8em; color:#666;">+ ${alt.forNames.join(', ')}: ${alt.meal?.name ?? '—'}</div>`
  ).join('');
  return `${mainName}${altTags}`;
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

  return `
    <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
      <svg width="140" height="140" viewBox="0 0 100 100">
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#e0e0e0" stroke-width="10" />
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#4CAF50" stroke-width="10"
            stroke-dasharray="${proteinLength} ${circumference - proteinLength}"
            stroke-dashoffset="${proteinOffset}" />
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#2196F3" stroke-width="10"
            stroke-dasharray="${carbsLength} ${circumference - carbsLength}"
            stroke-dashoffset="${carbsOffset}" />
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#FF9800" stroke-width="10"
            stroke-dasharray="${fatLength} ${circumference - fatLength}"
            stroke-dashoffset="${fatOffset}" />
        </g>
        <text x="50" y="47" text-anchor="middle" font-size="16" font-weight="bold">${Math.round(nutrition.calories)}</text>
        <text x="50" y="60" text-anchor="middle" font-size="8" fill="#666">kcal</text>
      </svg>
      <div>
        <div style="color:#4CAF50; font-weight:bold;">Protein (${proteinPct.toFixed(0)}%) — ${nutrition.protein.toFixed(1)}g</div>
        <div style="color:#2196F3; font-weight:bold;">Carbs (${carbsPct.toFixed(0)}%) — ${nutrition.carbs.toFixed(1)}g</div>
        <div style="color:#FF9800; font-weight:bold;">Fat (${fatPct.toFixed(0)}%) — ${nutrition.fat.toFixed(1)}g</div>
      </div>
    </div>
  `;
}

// Same idea as renderSlotCell, but every dish name is a clickable link
// (tagged with the recipe's id) instead of plain text — used on Home,
// where tapping a meal should jump straight to its recipe.
function renderClickableSlot(slot: MealSlotResult): string {
  const mainHtml = slot.meal
    ? `<span class="recipe-link" data-recipe-id="${slot.meal.recipeId}" style="cursor:pointer; text-decoration:underline; color:#0645AD;">${slot.meal.name}</span>`
    : '—';
  const altHtml = slot.altDishes.map(alt => {
    const dishHtml = alt.meal
      ? `<span class="recipe-link" data-recipe-id="${alt.meal.recipeId}" style="cursor:pointer; text-decoration:underline; color:#0645AD;">${alt.meal.name}</span>`
      : '—';
    return `<div style="font-size:0.8em; color:#666;">+ ${alt.forNames.join(', ')}: ${dishHtml}</div>`;
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

  const intervalDays = shoppingFrequencyDays[mealPlanInfo.shoppingFrequency];
  const nextShoppingDate = new Date(mealPlanInfo.shoppingDate + 'T00:00:00');
  nextShoppingDate.setDate(nextShoppingDate.getDate() + intervalDays);
  const nextShoppingDateStr = nextShoppingDate.toISOString().split('T')[0];

  mealPlanInfo = { ...mealPlanInfo, shoppingDate: nextShoppingDateStr };
  saveMealPlanInfo(mealPlanInfo);

  const { plan, pantry, totalSpend } = generateMealPlan(
    meals,
    mealPlanInfo.cuisines,
    mealPlanInfo.dietType,
    mealPlanInfo.familySize,
    mealPlanInfo.shoppingDate,
    intervalDays,
    ingredients,
    mealPlanInfo.budget,
    mealPlanInfo.specialDietMembers
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
  activeSlot = null;
  popupMode = null;
  swapRejectionMessage = null;
  activeDishTarget = { kind: 'main' };
  document.getElementById('meal-popup-overlay')?.remove();
}

function openMealMenu(date: string, mealType: MealSlotType) {
  activeSlot = { date, mealType };
  swapRejectionMessage = null;
  const day = generatedPlan?.find(d => d.date === date);
  const slot = day?.[mealType];
  const hasAltDishes = slot && slot.altDishes.length > 0;
  const canSplitSomeone = getUnsplitSpecialMembers(date, mealType).length > 0;
  if (hasAltDishes || canSplitSomeone) {
    // There's already more than one dish here, OR there's someone who
    // COULD be split off even though the algorithm didn't need to —
    // either way, ask what they want to do first.
    popupMode = 'select-dish';
  } else {
    activeDishTarget = { kind: 'main' };
    popupMode = 'menu';
  }
  renderPopup(); //called multiple times in single popup to show new content 
}

function renderPopup() { 
  document.getElementById('meal-popup-overlay')?.remove(); //delete old overlay to avoid stacking
  if (!activeSlot || !popupMode || !mealPlanInfo) return;

  const mealTypeLabel = activeSlot.mealType.charAt(0).toUpperCase() + activeSlot.mealType.slice(1);

  const overlay = document.createElement('div');
  overlay.id = 'meal-popup-overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;';

  const box = document.createElement('div');
  box.style.cssText = 'background:white; padding:20px; border-radius:8px; min-width:280px; max-width:90%; max-height:80vh; overflow-y:auto;';

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
        ${meal ? `<button id="popup-remove">Remove</button>` : ''}
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

    const alternatives = meals.filter(m =>
      mealPlanInfo!.cuisines.includes(m.cuisine) &&
      m.mealType.includes(mealTypeLabel) &&
      requiredDiets.every(d => matchesDiet(m, d)) &&
      m.recipeId !== meal?.recipeId
    );

    // Avoid suggesting a dish already used ANYWHERE today — across every
    // slot's main dish AND every alt dish, not just this one slot.
    const day = generatedPlan?.find(d => d.date === activeSlot!.date);
    const allTodayIds: number[] = [];
    for (const s of [day?.breakfast, day?.lunch, day?.dinner]) {
      if (s?.meal) allTodayIds.push(s.meal.recipeId);
      s?.altDishes.forEach(a => { if (a.meal) allTodayIds.push(a.meal.recipeId); });
    }
    const usedTodayIds = new Set(allTodayIds);
    const validAlternatives = alternatives.filter(m => !usedTodayIds.has(m.recipeId));

    box.innerHTML = `
      <h3>Swap ${mealTypeLabel} on ${activeSlot.date} (${targetLabel})</h3>
      ${swapRejectionMessage ? `<p style="color:#b00020; font-weight:bold;">${swapRejectionMessage}</p>` : ''}
      ${validAlternatives.length === 0 ? '<p>No other matching recipes found for this slot.</p>' : ''}
      <div style="display:flex; flex-direction:column; gap:6px; margin:12px 0;">
        ${validAlternatives.map(m => `<button class="swap-option" data-recipe-id="${m.recipeId}" style="text-align:left;">${m.name}</button>`).join('')}
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
        const dietType = el.dataset.diet!;
        const newAltIndex = splitOffPerson(activeSlot!.date, activeSlot!.mealType, { name, dietType });
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
  // nav.style.cssText = 'position:fixed; bottom:0; left:0; width:100%; display:flex; justify-content:space-around; background:white; border-top:1px solid #ccc; padding:8px 0; z-index:500;';
  nav.style.cssText = 'position:fixed; bottom:0; left:0; width:100%; display:flex; justify-content:space-around; background:white; border-top:1px solid #ddd; padding:10px 0; z-index:500;';

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
    const color = isActive ? '#FF77A8' : '#8b93a1';
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
          <legend>Cuisines</legend>
           ${cuisines.map(type => `
            <div>
            <input type="checkbox" id="${type}" name="cuisine" value="${type}" />
            <label for="${type}">${type}</label>
            </div>
          `).join("")}
        </fieldset>
        <div class="form-row">
        <label for="familySize">Family Size</label>
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
        <p style="font-size:0.85em; color:#666;">Pick any upcoming date that falls on your regular shopping day — this sets the pattern going forward (e.g. if you shop weekly, every future trip lands on this same day of the week; biweekly, every 2 weeks on this day; monthly, this same date each month). Your meal plan starts the day after each trip.</p>

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
        </div>
      `;
      container.insertAdjacentHTML('beforeend', rowHtml);
      const newRow = container.querySelector(`[data-row-id="${rowId}"]`);
      newRow?.querySelector('.remove-special-diet-row')?.addEventListener('click', () => {
        newRow.remove();
      });
    }

    document.getElementById('add-special-diet-member')?.addEventListener('click', addSpecialDietMemberRow);
    const infoForm = document.getElementById('info-form') as HTMLFormElement | null;
    if (!infoForm) { throw new Error("bad"); }

    infoForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(infoForm);

      const specialDietMembers: SpecialDietMember[] = [];
      document.querySelectorAll('.special-diet-row').forEach(row => {
        const name = (row.querySelector('.special-diet-name') as HTMLInputElement)?.value.trim();
        const dietType = (row.querySelector('.special-diet-type') as HTMLSelectElement)?.value;
        if (name && dietType) {
          specialDietMembers.push({ name, dietType });
        }
      });

      mealPlanInfo = {
        dietType: formData.get('dietType') as string,
        cuisines: formData.getAll('cuisine') as string[],
        familySize: Number(formData.get('familySize')),
        budget: Number(formData.get('budget')),
        shoppingDate: formData.get('shoppingDate') as string,
        shoppingFrequency: formData.get('shoppingFrequency') as ShoppingFrequency,
        specialDietMembers,
        usesSnap: formData.get('usesSnap') === 'on',
      };
      saveMealPlanInfo(mealPlanInfo);

      const { plan, pantry, totalSpend } = generateMealPlan(
        meals,
        mealPlanInfo.cuisines,
        mealPlanInfo.dietType,
        mealPlanInfo.familySize,
        mealPlanInfo.shoppingDate,
        shoppingFrequencyDays[mealPlanInfo.shoppingFrequency],
        ingredients,
        mealPlanInfo.budget,
        mealPlanInfo.specialDietMembers
      );

      generatedPlan = plan;
      generatedShoppingList = generateShoppingList(pantry, ingredients);
      generatedTotalSpend = totalSpend;
      savePlanState(generatedPlan, generatedShoppingList, generatedTotalSpend);

      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    })
  } else {
    const info = mealPlanInfo;
    appElement.innerHTML = `
      <h1>Profile</h1>
      <p><strong>Diet:</strong> ${info.dietType}</p>
      <p><strong>Cuisines:</strong> ${info.cuisines.join(', ')}</p>
      <p><strong>Family Size:</strong> ${info.familySize}</p>
      <p><strong>Budget per Trip:</strong> $${info.budget}</p>
      <p><strong>Shopping Frequency:</strong> ${info.shoppingFrequency}</p>
      <p><strong>Shopping Day:</strong> ${info.shoppingDate}</p>
      <p><strong>SNAP/EBT:</strong> ${info.usesSnap ? 'Yes' : 'No'}</p>
      ${info.specialDietMembers.length > 0 ? `<p><strong>Family members with different diets:</strong> ${info.specialDietMembers.map(m => `${m.name} (${m.dietType})`).join(', ')}</p>` : ''}

      <div style="display:flex; flex-direction:column; gap:12px; margin-top:20px;">
        <button id="edit-settings" style="width:100%; display:block;">Edit Settings</button>
        <button id="add-own-meal" style="width:100%; display:block;">Add Your Own Meal</button>
        <button id="generate-next-plan" style="width:100%; display:block;">Generate Next Plan (using current settings)</button>
      </div>
    `;

    document.getElementById('edit-settings')?.addEventListener('click', () => {
      profileViewMode = 'edit';
      render();
    });
    document.getElementById('add-own-meal')?.addEventListener('click', () => {
      // placeholder for now — we'll design this feature together next
      alert('Coming soon!');
    });
    document.getElementById('generate-next-plan')?.addEventListener('click', generateNextPlan);
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
    const withinBudget = generatedTotalSpend <= maxBudget;

    // Break the calendar into 7-day chunks purely for readability — this is
    // unrelated to shopping frequency (even a monthly shopper's full plan
    // shows here broken into weeks), and every single day still renders,
    // nothing is hidden or paginated away.
    const weekChunks: DayPlan[][] = [];
    for (let i = 0; i < generatedPlan.length; i += 7) {
      weekChunks.push(generatedPlan.slice(i, i + 7));
    }

    appElement.innerHTML = `
      <h1>Your Meal Plan</h1>
      <p>${mealPlanInfo.cuisines.join(', ')} · ${mealPlanInfo.dietType} · Family of ${mealPlanInfo.familySize}</p>
      <p>Plan runs ${generatedPlan[0].date} to ${generatedPlan[generatedPlan.length - 1].date}</p>

      ${weekChunks.map(chunk => `
        <h2>${chunk[0].date} – ${chunk[chunk.length - 1].date}</h2>
       <div class="table-scroll-wrapper">
        <table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr><th>Date</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>
          </thead>
          <tbody>
            ${chunk.map(day => `
              <tr>
                <td>${day.date}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="breakfast" style="cursor:pointer;">${renderSlotCell(day.breakfast)}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="lunch" style="cursor:pointer;">${renderSlotCell(day.lunch)}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="dinner" style="cursor:pointer;">${renderSlotCell(day.dinner)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      `).join('')}

      <p><strong>Total Cost:</strong> $${getTotalCost(generatedShoppingList).toFixed(2)}
         (Budget: $${maxBudget.toFixed(2)} for this shopping trip)
         — ${withinBudget ? '✅ Within budget' : '⚠️ Over budget'}</p>
    `;

  

    document.querySelectorAll<HTMLElement>('.meal-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date!;
        const mealType = cell.dataset.mealtype as MealSlotType;
        openMealMenu(date, mealType);
      });
    });
    break;
  }

  case "recipe-detail": {
    if (!selectedMeal || !mealPlanInfo) {
      appElement.innerHTML = `<h1>No recipe selected</h1><button id="back-to-plan">Back to plan</button>`;
      document.getElementById('back-to-plan')?.addEventListener('click', () => {
        currentPage = "meal-plan";
        localStorage.setItem("currentPage", currentPage);
        render();
      });
      break;
    }

    const meal = selectedMeal;
    const originalServings = meal.recipeServings ?? 1;
    const scaleFactor = mealPlanInfo.familySize / originalServings;
    const perPersonNutrition = calculateMealNutrition(meal, 1, ingredients);

    appElement.innerHTML = `
      <button id="back-to-plan">← Back to plan</button>
      <h1>${meal.name}</h1>
      ${meal.culturalName ? `<p><em>${meal.culturalName}</em></p>` : ''}
      <p>Scaled for ${mealPlanInfo.familySize} ${mealPlanInfo.familySize === 1 ? 'person' : 'people'}
         (original recipe serves ${originalServings})</p>

      <h2>Nutrition (per person)</h2>
      ${renderNutritionDonut(perPersonNutrition)}
      <h2>Ingredients</h2>
      <ul>
        ${meal.ingredients.map(ing => {
          const scaledSize = ing.amountInfo.size * scaleFactor;
          return `<li>${scaledSize.toFixed(2)} ${ing.amountInfo.unit} ${ing.name}</li>`;
        }).join('')}
      </ul>

      <h2>Steps</h2>
      <ol>
        ${meal.steps.map(step => `<li>${step}</li>`).join('')}
      </ol>
    `;

    document.getElementById('back-to-plan')?.addEventListener('click', () => {
      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    });
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

    const maxBudget = getMaxBudget();
    const withinBudget = generatedTotalSpend <= maxBudget;

    const intervalDays = shoppingFrequencyDays[mealPlanInfo.shoppingFrequency];
    const nextShoppingDate = new Date(mealPlanInfo.shoppingDate + 'T00:00:00');
    nextShoppingDate.setDate(nextShoppingDate.getDate() + intervalDays);
    const nextShoppingDateStr = nextShoppingDate.toISOString().split('T')[0];

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



    appElement.innerHTML = `
      
      <h1>Shopping List</h1>
      <p>For your ${generatedPlan[0].date} to ${generatedPlan[generatedPlan.length - 1].date} shopping trip</p>

      <h2>Budget Status</h2>
      <p>$${generatedTotalSpend.toFixed(2)} of $${maxBudget.toFixed(2)} spent this trip
         — ${withinBudget ? '✅ Within budget' : '⚠️ Over budget'}</p>

      <h2>Next Shopping Trip</h2>
      <p>${nextShoppingDateStr}</p>

      ${mealPlanInfo.usesSnap ? `
      <h3>SNAP Breakdown</h3>
      <p>$${snapEligibleTotal.toFixed(2)} SNAP-eligible · $${notEligibleTotal.toFixed(2)} not eligible (needs another payment method)</p>
      ` : ''}

     ${sortAislesByStoreOrder(Object.keys(itemsByAisle)).map(aisle => `
      <h3>${aisle}</h3>
        <div class="groceries-list">
        ${itemsByAisle[aisle].map(item => {
          const isChecked = checkedGroceryItems.has(item.ingredientId);
          return `<div class="grocery-item-row" style="${isChecked ? 'text-decoration: line-through; color: #999;' : ''}">
          <input type="checkbox" class="grocery-check" data-id="${item.ingredientId}" ${isChecked ? 'checked' : ''} />
          ${item.name}: : ${item.packagesNeeded}x @ $${item.costPerPackage.toFixed(2)} = $${item.totalCost.toFixed(2)}
        </div>`;
        }).join('')}
      </div>
      `).join('')}

      <p><strong>Total: $${getTotalCost(generatedShoppingList).toFixed(2)}</strong></p>
    `;

    document.getElementById('back-to-plan')?.addEventListener('click', () => {
      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    });

  document.querySelectorAll<HTMLInputElement>('.grocery-check').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const id = Number(checkbox.dataset.id);
      if (checkbox.checked) {
        checkedGroceryItems.add(id);
      } else {
        checkedGroceryItems.delete(id);
      }
        saveCheckedItems(checkedGroceryItems);

      const row = checkbox.closest('.grocery-item-row') as HTMLElement | null;
      if (row) {
        row.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
        row.style.color = checkbox.checked ? '#999' : '';
      }
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
  const nextShoppingDateStr = nextShoppingDate.toISOString().split('T')[0];

  const today = new Date(getLocalDateString() + 'T00:00:00');
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = Math.round((nextShoppingDate.getTime() - today.getTime()) / msPerDay); 
  if (daysUntil != 1) {
    return; 
  }

    if (Notification.permission === 'granted'){
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

render();

 Notification.requestPermission().then(permission => {
    console.log('Permission result:', permission); 
    checkShoppingReminder(); //only applicable when user has enabled notifications so put inside function 
  })

// insert CRUD logic here

//function for user adding a custom meal
function saveCustomMeal(newMeal: Meal) {
  const mealList = JSON.parse(localStorage.getItem("custom-meals") ?? "[]");
  mealList.push(newMeal);
  localStorage.setItem("custom-meals", JSON.stringify(mealList));
};

function getCustomMeals() {
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

console.log(getCustomMeals());
