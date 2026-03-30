import fs from 'fs';
import path from 'path';
import { loadFoodData } from '../src/data/usda/csv/csv-loader';
import { OllamaEmbeddingResponse } from '@/services/nutrition/embedding/embedding.service';

const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const OUT =
  process.env.USDA_VECTOR_FILE || path.join(process.cwd(), 'src', 'data', 'usda', 'vector.json');

async function embed(text: string) {
  const res = await fetch(`${BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });
  const data = (await res.json()) as OllamaEmbeddingResponse;
  return data.embedding;
}

async function embedBatch(texts: string[], concurrency = 10) {
  const results = new Array(texts.length);
  let idx = 0;
  const worker = async () => {
    while (idx < texts.length) {
      const i = idx++;
      results[i] = await embed(texts[i]);
      if (i % 500 === 0) console.log(`Embedded ${i}/${texts.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

(async () => {
  const foods = await loadFoodData();
  const entries = [...foods.values()];
  console.log(`Embedding ${entries.length} food descriptions...`);
  const vectors = await embedBatch(
    entries.map(f => f.description),
    20
  );
  const out = entries.map((f, i) => ({ fdcId: f.fdcId, vector: vectors[i] }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${out.length} vectors to ${OUT}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
