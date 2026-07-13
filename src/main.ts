import './style.css'
import mealsData from './meals.json' // loads meals.json into JavaScript
import ingredientsData from './ingredients.json'
import type { Meal, Ingredient } from './meals.ts'
import { filterMeals } from './filters.ts'
// import { getMealCost } from './filters.ts' // old per-package cost model — replaced by the pantry-aware generator below
import { generateMealPlan, generateShoppingList, getTotalCost, filterMealsForSlot, buildPantryFromPlan, type DayPlan, type ShoppingListItem } from './mealPlanGenerator.ts'

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

type DietType = "Vegan" | "Vegetarian" | "Gluten-Free" | "Dairy-Free" | "Pescatarian";
const dietTypes: DietType[] = ["Dairy-Free", "Gluten-Free", "Pescatarian", "Vegan", "Vegetarian"]

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
};

type MealSlotType = 'breakfast' | 'lunch' | 'dinner'
type ActiveSlot = { date: string; mealType: MealSlotType } | null

let mealPlanInfo: MealPlanInfo | null = null;
let generatedPlan: DayPlan[] | null = null;
let generatedShoppingList: ShoppingListItem[] | null = null;
let generatedTotalSpend: number = 0;
let activeSlot: ActiveSlot = null;       // which calendar cell the popup is currently acting on
let popupMode: 'menu' | 'swap' | null = null; // 'menu' = View/Swap/Remove buttons, 'swap' = the alternatives list
let swapRejectionMessage: string | null = null; // set when a chosen swap doesn't fit the budget
let selectedMeal: Meal | null = null;    // the meal currently shown on the recipe detail page

type Page = "info-form" | "meal-plan" | "recipe-detail" | "shopping-list";
let currentPage: Page = (localStorage.getItem("currentPage") as Page) ?? "info-form";

function getSlotMeal(date: string, mealType: MealSlotType): Meal | null {
  const day = generatedPlan?.find(d => d.date === date);
  return day ? day[mealType] : null;
}

function setSlotMeal(date: string, mealType: MealSlotType, meal: Meal | null) {
  const day = generatedPlan?.find(d => d.date === date);
  if (day) day[mealType] = meal;
}

function getMaxBudget(): number {
  if (!mealPlanInfo) return 0;
  // The plan always covers exactly one shopping cycle now, so the budget
  // ceiling is just the per-trip budget itself — no multiplication needed.
  return mealPlanInfo.budget;
}

function recalculateShoppingList() {
  if (!generatedPlan || !mealPlanInfo) return;
  const pantry = buildPantryFromPlan(generatedPlan, mealPlanInfo.familySize, ingredients);
  generatedShoppingList = generateShoppingList(pantry, ingredients);
  generatedTotalSpend = getTotalCost(generatedShoppingList);
}

function closePopup() {
  activeSlot = null;
  popupMode = null;
  swapRejectionMessage = null;
  document.getElementById('meal-popup-overlay')?.remove();
}

function openMealMenu(date: string, mealType: MealSlotType) {
  activeSlot = { date, mealType };
  popupMode = 'menu';
  swapRejectionMessage = null;
  renderPopup();
}

function renderPopup() {
  document.getElementById('meal-popup-overlay')?.remove();
  if (!activeSlot || !popupMode || !mealPlanInfo) return;

  const meal = getSlotMeal(activeSlot.date, activeSlot.mealType);
  const mealTypeLabel = activeSlot.mealType.charAt(0).toUpperCase() + activeSlot.mealType.slice(1);

  const overlay = document.createElement('div');
  overlay.id = 'meal-popup-overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;';

  const box = document.createElement('div');
  box.style.cssText = 'background:white; padding:20px; border-radius:8px; min-width:280px; max-width:90%; max-height:80vh; overflow-y:auto;';

  if (popupMode === 'menu') {
    box.innerHTML = `
      <h3>${meal?.name ?? 'Empty slot'}</h3>
      <p>${activeSlot.date} — ${mealTypeLabel}</p>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
        ${meal ? `<button id="popup-view">View Recipe</button>` : ''}
        <button id="popup-swap">Swap Meal</button>
        ${meal ? `<button id="popup-remove">Remove</button>` : ''}
        <button id="popup-close">Cancel</button>
      </div>
    `;
  } else {
    const alternatives = filterMealsForSlot(meals, mealPlanInfo.cuisines, mealPlanInfo.dietType, mealTypeLabel)
      .filter(m => m.recipeId !== meal?.recipeId);

    const day = generatedPlan?.find(d => d.date === activeSlot!.date);
    const usedTodayIds = new Set(
      [day?.breakfast?.recipeId, day?.lunch?.recipeId, day?.dinner?.recipeId].filter((id): id is number => id != null)
    );
    const validAlternatives = alternatives.filter(m => !usedTodayIds.has(m.recipeId));

    box.innerHTML = `
      <h3>Swap ${mealTypeLabel} on ${activeSlot.date}</h3>
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

  if (popupMode === 'menu') {
    document.getElementById('popup-view')?.addEventListener('click', () => {
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
      setSlotMeal(activeSlot!.date, activeSlot!.mealType, null);
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
          day.date === activeSlot!.date ? { ...day, [activeSlot!.mealType]: candidateMeal } : day
        );

        const trialPantry = buildPantryFromPlan(trialPlan, mealPlanInfo.familySize, ingredients);
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
          <option value="">Select Interval</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly (every 2 weeks)</option>
          <option value="monthly">Monthly</option>
        </select>
        </div>

        <div class="form-row">
        <label for="shoppingDate">Grocery Shopping Date</label>
        <input type="date" id="shoppingDate" name="shoppingDate" value="${todayStr}" min="${todayStr}" required />
        </div>
        <p style="font-size:0.85em; color:#666;">Pick any upcoming date that falls on your regular shopping day — this sets the pattern going forward (e.g. if you shop weekly, every future trip lands on this same day of the week; biweekly, every 2 weeks on this day; monthly, this same date each month). Your meal plan starts the day after each trip.</p>

        <input type="submit" value="Submit Form" />
      </form>
    `
    const infoForm = document.getElementById('info-form') as HTMLFormElement | null;
    if (!infoForm) { throw new Error("bad"); }

    infoForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(infoForm);

      mealPlanInfo = {
        dietType: formData.get('dietType') as string,
        cuisines: formData.getAll('cuisine') as string[],
        familySize: Number(formData.get('familySize')),
        budget: Number(formData.get('budget')),
        shoppingDate: formData.get('shoppingDate') as string,
        shoppingFrequency: formData.get('shoppingFrequency') as ShoppingFrequency,
      };

      const { plan, pantry, totalSpend } = generateMealPlan(
        meals,
        mealPlanInfo.cuisines,
        mealPlanInfo.dietType,
        mealPlanInfo.familySize,
        mealPlanInfo.shoppingDate,
        shoppingFrequencyDays[mealPlanInfo.shoppingFrequency],
        ingredients,
        mealPlanInfo.budget
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
                <td class="meal-cell" data-date="${day.date}" data-mealtype="breakfast" style="cursor:pointer;">${day.breakfast?.name ?? '—'}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="lunch" style="cursor:pointer;">${day.lunch?.name ?? '—'}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="dinner" style="cursor:pointer;">${day.dinner?.name ?? '—'}</td>
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
