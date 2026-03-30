import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import path from 'path';
import {
  UsdaFoodRecord,
  UsdaNutrientEntry,
  UsdaPortionEntry,
} from '@/models/nutrition/usda/usda-food-models';

const BASE_DIR = process.env.USDA_CSV_DIR ?? './src/data/usda';
const FOUNDATION_DIR = path.join(BASE_DIR, 'foundation');
const SR_LEGACY_DIR = path.join(BASE_DIR, 'sr_legacy');

function streamCsv<T>(dir: string, filename: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    createReadStream(path.join(dir, filename))
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row: T) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Load and join the four CSVs from a single dataset directory
 * into a Map<fdcId, UsdaFoodRecord>.
 */
async function loadDataset(dir: string): Promise<Map<number, UsdaFoodRecord>> {
  const [foods, rawNutrients, foodNutrients, portions] = await Promise.all([
    streamCsv<{ fdc_id: string; description: string; data_type: string }>(dir, 'food.csv'),
    streamCsv<{ id: string; name: string; unit_name: string; nutrient_nbr: string }>(
      dir,
      'nutrient.csv'
    ),
    streamCsv<{ fdc_id: string; nutrient_id: string; amount: string }>(dir, 'food_nutrient.csv'),
    streamCsv<{ fdc_id: string; amount: string; modifier: string; gram_weight: string }>(
      dir,
      'food_portion.csv'
    ),
  ]);

  const nutrientDefs = new Map(rawNutrients.map(n => [n.id, n]));

  const nutrientsByFood = new Map<number, Map<string, UsdaNutrientEntry>>();
  for (const fn of foodNutrients) {
    const fdcId = Number(fn.fdc_id);
    const def = nutrientDefs.get(fn.nutrient_id);
    if (!def) continue;
    if (!nutrientsByFood.has(fdcId)) nutrientsByFood.set(fdcId, new Map());
    nutrientsByFood.get(fdcId)!.set(def.nutrient_nbr, {
      name: def.name,
      amount: parseFloat(fn.amount) || 0,
      unitName: def.unit_name,
      nutrientNbr: def.nutrient_nbr,
    });
  }

  const portionsByFood = new Map<number, UsdaPortionEntry[]>();
  for (const p of portions) {
    const fdcId = Number(p.fdc_id);
    if (!portionsByFood.has(fdcId)) portionsByFood.set(fdcId, []);
    portionsByFood.get(fdcId)!.push({
      modifier: p.modifier,
      gramWeight: parseFloat(p.gram_weight) || 0,
    });
  }

  const foodMap = new Map<number, UsdaFoodRecord>();
  for (const f of foods) {
    const fdcId = Number(f.fdc_id);
    foodMap.set(fdcId, {
      fdcId,
      description: f.description,
      dataType: f.data_type,
      nutrients: nutrientsByFood.get(fdcId) ?? new Map(),
      portions: portionsByFood.get(fdcId) ?? [],
    });
  }

  return foodMap;
}

/**
 * Load both datasets and merge. Foundation wins on duplicate fdcId —
 * SR Legacy entries are only added when no Foundation entry exists.
 */
export async function loadFoodData(): Promise<Map<number, UsdaFoodRecord>> {
  const [foundation, srLegacy] = await Promise.all([
    loadDataset(FOUNDATION_DIR),
    loadDataset(SR_LEGACY_DIR),
  ]);

  const merged = new Map(foundation);
  for (const [fdcId, record] of srLegacy) {
    if (!merged.has(fdcId)) merged.set(fdcId, record);
  }

  return merged;
}
