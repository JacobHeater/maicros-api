# mAIcros � Local Nutrition Intelligence (NestJS, zero hosted LLM APIs)

This guide is a complete 0?100 path for `mAIcros` using NestJS and local open-source models. It assumes no prior AI/cloud experience.

## 1) Goal: what you�re building
- `POST /analyze` accepts meal items (`name`, `grams`) and optionally macro targets.
- Backend returns deterministic macro totals (protein/carbs/fat/calories).
- Backend also returns recommender suggestions via local model + retrieval context.
- No OpenAI/Claude/Google API keys, no pay-as-you-go.

## 2) Project state: blank slate in your repo
You already have `package.json`, `src/`, and `README.md`. We�ll add:
- `src/analyze/analyze.controller.ts`
- `src/analyze/analyze.service.ts`
- `src/data/data.service.ts`
- `src/vector/embeddings.service.ts`
- `src/models/llm.service.ts`
- `data/nutrition.jsonl` sample
- `implementation.md` (this file)

## 3) Install prerequisites (Windows instructions)
1. Node 20+ and npm installed.
2. Nest CLI:
   - `npm install -g @nestjs/cli`
3. Create / confirm Nest project:
   - `nest new .` (if empty folder) or if already has code continue.
4. Core dependencies:
   - `npm install @nestjs/config @nestjs/common @nestjs/core @nestjs/platform-express`.
5. Local compute dependencies (NestJS-only, no Python):
   - `npm install @xenova/transformers onnxruntime-node @types/node`.
   - `npm install @huggingface/tokenizers` (optional for robust tokenizer performance).

> Note: This guide avoids Python entirely and keeps the pipeline within Node/NestJS.
## 4) Nutrition data source collection (manual beginner style)
1. Download a small subset from USDA FoodData Central (CSV): https://fdc.nal.usda.gov/download-datasets.html
2. Or OpenFoodFacts CSV: https://world.openfoodfacts.org/data
3. Create `data/nutrition.csv` with columns: `id,name,protein,carbs,fat,calories` (per 100g).
4. Optional quick hand-made sample in `data/nutrition.jsonl`:
   ```jsonl
   {"id":"chicken_breast","name":"chicken breast","per100g":{"protein":31,"carbs":0,"fat":3.6,"calories":165}}
   {"id":"brown_rice","name":"brown rice","per100g":{"protein":2.6,"carbs":23,"fat":1.9,"calories":111}}
   {"id":"broccoli","name":"broccoli","per100g":{"protein":2.8,"carbs":7,"fat":0.4,"calories":34}}
   ```

## 5) Data prep service (NestJS) with deterministic calc
In `src/data/data.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';

export interface FoodItem { id: string; name: string; per100g: { protein: number; carbs: number; fat: number; calories: number; }; }

@Injectable()
export class DataService {
  private items: FoodItem[] = [];

  loadData(filePath = 'data/nutrition.jsonl') {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    this.items = raw.split('\n').map((line) => JSON.parse(line));
  }

  normalize(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  }

  getAll() { return this.items; }

  findExact(name: string) {
    const key = this.normalize(name);
    return this.items.find((i) => this.normalize(i.name) === key);
  }

  calculateMacros(entries: Array<{name: string; grams: number}>) {
    const result = { protein: 0, carbs: 0, fat: 0, calories: 0, matches: [] as any[] };
    for (const item of entries) {
      const match = this.findExact(item.name);
      if (!match) continue;
      const ratio = item.grams / 100;
      const macros = {
        name: item.name,
        matchedAs: match.name,
        grams: item.grams,
        protein: Number((match.per100g.protein * ratio).toFixed(2)),
        carbs: Number((match.per100g.carbs * ratio).toFixed(2)),
        fat: Number((match.per100g.fat * ratio).toFixed(2)),
        calories: Number((match.per100g.calories * ratio).toFixed(2)),
      };
      result.protein += macros.protein;
      result.carbs += macros.carbs;
      result.fat += macros.fat;
      result.calories += macros.calories;
      result.matches.push(macros);
    }
    result.protein = Number(result.protein.toFixed(2));
    result.carbs = Number(result.carbs.toFixed(2));
    result.fat = Number(result.fat.toFixed(2));
    result.calories = Number(result.calories.toFixed(2));
    return result;
  }
}
```

## 6) Add vector-based semantic matching (Node-only)
### Option A: in-memory embeddings + cosine similarity (good enough for 
small datasets)
- Use `@xenova/transformers` to create embedding vectors from the item names.
- Build a small in-memory vector store in Nest; no external process.

### Option B: local persistent vector store with `@chroma/core` (JS compatible)
- `npm install @chroma/core`.
- Store vectors in local disk and query fast.

### Recommended path for NestJS-only implementation (start simple)
1. During startup, load `data/nutrition.jsonl` in `DataService`.
2. In `EmbeddingsService`, encode each item name using the same model.
3. Save each vector in memory (or Chroma local collection) with `id` and `metadata`.
4. Query with cosine similarity to find top matches for user `item.name`.
5. Return nearest items to the analyzer.

## 7) Retriever service (Node vector store)
In `src/vector/embeddings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataService, FoodItem } from '../data/data.service';
import { pipeline } from '@xenova/transformers';

interface VectorItem { id: string; name: string; per100g: FoodItem['per100g']; vector: number[]; }

@Injectable()
export class EmbeddingsService {
  private model: any;
  private vectorStore: VectorItem[] = [];

  constructor(private readonly dataService: DataService) {}

  async init() {
    this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    const items = this.dataService.getAll();
    this.vectorStore = await Promise.all(items.map(async (item) => ({
      ...item,
      vector: (await this.model(item.name)) as number[],
    })));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
  }

  async findNearest(name: string, k = 3) {
    const queryVec = (await this.model(name)) as number[];
    const ranked = this.vectorStore
      .map((item) => ({ item, score: this.cosineSimilarity(queryVec, item.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => ({ id: x.item.id, name: x.item.name, score: x.score, per100g: x.item.per100g }));

    return ranked;
  }
}
```

