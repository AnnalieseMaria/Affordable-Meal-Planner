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

// appElement.innerHTML = `
//   <h1>Affordable Meal Planner</h1>
//   <p>${filtered.length} meals found</p>
//   <ul>
//     ${filtered.map(m => `<li>${m.name}</li>`).join('')}
//   </ul>
// `

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
const cuisines: Cuisines[] = ["Mexican", "Chinese" , "Soul Food" , "Mediterranean"] 

type MealPlanInfo = {
  dietType: string;
  cuisines: string[];
  familySize: number;
  budget: number;
  startDate: string;
  timeframe: string;
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


type Page = "info-form" | "meal-plan" | "recipe-detail";
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
  if (!generatedPlan || !mealPlanInfo) return 0;
  const numWeeks = Math.ceil(generatedPlan.length / 7);
  return mealPlanInfo.budget * numWeeks;
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
        ${validAlternatives.map(m => {
          return `<button class="swap-option" data-recipe-id="${m.recipeId}" style="text-align:left;">${m.name}</button>`;
        }).join('')}
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

        // Build a TRIAL plan with the swap applied, without touching the real one yet
        const trialPlan: DayPlan[] = generatedPlan.map(day =>
          day.date === activeSlot!.date ? { ...day, [activeSlot!.mealType]: candidateMeal } : day
        );

        const trialPantry = buildPantryFromPlan(trialPlan, mealPlanInfo.familySize, ingredients);
        const trialShoppingList = generateShoppingList(trialPantry, ingredients);
        const trialTotal = getTotalCost(trialShoppingList);
        const maxBudget = getMaxBudget();

        if (trialTotal <= maxBudget) {
          // Fits — commit it for real, reusing the trial results directly
          generatedPlan = trialPlan;
          generatedShoppingList = trialShoppingList;
          generatedTotalSpend = trialTotal;
          swapRejectionMessage = null;
          closePopup();
          render();
        } else {
          // Doesn't fit — reject the swap, leave the real plan untouched,
          // and show why so the person can pick something else
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
  case "info-form":
    const todayStr = getLocalDateString();

    appElement.innerHTML = `
      <h1>Affordable Meal Planner</h1>
      <form id="info-form">
       
        <fieldset>
          <legend>Diet Type</legend>
        ${dietTypes.map(type => {
          return `
            <div>
            <input type="radio" id="${type}" name="dietType" value="${type}" />
            <label for="${type}">${type}</label>
            </div>
          `;
        }).join("")}
        </fieldset>
        <fieldset>
          <legend>Cuisines</legend>
           ${cuisines.map(type => {
          return `
            <div>
            <input type="checkbox" id="${type}" name="cuisine" value="${type}" />
            <label for="${type}">${type}</label>
            </div>
          `;
        }).join("")}
        </fieldset>
        <div>
        <label for="familySize">Family Size</label>
        <input id="familySize" name="familySize" type="number" required />
        
        <label for="budget">Weekly Grocery Budget: $</label>
        <input type="number" id="budget" name="budget" step="0.01" min="0.00"/>
        </div>

        <div>
        <label for="timeframe">Choose a timeframe:</label>
        <select name="timeframes" id="timeframe">
          <option value="">Please select an option</option>
          <option value="one week">One Week</option>
          <option value="two weeks">Two Weeks</option>
          <option value="three week">Three Weeks</option>
          <option value="one month">One Month</option>
        </select>

        <label for="startDate">Choose a Start Date: </label>
        <input type="date" id="startDate" name="startDate" value="${todayStr}" min="${todayStr}" required />
        </div>

        <input type="submit" value="Submit Form" />
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
        startDate: formData.get('startDate') as string,
        timeframe: formData.get('timeframes') as string,
      };

      const { plan, pantry, totalSpend } = generateMealPlan(
        meals,
        mealPlanInfo.cuisines,
        mealPlanInfo.dietType,
        mealPlanInfo.familySize,
        mealPlanInfo.startDate,
        mealPlanInfo.timeframe,
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

      const numWeeks = Math.ceil(generatedPlan.length / 7);
      const maxBudget = mealPlanInfo.budget * numWeeks;
      const withinBudget = generatedTotalSpend <= maxBudget;

      appElement.innerHTML = `
        <h1>Your Meal Plan</h1>
        <p>${mealPlanInfo.cuisines.join(', ')} · ${mealPlanInfo.dietType} · Family of ${mealPlanInfo.familySize}</p>

        <table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr><th>Date</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>
          </thead>
          <tbody>
            ${generatedPlan.map(day => `
              <tr>
                <td>${day.date}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="breakfast" style="cursor:pointer;">${day.breakfast?.name ?? '—'}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="lunch" style="cursor:pointer;">${day.lunch?.name ?? '—'}</td>
                <td class="meal-cell" data-date="${day.date}" data-mealtype="dinner" style="cursor:pointer;">${day.dinner?.name ?? '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Shopping List</h2>
        <ul>
          ${generatedShoppingList.map(item => `
            <li>${item.name}: ${item.packagesNeeded}x @ $${item.costPerPackage.toFixed(2)} = $${item.totalCost.toFixed(2)}</li>
          `).join('')}
        </ul>

        <p><strong>Total Cost:</strong> $${getTotalCost(generatedShoppingList).toFixed(2)}
           (Budget: $${maxBudget.toFixed(2)} for ${numWeeks} week${numWeeks > 1 ? 's' : ''})
           — ${withinBudget ? '✅ Within budget' : '⚠️ Over budget'}</p>

        <button id="back-to-form">Start over</button>
      `;

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
}
}

render();

// insert CRUD logic here 

//function for user adding a custom meal 
function saveCustomMeal(newMeal: Meal) {
  const mealList = JSON.parse(localStorage.getItem("custom-meals") ?? "[]"); //if left side is null, use empty arr (right side)
  mealList.push(newMeal);
  localStorage.setItem("custom-meals", JSON.stringify(mealList)); //Saves the whole array back to localStorage
};

function getCustomMeals() {
  // 1. Fetch the raw JSON string
  const customMealsString = localStorage.getItem("custom-meals");

  if (customMealsString != null) { //
    const customMealsObj = JSON.parse(customMealsString);
    console.log(customMealsObj);
    return customMealsObj;
  } else {
    console.log("no custom meals have been added");
    return [];
  }
};


// testMeal removed — no longer used for testing (real Mexican recipe data is used instead)
// const testMeal: Meal = { ... }
// saveCustomMeal(testMeal);
console.log(getCustomMeals());
// console.log(getMealCost(meals[3])); // old cost model, replaced by the pantry-aware generator
