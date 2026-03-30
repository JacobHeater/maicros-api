import { AgentRunResult, AgentService } from '@/services/llm/agent/agent.service';
import { LLMService } from '@/services/llm/llm.service';
import { FoodLookupTool } from '@/services/llm/tools/nutrition/food/food-lookup.tool';
import { ToolRegistry } from '@/services/llm/tools/tool-registry.service';
import { EmbeddingService } from '@/services/nutrition/embedding/embedding.service';
import { FoodService } from '@/services/nutrition/food/food.service';

const testCases = [
  {
    input: '200g of oatmeal with 30g of almonds',
    assert: (r: AgentRunResult) => [
      r.toolCalls.length >= 2, // looked up both foods
      r.toolCalls.every(t => t.tool === 'lookup_food'), // no hallucinated tool names
      r.iterations <= 4, // not spinning
    ],
  },
  {
    input: 'I had a ribeye steak 300g',
    assert: (r: AgentRunResult) => [
      r.toolCalls.some(
        t =>
          JSON.stringify(t.args).toLowerCase().includes('ribeye') ||
          JSON.stringify(t.args).toLowerCase().includes('steak')
      ),
    ],
  },
];

(async () => {
  const llmService = new LLMService();
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new FoodLookupTool(new FoodService(new EmbeddingService())));
  const agentService = new AgentService(llmService, toolRegistry);

  for (const { input, assert } of testCases) {
    console.log(`\n=== Testing input: "${input}" ===`);
    const result = await agentService.run(input, []);
    const assertions = assert(result);
    assertions.forEach((passed, idx) => {
      if (passed) {
        console.log(`✅ Assertion ${idx + 1} passed`);
      } else {
        console.error(`❌ Assertion ${idx + 1} failed`);
        console.error('Result:', JSON.stringify(result, null, 2));
      }
    });
  }
})();
