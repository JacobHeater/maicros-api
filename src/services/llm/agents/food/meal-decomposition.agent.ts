import { AgentBase } from '../agent-base';
import { LLMService } from '../../llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { ChatMessage, ChatMessageRole } from '@/models/chat/chat-message';
import { AgentRunOptions, AgentRunResult } from '@/models/llm/agent/agent-data';
import { DecomposedFood } from '@/models/llm/nutrition/meal-item';
import { Injectable } from '@/services/injectable';

@Injectable()
export class MealDecompositionAgent extends AgentBase {
  constructor(llm: LLMService, toolRegistry: ToolRegistryService) {
    super(llm, toolRegistry);
  }

  protected buildSystemPrompt(): string {
    return `SYSTEM INSTRUCTION:
You are a headless Meal State Manager. Your job is to maintain an accurate JSON array of foods for a single meal, generate optimized search terms, AND estimate the total weight in grams for the mathematical engine.

INPUT:
1. CURRENT_MEAL: A JSON array of the foods currently logged.
2. USER_MESSAGE: The latest thing the user said.

RULES FOR STATE MANAGEMENT & SEARCH:
- ADD/UPDATE/REMOVE foods based on the user's intent.
- NO CHANGE: If the user is just chatting, return CURRENT_MEAL exactly.
- SEARCH TERMS: Strip fluff, retain brands and macro-modifiers.

RULES FOR 'estimated_grams' (CRITICAL):
You MUST calculate or estimate the total weight in grams for every item.
1. IMPERIAL CONVERSION: If the user specifies ounces or pounds, convert to grams (1 oz = 28g, 1 lb = 453g). 
2. ABSTRACT UNITS: If the user says "1 bagel", "2 scoops", or "1 slice", use standard nutritional knowledge to estimate grams (e.g., 1 bagel = 95g, 1 scoop protein = 30g, 1 slice bread = 30g). Multiply by the quantity.
3. INFERRED SERVING: If the amount is highly vague ("a thin spread of butter", "a splash of milk"), estimate a realistic standard serving in grams (e.g., thin spread butter = 7g, splash of milk = 15g) and set "amountInferred": true.

OUTPUT FORMAT:
Return ONLY a valid JSON array matching the exact schema below. No markdown blocks. No preamble.

[
  { 
    "food": "string", 
    "search_term": "string", 
    "amount": "string", 
    "amountInferred": boolean,
    "estimated_grams": number 
  }
]

EXAMPLES:

CURRENT_MEAL: []
USER_MESSAGE: "I had 2 scoops of whey, 1 bagel, and a thin spread of butter."
OUTPUT: [{"food": "whey protein", "search_term": "whey protein", "amount": "2 scoops", "amountInferred": false, "estimated_grams": 60}, {"food": "bagel", "search_term": "bagel", "amount": "1", "amountInferred": false, "estimated_grams": 95}, {"food": "butter", "search_term": "butter", "amount": "a thin spread", "amountInferred": true, "estimated_grams": 7}]

CURRENT_MEAL: [{"food": "chicken breast", "search_term": "chicken breast", "amount": "8oz", "amountInferred": false, "estimated_grams": 224}]
USER_MESSAGE: "Actually, it was only 4oz."
OUTPUT: [{"food": "chicken breast", "search_term": "chicken breast", "amount": "4oz", "amountInferred": false, "estimated_grams": 112}]`;
  }

  /**
   * Stateful Decomposition: Merges the previous meal state with the new user message.
   */
  public async updateState(
    previousState: DecomposedFood[],
    userMessage: string,
    signal?: AbortSignal
  ): Promise<DecomposedFood[]> {
    // Only pass the immediate state and message, NOT the entire history, to keep pre-fill lightning fast.
    const promptInput = `CURRENT_MEAL: ${JSON.stringify(previousState)}\nUSER_MESSAGE: "${userMessage}"\nOUTPUT:`;

    const messages = this.buildMessages([{ role: ChatMessageRole.User, content: promptInput }]);

    try {
      const raw = await this.llm.complete(
        messages,
        { temperature: 0, maxTokens: 800, model: 'qwen2.5:7b' }, // Using the fast worker model
        signal
      );

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('Meal decomposition returned no JSON array, returning previous state');
        return previousState;
      }

      const parsed = JSON.parse(jsonMatch[0]) as DecomposedFood[];
      if (!Array.isArray(parsed)) return previousState;

      // Ensure the new estimated_grams field is present and valid
      return parsed.filter(
        item =>
          typeof item.food === 'string' &&
          item.food.trim().length > 0 &&
          typeof item.search_term === 'string' &&
          typeof item.amountInferred === 'boolean' &&
          typeof item.estimated_grams === 'number'
      );
    } catch (err) {
      this.logger.warn(
        `Meal decomposition failed: ${(err as Error).message}. Returning previous state.`
      );
      return previousState;
    }
  }

  /**
   * Fallback for AgentBase compliance.
   */
  public async run(
    userMessage: string,
    history: ChatMessage[],
    options: AgentRunOptions = {}
  ): Promise<AgentRunResult> {
    const defaultState: DecomposedFood[] = [];
    await this.updateState(defaultState, userMessage, options.signal);

    const messages = this.buildMessages([
      ...history,
      { role: ChatMessageRole.User, content: userMessage },
    ]);

    return { finalMessages: messages, toolCalls: [], iterations: 1 };
  }
}
