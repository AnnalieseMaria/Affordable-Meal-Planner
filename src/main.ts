import './style.css'
import mealsData from './meals.json'
import type { Meal } from './meals.ts'
import { filterMeals } from './filters.ts'

const meals = mealsData as Meal[]

const filtered = filterMeals(meals, { cuisine: 'Mediterranean', dietType: '' })

console.log(filtered)

const appElement = document.querySelector<HTMLElement>('#app')
if (!appElement) throw new Error("Couldn't find element with id 'app'")

appElement.innerHTML = `
  <h1>Affordable Meal Planner</h1>
  <p>${filtered.length} meals found</p>
  <ul>
    ${filtered.map(m => `<li>${m.name}</li>`).join('')}
  </ul>
`

// insert CRUD logic here 

//function for user adding a custom meal 
function saveCustomMeal(newMeal: Meal){
	const mealList = JSON.parse(localStorage.getItem("custom-meals") ?? "[]"); //if left side is null, use empty arr (right side)
	mealList.push(newMeal); 
	localStorage.setItem("custom-meals", JSON.stringify(mealList)); //Saves the whole array back to localStorage
};

function getCustomMeals(){
	// 1. Fetch the raw JSON string
	const customMealsString = localStorage.getItem("custom-meals");

	if (customMealsString != null){ //
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
  ingredients: [{ name: "Pasta", amount: "1 cup", brand: "Priano", aldiProduct: true }],
  steps: ["Cook pasta"],
  mealPrep: false
}

saveCustomMeal(testMeal);
console.log(getCustomMeals());
