import Database from 'better-sqlite3';
import path from 'path';
import { OnServiceInit, ServiceBase } from '../service-base';
import { Injectable } from '../injectable';

export interface FoodRecord {
  id: number;
  code: string | null;
  productName: string;
  categories: string | null;
  servingSize: string | null;
  countries: string | null;
  energyKcal: number | null;
  proteinsG: number | null;
  carbohydratesG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumG: number | null;
  sugarsG: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminDMcg: number | null;
}

export interface FoodSearchResult {
  food: FoodRecord;
  rank: number; // FTS5 rank — lower is better (negative float)
}

interface RawRow {
  id: number;
  code: string | null;
  product_name: string;
  categories: string | null;
  serving_size: string | null;
  countries: string | null;
  energy_kcal: number | null;
  proteins_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_g: number | null;
  sugars_g: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  vitamin_d_mcg: number | null;
  rank?: number;
}

function mapRow(row: RawRow): FoodRecord {
  return {
    id: row.id,
    code: row.code,
    productName: row.product_name,
    categories: row.categories,
    servingSize: row.serving_size,
    countries: row.countries,
    energyKcal: row.energy_kcal !== null ? +row.energy_kcal.toFixed(2) : null,
    proteinsG: row.proteins_g !== null ? +row.proteins_g.toFixed(2) : null,
    carbohydratesG: row.carbohydrates_g !== null ? +row.carbohydrates_g.toFixed(2) : null,
    fatG: row.fat_g !== null ? +row.fat_g.toFixed(2) : null,
    fiberG: row.fiber_g !== null ? +row.fiber_g.toFixed(2) : null,
    sodiumG: row.sodium_g !== null ? +row.sodium_g.toFixed(2) : null,
    sugarsG: row.sugars_g !== null ? +row.sugars_g.toFixed(2) : null,
    calciumMg: row.calcium_mg !== null ? +row.calcium_mg.toFixed(2) : null,
    ironMg: row.iron_mg !== null ? +row.iron_mg.toFixed(2) : null,
    vitaminDMcg: row.vitamin_d_mcg !== null ? +row.vitamin_d_mcg.toFixed(4) : null,
  };
}

@Injectable()
export class FoodService extends ServiceBase implements OnServiceInit {
  private db!: Database.Database;

  private stmtFtsSearch: Database.Statement;
  private stmtFtsSearchWithNutrients: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtGetByCode: Database.Statement;

  async onServiceInit() {
    const dbPath =
      process.env.OFF_DB_PATH ??
      path.join(process.cwd(), 'src', 'data', 'open-food-facts', 'products.db');

    this.db = new Database(dbPath, { readonly: true });
    this.db.pragma('journal_mode = WAL');

    // Prepare statements once at startup — better-sqlite3 reuses them efficiently
    this.stmtFtsSearch = this.db.prepare(`
      SELECT p.*, f.rank
      FROM products_fts f
      JOIN products p ON p.id = f.rowid
      WHERE products_fts MATCH ?
      ORDER BY f.rank
      LIMIT ?
    `);

    // Same as above but requires at least one macro to be non-null.
    // Used when the agent needs nutritional data, not just a name match.
    this.stmtFtsSearchWithNutrients = this.db.prepare(`
      SELECT p.*, f.rank
      FROM products_fts f
      JOIN products p ON p.id = f.rowid
      WHERE products_fts MATCH ?
        AND p.energy_kcal IS NOT NULL
      ORDER BY f.rank
      LIMIT ?
    `);

    this.stmtGetById = this.db.prepare(`
      SELECT * FROM products WHERE id = ?
    `);

    this.stmtGetByCode = this.db.prepare(`
      SELECT * FROM products WHERE code = ? LIMIT 1
    `);

    this.logger.log(`FoodService ready: ${dbPath}`);
  }

  /**
   * Full-text search using FTS5.
   * Builds a quoted phrase query first for precision, falls back to
   * individual token query for broader recall if no results are found.
   *
   * @param query     Natural language food description
   * @param limit     Max results to return
   * @param requireNutrients  If true, only return records with calorie data
   */
  search(query: string, limit = 5, requireNutrients = true): FoodSearchResult[] {
    const stmt = requireNutrients ? this.stmtFtsSearchWithNutrients : this.stmtFtsSearch;

    // Try quoted phrase first — highest precision
    const phraseQuery = `"${query.replace(/"/g, '')}"`;
    let rows = stmt.all(phraseQuery, limit) as RawRow[];

    // Fall back to AND of individual tokens for broader recall
    // Final fallback: OR match across all tokens.
    // FTS5 BM25 ranking will automatically float items that match
    // the most tokens (e.g. "sausage patty") to the top.
    if (rows.length === 0) {
      const orQuery = query
        .trim()
        .split(/\s+/)
        .filter(t => t.length > 1)
        .map(t => t.replace(/[^a-z0-9]/gi, ''))
        .filter(Boolean)
        .join(' OR ');

      if (orQuery) {
        rows = stmt.all(orQuery, limit) as RawRow[];
      }
    }

    // Final fallback: prefix match on first significant token
    if (rows.length === 0) {
      const firstToken = query
        .trim()
        .split(/\s+/)[0]
        ?.replace(/[^a-z0-9]/gi, '');
      if (firstToken && firstToken.length > 2) {
        rows = stmt.all(`${firstToken}*`, limit) as RawRow[];
      }
    }

    return rows.map(row => ({
      food: mapRow(row),
      rank: row.rank ?? 0,
    }));
  }

  /**
   * Exact lookup by internal SQLite row id.
   * Used after a user food has been matched and persisted — no search needed.
   */
  getById(id: number): FoodRecord | undefined {
    const row = this.stmtGetById.get(id) as RawRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  /**
   * Lookup by product barcode (UPC/EAN).
   * Used by the UPC barcode flow after an OFF API lookup returns a code.
   */
  getByCode(code: string): FoodRecord | undefined {
    const row = this.stmtGetByCode.get(code) as RawRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  /**
   * Scale a nutrient value from per-100g to a target gram weight.
   */
  scaleNutrient(per100g: number | null, grams: number): number | null {
    if (per100g === null) return null;
    return +((per100g * grams) / 100).toFixed(2);
  }

  /**
   * Resolve a natural language portion description to grams.
   * Parses numeric values from strings like "200g", "1 cup (240ml)", "3 oz".
   * Returns 100 as a safe default when no number can be parsed.
   */
  resolveGrams(portionDescription: string): number {
    // Prefer explicit gram value in parentheses — handles "1 roll (60g)", "1 tsp (5g)" etc.
    // This prevents "1 roll (60g)" from resolving to 1 by grabbing the first number.
    const parenGrams = portionDescription.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
    if (parenGrams) return parseFloat(parenGrams[1]);

    const match = portionDescription.match(/[\d.]+/);
    if (!match) return 100;

    const value = parseFloat(match[0]);
    if (isNaN(value)) return 100;

    const lower = portionDescription.toLowerCase();

    // Convert common non-gram units to grams
    if (lower.includes('oz')) return +(value * 28.3495).toFixed(1);
    if (lower.includes('lb')) return +(value * 453.592).toFixed(1);
    if (lower.includes('ml')) return value; // 1ml ≈ 1g for most foods
    if (lower.includes('cup')) return +(value * 240).toFixed(1);
    if (lower.includes('tbsp') || lower.includes('tablespoon')) return +(value * 15).toFixed(1);
    if (lower.includes('tsp') || lower.includes('teaspoon')) return +(value * 5).toFixed(1);

    // Assume grams if no unit or explicit 'g'
    return value;
  }

  close() {
    this.db?.close();
  }
}
