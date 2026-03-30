/**
 * Macronutrients (all values in grams).
 *
 * Calories are not stored on the model and MUST be derived from the
 * macronutrients using the rule:
 *   calories = carbohydrates * 4 + protein * 4 + fat * 9
 */
export interface Macronutrients {
  carbohydrates: number;
  fat: number;
  protein: number;
}
