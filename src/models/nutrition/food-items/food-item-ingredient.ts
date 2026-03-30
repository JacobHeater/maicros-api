import { CrudIdentity } from "../../crud-identity";
import { CrudTimes } from "../../crud-times";
import { Entity } from "../../entity";

export interface FoodItemIngredient extends Entity, CrudTimes, CrudIdentity {
  foodItemId: string;
  name: string;
}
