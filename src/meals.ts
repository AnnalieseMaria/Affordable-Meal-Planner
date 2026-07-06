export type Ingredient = {
  ingredientId: number
  name: string
  brandName: string
  comparisonPriceUnit: string
  usaSnapEligible: boolean
  formattedPrice: string
  categoryName: string
  mainCategoryName: string
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

  servingsPerContainer: number | null
  servingSize: number | null
  servingUnit: "1/4 tsp" | "1/2 tsp" | "3/4 tsp" | "tsp" | "tbsp" | "1/4 cup" | "1/2 cup" | "3/4 cup" | "cup" | "fl oz" | "oz" | "g" | "can" | "slice" |  "tortilla" | "egg" |null
  servingDisplay: string | null
}

export type MealIngredient = {
  name: string
  amountInfo: amountInfo
  aldiProduct: boolean
  ingredientId: number | null
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
  recipeServings: number
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

type amountInfo = {
  size: number,
  unit: "1/4 tsp" | "1/2 tsp" | "3/4 tsp" | "tsp" | "tbsp" | "1/4 cup" | "1/2 cup" | "3/4 cup" | "cup" | "fl oz" | "oz" | "tortilla" | "can" | "stalk"
}

//Consider how i might account for fl oz. conversion function? insert manually to units? 
