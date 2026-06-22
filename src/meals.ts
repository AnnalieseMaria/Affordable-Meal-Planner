export type Ingredient = {
  ingredientId: number
  name: string
  brandName: string
  comparisonPriceUnit: string
  urlSlugText: string
  productConcreteSku: string
  usaSnapEligible: boolean
  formattedPrice: string
  preFormattedUnitContent: string
  categoryName: string
  categoryKey: string
  mainCategoryName: string
  mainCategoryKey: string
  isMeat: boolean
  isFish: boolean
  isDairy: boolean
  isEgg: boolean
  containsGluten: boolean
  containsNuts: boolean
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  nutritionFlagged: boolean
}

export type MealIngredient = {
  name: string
  amount: string
  brand: string
  aldiProduct: boolean
}

type Nutrition = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
}

export type Meal = {
  recipeId: number
  name: string
  culturalName: string | null
  cuisine: string
  region: string
  mealType: string[]
  complexity: string
  prepTimeMinutes: number
  dietType: string[]
  nutritionHighlights: string[]
  estimatedNutrition: Nutrition
  hasNonAldiIngredients: boolean
  culturalContext: { origin: string; context: string } | null
  ingredients: MealIngredient[]
  steps: string[]
  mealPrep: boolean
}
