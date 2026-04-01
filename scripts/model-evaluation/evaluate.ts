import 'dotenv/config';
import 'reflect-metadata';
import { AgentRunResult } from '@/models/llm/agent/agent-data';
import { AgentService } from '@/services/llm/agents/agent.service';
import { ServiceModule } from '@/services/service.module';

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
  const serviceModule = new ServiceModule();
  await serviceModule.initialize();
  const agentService = serviceModule.container.get(AgentService)!;

  for (const { input, assert } of testCases) {
    console.log(`\n=== Testing input: "${input}" ===`);
    const result: AgentRunResult = await agentService.run(input, []);
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
