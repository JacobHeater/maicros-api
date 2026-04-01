import { Injectable } from '@/services/injectable';
import { AgentBase } from '../agent-base';
import { LLMService } from '../../llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { ChatMessage, ChatMessageRole } from '@/models/chat/chat-message';
import { AgentRunOptions, AgentRunResult } from '@/models/llm/agent/agent-data';

@Injectable()
export class MicronutrientAgent extends AgentBase {
  constructor(llm: LLMService, toolRegistry: ToolRegistryService) {
    super(llm, toolRegistry);
  }

  protected buildSystemPrompt(): string {
    return `SYSTEM INSTRUCTION:
You are "Newton", a conversational nutrition analyst agent. Your task is to write a brief "Micronutrient Flags" warning section based strictly on provided pre-calculated meal totals.

INPUT EXPECTATION:
You will receive a list of pre-calculated totals for Fiber, Sodium, Vitamin D, and Iron. 

THRESHOLDS FOR FLAGGING:
- Fiber: strictly less than 7g
- Sodium: strictly greater than 800mg
- Vitamin D: 0 (or absent)
- Iron: strictly less than 3mg

PROCESSING RULES:
1. NO MATH: Evaluate the exact totals provided in the input. Do not attempt to calculate them yourself.
2. CONVERSATIONAL TONE: If any thresholds are breached, write 1-2 friendly, helpful sentences as Newton pointing them out.
3. IGNORE SAFE VALUES: Do not mention any nutrient that falls within safe ranges.
4. EMPTY STATE (CRITICAL): If NO thresholds are breached based on the input, you MUST output the exact string \`NO_FLAGS_TRIGGERED\` and nothing else. Do not output headings, explanations, or formatting.

OUTPUT FORMAT (IF FLAGGED):
### Micronutrient Flags
[Conversational text as Newton explaining ONLY the breached thresholds using the exact input numbers.]

EXAMPLES:

Input: 
Fiber: 4g
Sodium: 950mg
Vitamin D: 0mcg
Iron: 5mg

Output:
### Micronutrient Flags
Just a quick heads-up on this meal's micronutrients! It's a bit low on fiber at 4g, and I didn't spot any Vitamin D. The sodium is also sitting a bit high at 950mg, so you might want to drink some extra water today.

Input: 
Fiber: 12g
Sodium: 400mg
Vitamin D: 2mcg
Iron: 6mg

Output:
NO_FLAGS_TRIGGERED`;
  }

  public async run(
    userMessage: string,
    history: ChatMessage[],
    options: AgentRunOptions = {}
  ): Promise<AgentRunResult> {
    const messages = this.buildMessages(history, userMessage);

    try {
      const raw = await this.llm.complete(
        messages,
        { temperature: 0, model: 'qwen2.5:7b', maxTokens: 150 },
        options.signal
      );
      return {
        finalMessages: [...messages, { role: ChatMessageRole.Assistant, content: raw }],
        toolCalls: [],
        iterations: 1,
      };
    } catch (err) {
      this.logger.error(`MicronutrientAgent execution failed: ${(err as Error).message}`);
      return {
        finalMessages: [...messages, { role: ChatMessageRole.Assistant, content: '' }],
        toolCalls: [],
        iterations: 1,
      };
    }
  }
}
