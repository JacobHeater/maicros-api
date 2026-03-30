import { Entity } from "../../entity";
import { FoodItemIngredient } from "./food-item-ingredient";
import { Macronutrients } from "../macronutrients";
import { Micronutrients } from "../micronutrients";
import { FoodItemAllergen } from "./food-item-allergen";
import { CrudTimes } from "../../crud-times";
import { CrudIdentity } from "../../crud-identity";

export interface FoodItem extends Entity, CrudTimes, CrudIdentity, Macronutrients, Micronutrients {
  name: string;
  manufacturer: string;
  description?: string;
  saturatedFat?: number;
  transFat?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  cholesterol?: number;
  fiber: number;
  sugar?: number;
  addedSugar?: number;
  sugarAlcohol?: number;
  servingSize: number;
  servingUnit: string;
  weightPerServing: number;
  ingredients: FoodItemIngredient[];
  category?: string;
  upc?: string;
  allergens: FoodItemAllergen[];
  isVegan?: boolean;
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
  isOrganic?: boolean;
}
