import { FoodService, FoodRecord } from '@/services/nutrition/food.service';
import { Injectable } from '@/services/injectable';
import { BaseTool, ToolDefinition } from '../../tools.interfaces';

@Injectable()
export class FoodLookupTool extends BaseTool {
  constructor(private readonly foodService: FoodService) {
    super();
  }

  definition: ToolDefinition = {
    name: 'lookup_food',
    description:
      'Search the Open Food Facts database for a single food item by name. ' +
      'Call this once per food item — do not combine multiple foods into one call. ' +
      'Provide amount_description when an amount is known (explicit or inferred).',
    parameters: {
      type: 'object',
      properties: {
        food_name: {
          type: 'string',
          description: 'Single food item to look up, e.g. "grilled chicken breast"',
        },
        search_term: {
          type: 'string',
          description: 'Optimized search term, e.g. "chicken breast"',
        },
        amount_description: {
          type: 'string',
          description:
            'Amount consumed, e.g. "200g", "1 tsp (5g)", "1 cup". Omit if truly unknown.',
        },
      },
      required: ['food_name'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const rawFoodName = args.food_name as string;
    // Safely grab the pre-calculated search term, fallback to raw name if missing
    const searchTerm = (args.search_term as string) || rawFoodName;

    this.logger.debug(`Searching: "${rawFoodName}" → normalized: "${searchTerm}"`);

    // 1. Search using the optimized term
    let results = this.foodService.search(searchTerm, 5, true);

    // 2. If no results, and the search term was different, fallback to the raw name
    if (!results.length && searchTerm !== rawFoodName) {
      this.logger.debug(`No match for "${searchTerm}", falling back to "${rawFoodName}"`);
      results = this.foodService.search(rawFoodName, 5, true);
    }

    if (!results.length) {
      return { error: `No database match found for "${rawFoodName}"` };
    }

    const { food, rank } = results[0];
    this.logger.debug(`Top match: "${food.productName}" (rank: ${rank})`);

    const result: Record<string, unknown> = {
      id: food.id,
      name: food.productName,
      code: food.code,
      per100g: this.buildNutrients(food),
      servingSize: food.servingSize ?? null,
    };

    if (args.amount_description) {
      // Strip leading asterisk that may have been injected by the decomposed
      // food list's inferred-amount flag before resolving to grams
      const amountRaw = (args.amount_description as string).replace(/^\*\s*/, '').trim();
      const grams = this.foodService.resolveGrams(amountRaw);
      result.forAmount = {
        description: amountRaw,
        grams,
        ...this.buildScaledNutrients(food, grams),
      };
    }

    return result;
  }

  private buildNutrients(food: FoodRecord): Record<string, number | null> {
    return {
      calories: food.energyKcal,
      protein_g: food.proteinsG,
      carbs_g: food.carbohydratesG,
      fat_g: food.fatG,
      fiber_g: food.fiberG,
      sugar_g: food.sugarsG,
      sodium_mg: food.sodiumG !== null ? +(food.sodiumG * 1000).toFixed(2) : null,
      calcium_mg: food.calciumMg,
      iron_mg: food.ironMg,
      vitamin_d_mcg: food.vitaminDMcg,
    };
  }

  private buildScaledNutrients(food: FoodRecord, grams: number): Record<string, number | null> {
    const s = (val: number | null) => this.foodService.scaleNutrient(val, grams);
    return {
      calories: s(food.energyKcal),
      protein_g: s(food.proteinsG),
      carbs_g: s(food.carbohydratesG),
      fat_g: s(food.fatG),
      fiber_g: s(food.fiberG),
      sugar_g: s(food.sugarsG),
      sodium_mg:
        food.sodiumG !== null ? this.foodService.scaleNutrient(food.sodiumG * 1000, grams) : null,
    };
  }
}
