import './style.css'
import mealsData from './meals.json' // loads meals.json into JavaScript
import type { Meal } from './meals.ts'
import { filterMeals } from './filters.ts'
import { getMealCost } from './filters.ts'


const meals = mealsData as Meal[]
const filtered = filterMeals(meals, { cuisine: 'Mediterranean', dietType: 'Vegetarian', perMealBudget: null })
console.log(filtered)

const appElement = document.querySelector<HTMLElement>('#app')
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

let mealPlanInfo: MealPlanInfo | null = null;


type Page = "info-form" | "meal-plan";
let currentPage: Page = (localStorage.getItem("currentPage") as Page) ?? "info-form";
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

      console.log(mealPlanInfo);
    })
    break; 

    case "meal-plan":
    break; 
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


const testMeal: Meal = {
  recipeId: 99,
  name: "Test Meal",
  culturalName: null,
  cuisine: "American",
  region: "United States",
  mealType: ["Dinner"],
  complexity: "Simple",
  prepTimeMinutes: 10,
  dietType: ["Vegetarian"],
  nutritionHighlights: ["High Protein"],
  estimatedNutrition: { calories: 300, protein: 10, carbs: 40, fat: 8, fiber: 3, sugar: 2, sodium: 200 },
  hasNonAldiIngredients: false,
  culturalContext: null,
  ingredients: [{ name: "Pasta", amount: "1 cup", aldiProduct: true, ingredientId: null }],
  steps: ["Cook pasta"],
  mealPrep: false
}

saveCustomMeal(testMeal);
console.log(getCustomMeals());
console.log(getMealCost(meals[3]));
