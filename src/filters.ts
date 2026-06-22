import type { Meal } from './meals.ts'

export type Filters = {
  cuisine: string | null
  dietType: string | null
}

export function filterMeals(meals: Meal[], filters: Filters): Meal[] {
  return meals.filter(meal => {
    if (filters.cuisine && meal.cuisine !== filters.cuisine) return false
    if (filters.dietType && !meal.dietType.includes(filters.dietType)) return false
    return true //returning true means meal passed both checks and stays in results array
  })
}


