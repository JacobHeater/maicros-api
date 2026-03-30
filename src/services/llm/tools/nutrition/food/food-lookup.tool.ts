// tools/food-lookup.tool.ts
import { Injectable } from '@nestjs/common';
import { BaseTool, ToolDefinition } from '../../tools.interfaces';
import { FoodService } from '@/services/nutrition/food/food.service';
import { NUTRIENT } from '@/models/nutrition/nutrition-constants';

@Injectable()
export class FoodLookupTool extends BaseTool {
  constructor(private readonly foodService: FoodService) {
    super();
  }

  definition: ToolDefinition = {
    name: 'lookup_food',
    description:
      'Search the USDA database for a food item by name. ' +
      'Provide amount_description when the user specifies a quantity — this returns scaled values ' +
      'and avoids a separate calculation step.',
    parameters: {
      type: 'object',
      properties: {
        food_name: {
          type: 'string',
          description: 'Food name to look up, e.g. "chicken breast" or "cooked brown rice"',
        },
        amount_description: {
          type: 'string',
          description: 'Optional amount consumed, e.g. "200g", "1 cup", "3 oz". Omit if unknown.',
        },
      },
      required: ['food_name'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const matches = await this.foodService.searchFood(args.food_name as string);
    if (!matches.length) return { error: `No USDA match found for "${args.food_name}"` };

    const { food, score } = matches[0];
    const n = (nbr: string) => this.foodService.getNutrient(food, nbr)?.amount ?? 0;

    const result: Record<string, unknown> = {
      fdcId: food.fdcId,
      name: food.description,
      matchScore: +score.toFixed(3),
      per100g: {
        calories: n(NUTRIENT.ENERGY),
        protein_g: n(NUTRIENT.PROTEIN),
        carbs_g: n(NUTRIENT.CARBS),
        fat_g: n(NUTRIENT.FAT),
        fiber_g: n(NUTRIENT.FIBER),
        sugar_g: n(NUTRIENT.SUGAR),
        sodium_mg: n(NUTRIENT.SODIUM),
        calcium_mg: n(NUTRIENT.CALCIUM),
        iron_mg: n(NUTRIENT.IRON),
        vitamin_c_mg: n(NUTRIENT.VITAMIN_C),
        vitamin_d_mcg: n(NUTRIENT.VITAMIN_D),
      },
      knownPortions: food.portions.slice(0, 4).map(p => ({
        description: p.modifier,
        grams: p.gramWeight,
      })),
    };

    if (args.amount_description) {
      const grams = this.foodService.resolveGrams(food, args.amount_description as string);
      const s = (nbr: string) => this.foodService.scaleNutrient(food, nbr, grams);
      result.forAmount = {
        description: args.amount_description,
        grams,
        calories: s(NUTRIENT.ENERGY),
        protein_g: s(NUTRIENT.PROTEIN),
        carbs_g: s(NUTRIENT.CARBS),
        fat_g: s(NUTRIENT.FAT),
        fiber_g: s(NUTRIENT.FIBER),
        sugar_g: s(NUTRIENT.SUGAR),
        sodium_mg: s(NUTRIENT.SODIUM),
      };
    }

    return result;
  }
}