## 8) Local LLM: take model from web and run with llama.cpp
### Step A: get model files
1. Go to Hugging Face and search: `gguf`, `llama`, `mistral`, `h2oai`, `guanaco`. Example: `https://huggingface.co/TheBloke/llama-2-7b-chat-hf`.
2. Download a quantized CPU-friendly GGUF if CPU-only (`7B` or smaller).
3. Place in `models/`.

### Step B: install and run llama-server
1. Clone `https://github.com/juncongmoo/llama.cpp` or modern fork.
2. `cd llama.cpp; mkdir build; cd build; cmake ..; cmake --build .` (Windows with clang/mingw or WSL recommended).
3. Download `llama-server` from https://github.com/juncongmoo/llama.cpp/tree/master/examples/llama-server.
4. Start: `llama-server.exe --model ../models/your-model.gguf --port 8080`.
5. Validate: `curl http://localhost:8080/v1/models`.

### Step C: local call from Nest
In `src/models/llm.service.ts`:

```ts
import { Injectable, HttpService } from '@nestjs/common';

@Injectable()
export class LLMService {
  constructor(private readonly httpService: HttpService) {}

  async generate(prompt: string) {
    const response = await this.httpService.post('http://localhost:8080/v1/chat/completions', {
      model: 'gpt-4o-mini', // llama-server maps this. refer docs.
      messages: [{role:'user', content: prompt}],
      max_tokens: 300,
    }).toPromise();

    return response.data.choices?.[0]?.message?.content ?? 'No response';
  }
}
```

> If HttpModule is not enabled, add `HttpModule.register({ timeout: 60000, maxRedirects: 5 })` in module.

## 9) Combine in analysis controller
In `src/analyze/analyze.controller.ts`:

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { DataService } from '../data/data.service';
import { EmbeddingsService } from '../vector/embeddings.service';
import { LLMService } from '../models/llm.service';

@Controller('analyze')
export class AnalyzeController {
  constructor(
    private readonly dataService: DataService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly llmService: LLMService,
  ) {
    this.dataService.loadData();
  }

  @Post()
  async analyze(@Body() body: { items: {name:string;grams:number}[]; targets?: any }) {
    const totals = this.dataService.calculateMacros(body.items);

    const matchedItems = await Promise.all(body.items.map(async (it) => {
      const nearest = await this.embeddingsService.findNearest(it.name, 3);
      return { item: it, nearest };
    }));

    const contextText = matchedItems
      .map((m) => `${m.item.name} -> ${m.nearest[0].name} (${m.nearest[0].distance.toFixed(3)})`)
      .join('\n');

    const modelPrompt = `Meal items:\n${JSON.stringify(body.items)}\nTotals:\n${JSON.stringify(totals)}\nMatches:\n${contextText}\n\nGive three simple nutrition adjustment recommendations in plain text.`;

    const suggestions = await this.llmService.generate(modelPrompt);

    return { totals, matchedItems, suggestions };
  }
}
```

### 10) Add module bindings
In `src/app.module.ts`:

```ts
import { Module, HttpModule } from '@nestjs/common';
import { AnalyzeController } from './analyze/analyze.controller';
import { DataService } from './data/data.service';
import { EmbeddingsService } from './vector/embeddings.service';
import { LLMService } from './models/llm.service';

@Module({
  imports: [HttpModule],
  controllers: [AnalyzeController],
  providers: [DataService, EmbeddingsService, LLMService],
})
export class AppModule {}
```

## 11) Run and test
1. `npm run start:dev`
2. Request:
   ```bash
   curl -X POST http://localhost:3001/analyze -H 'Content-Type: application/json' -d '{"items":[{"name":"chicken breast","grams":150},{"name":"brown rice","grams":100}],"targets":{"protein":150}}'
   ```
3. Validate numeric totals + LLM suggestions appear.

## 12) Hardening and evaluation
- Add unit tests (`jest`) for `calculateMacros` with known truth values.
- Add sanitization: max 1000g per item, non-empty names.
- Add disclaimers: quotes `not medical advice`.

## 13) Optional: pure Nest-only embeddings (no Python)
- Use `@xenova/transformers`, `onnxruntime-node` + `@chroma/core` if available.
- Or start with simple string similarity as fallback (Levenshtein, cosine on TF-IDF) then replace with vector store later.

## 14) Where to get a model for nutrition recommendations
1. `llama.cpp` ecosystem: choose models tagged `gguf` and `chat`.
2. Work with 7B/13B quantized models for CPU (no GPU). Example: `TheBloke/airoboros-l2-7b-patch`.
3. For stronger results, use 7B with full context and 2-shot examples in prompt.
4. For final project, consider 13B+ in GPU host (`t4`/`a10`) but still self-hosted.

## 15) Optional schedule (milestones)
1. Day 1: get sample data + deterministic macros working.
2. Day 2: add nearest-match retrieval + fix query mapping.
3. Day 3: launch llama-server and integrate `llm.service`.
4. Day 4-5: prompt engineering + tests + API docs.

## 16) Notes
- This guide intentionally says �start stupid� by giving exact commands and exact file snippets.
- Use local modelserver and keep data on disk; at no point you need cloud API keys.
- Continue by adding a next endpoint `POST /analyze/batch` in the same pattern.
