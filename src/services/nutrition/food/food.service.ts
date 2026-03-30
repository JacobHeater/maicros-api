// nutrition/food.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import {
  UsdaFoodMatch,
  UsdaFoodRecord,
  UsdaNutrientEntry,
  UsdaVectorEntry,
} from '@/models/nutrition/usda/usda-food-models';
import { loadFoodData } from '@/data/usda/csv/csv-loader';
import fs from 'fs';
import path from 'path';

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class FoodService implements OnModuleInit {
  private readonly logger = new Logger(FoodService.name);
  private foodIndex = new Map<number, UsdaFoodRecord>();
  private vectorIndex: UsdaVectorEntry[] = [];

  constructor(private readonly embedding: EmbeddingService) {}

  async onModuleInit() {
    this.foodIndex = await loadFoodData();
    this.vectorIndex = await this.loadVectors();
    this.logger.log(`Ready: ${this.foodIndex.size} foods, ${this.vectorIndex.length} vectors`);
  }

  private async loadVectors(): Promise<UsdaVectorEntry[]> {
    // Prefer a precomputed vectors file for reproducible artifacts
    const vectorPath = process.env.USDA_VECTOR_FILE ?? './src/data/usda/vector.json';
    // Require a precomputed vectors file in production. Fail fast if missing.
    try {
      const resolved = path.isAbsolute(vectorPath)
        ? vectorPath
        : path.join(process.cwd(), vectorPath);
      const raw = fs.readFileSync(resolved, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as UsdaVectorEntry[];
      throw new Error('Vector file invalid format: expected array');
    } catch (err) {
      this.logger.error(
        `Precomputed vector file not found or invalid at ${vectorPath}. Generate it with npm run gen:vectors and set USDA_VECTOR_FILE if located elsewhere.`
      );
      throw err;
    }
  }

  async searchFood(query: string, limit = 5): Promise<UsdaFoodMatch[]> {
    // Prefer vector search when available, but fall back to simple text matching
    try {
      const queryVector = await this.embedding.embed(query);
      if (this.vectorIndex.length > 0) {
        return this.vectorIndex
          .map(entry => ({
            fdcId: entry.fdcId,
            score: this.embedding.cosineSimilarity(queryVector, entry.vector),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ fdcId, score }) => ({ food: this.foodIndex.get(fdcId)!, score }))
          .filter(m => m.food !== undefined);
      }
    } catch (err) {
      this.logger.debug('Embedding search failed, falling back to text match.');
    }

    // Text fallback: build a fuzzy-ish matcher using token matching and a
    // relaxed ordered-regex. Score by number of matched tokens so we can
    // return the best candidates.
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 0)
      .map(t => t.replace(/[^a-z0-9]/g, ''));

    if (tokens.length === 0) return [];

    const orderedRegex = new RegExp(tokens.map(t => escapeRegex(t)).join('.*'), 'i');

    const scored: UsdaFoodMatch[] = [];
    for (const food of this.foodIndex.values()) {
      const desc = food.description || '';
      const lower = desc.toLowerCase();

      // quick contains check first
      let score = 0;
      for (const t of tokens) if (lower.includes(t)) score++;

      // bump score if tokens appear in order
      if (score > 0 && orderedRegex.test(desc)) score += 2;

      if (score > 0) scored.push({ food, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  getFoodById(fdcId: number): UsdaFoodRecord | undefined {
    return this.foodIndex.get(fdcId);
  }

  getNutrient(food: UsdaFoodRecord, nbr: string): UsdaNutrientEntry | undefined {
    return food.nutrients.get(nbr);
  }

  scaleNutrient(food: UsdaFoodRecord, nbr: string, grams: number): number {
    const n = food.nutrients.get(nbr);
    return n ? +((n.amount * grams) / 100).toFixed(2) : 0;
  }

  resolveGrams(food: UsdaFoodRecord, portionDescription: string): number {
    const normalized = portionDescription.toLowerCase().trim();
    const match = food.portions.find(
      p =>
        p.modifier.toLowerCase().includes(normalized) ||
        normalized.includes(p.modifier.toLowerCase())
    );
    if (match) return match.gramWeight;
    const parsed = parseFloat(normalized.replace(/[^\d.]/g, ''));
    return isNaN(parsed) ? 100 : parsed;
  }
}
