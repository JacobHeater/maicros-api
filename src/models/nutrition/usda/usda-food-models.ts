export interface UsdaFoodRecord {
  fdcId: number;
  description: string;
  dataType: string;
  nutrients: Map<string, UsdaNutrientEntry>; // keyed by nutrient_nbr for O(1) lookup
  portions: UsdaPortionEntry[];
}

export interface UsdaNutrientEntry {
  name: string;
  amount: number; // Always per 100g
  unitName: string;
  nutrientNbr: string;
}

export interface UsdaPortionEntry {
  modifier: string; // e.g. "1 cup", "1 oz", "1 tbsp"
  gramWeight: number;
}

export interface UsdaVectorEntry {
  fdcId: number;
  vector: number[];
}

export interface UsdaFoodMatch {
  food: UsdaFoodRecord;
  score: number; // cosine similarity 0–1
}
