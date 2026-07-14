import './style.css'
import mealsData from './meals.json' // loads meals.json into JavaScript
import ingredientsData from './ingredients.json'
import type { Meal, Ingredient } from './meals.ts'
import { filterMeals } from './filters.ts'
// import { getMealCost } from './filters.ts' // old per-package cost model — replaced by the pantry-aware generator below
import { generateMealPlan, generateShoppingList, getTotalCost, buildPantryFromPlan, matchesDiet, NO_DIET, type DayPlan, type ShoppingListItem, type SpecialDietMember, type MealSlotResult } from './mealPlanGenerator.ts'

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


type MealSlotType = 'breakfast' | 'lunch' | 'dinner'
type ActiveSlot = { date: string; mealType: MealSlotType } | null
type DishTarget = { kind: 'main' } | { kind: 'alt'; altIndex: number }

let mealPlanInfo: MealPlanInfo | null = loadMealPlanInfo(); // lets a returning user's saved data flow in immediately on load instead of always starting empty 
console.log('Loaded on startup:', mealPlanInfo); 

let generatedPlan: DayPlan[] | null = null;
let generatedShoppingList: ShoppingListItem[] | null = null;
let generatedTotalSpend: number = 0;
let activeSlot: ActiveSlot = null;       // which calendar cell the popup is currently acting on
let activeDishTarget: DishTarget = { kind: 'main' }; // which dish WITHIN that slot (main, or a specific alt) is being acted on
let popupMode: 'select-dish' | 'split-select' | 'menu' | 'swap' | null = null;
let swapRejectionMessage: string | null = null; // set when a chosen swap doesn't fit the budget
let selectedMeal: Meal | null = null;    // the meal currently shown on the recipe detail page

type Page = "info-form" | "meal-plan" | "recipe-detail" | "shopping-list";
let currentPage: Page = (localStorage.getItem("currentPage") as Page) ?? "info-form";

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
  nav.style.cssText = 'position:fixed; bottom:0; left:0; width:100%; display:flex; justify-content:space-around; background:white; border-top:1px solid #ccc; padding:8px 0; z-index:500;';

  const pages: Page[] = ['info-form', 'meal-plan', 'shopping-list']; 
  const buttonsHtml = pages.map(page => `
     <button class="nav-tab" data-page="${page}">${page}</button>
  `).join('');
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
  case "info-form": {
    const todayStr = getLocalDateString();

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
        <span>$</span><input type="number" id="budget" name="budget" step="0.01" min="0.00"/>
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
      </form>
    `

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

      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    })
    break;
  }

  case "meal-plan": {
    if (!generatedPlan || !generatedShoppingList || !mealPlanInfo) {
      appElement.innerHTML = `
        <h1>No meal plan yet</h1>
        <p>Please fill out the form first.</p>
        <button id="back-to-form">Back to form</button>
      `;
      document.getElementById('back-to-form')?.addEventListener('click', () => {
        currentPage = "info-form";
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
      `).join('')}

      <p><strong>Total Cost:</strong> $${getTotalCost(generatedShoppingList).toFixed(2)}
         (Budget: $${maxBudget.toFixed(2)} for this shopping trip)
         — ${withinBudget ? '✅ Within budget' : '⚠️ Over budget'}</p>

      <button id="view-shopping-list">View Shopping List</button>
      <button id="back-to-form">Start over</button>
    `;

    document.getElementById('view-shopping-list')?.addEventListener('click', () => {
      currentPage = "shopping-list";
      localStorage.setItem("currentPage", currentPage);
      render();
    });

    document.getElementById('back-to-form')?.addEventListener('click', () => {
      currentPage = "info-form";
      localStorage.setItem("currentPage", currentPage);
      render();
    });

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

    appElement.innerHTML = `
      <button id="back-to-plan">← Back to plan</button>
      <h1>${meal.name}</h1>
      ${meal.culturalName ? `<p><em>${meal.culturalName}</em></p>` : ''}
      <p>Scaled for ${mealPlanInfo.familySize} ${mealPlanInfo.familySize === 1 ? 'person' : 'people'}
         (original recipe serves ${originalServings})</p>

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

  case "shopping-list": {
    if (!generatedPlan || !generatedShoppingList || !mealPlanInfo) {
      appElement.innerHTML = `<h1>No shopping list yet</h1><button id="back-to-plan">Back to plan</button>`;
      document.getElementById('back-to-plan')?.addEventListener('click', () => {
        currentPage = "meal-plan";
        localStorage.setItem("currentPage", currentPage);
        render();
      });
      break;
    }

    appElement.innerHTML = `
      <button id="back-to-plan">← Back to plan</button>
      <h1>Shopping List</h1>
      <p>For your ${generatedPlan[0].date} to ${generatedPlan[generatedPlan.length - 1].date} shopping trip</p>

      <ul>
        ${generatedShoppingList.map(item => `<li>${item.name}: ${item.packagesNeeded}x @ $${item.costPerPackage.toFixed(2)} = $${item.totalCost.toFixed(2)}</li>`).join('')}
      </ul>

      <p><strong>Total: $${getTotalCost(generatedShoppingList).toFixed(2)}</strong></p>
    `;

    document.getElementById('back-to-plan')?.addEventListener('click', () => {
      currentPage = "meal-plan";
      localStorage.setItem("currentPage", currentPage);
      render();
    });
    break;
  }
}
renderBottomNav(); 
}

render();

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
