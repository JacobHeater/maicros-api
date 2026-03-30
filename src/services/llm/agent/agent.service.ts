// agent/agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ToolRegistry } from '../tools/tool-registry.service';
import { LLMService } from '../llm.service';
import { ChatMessage, ChatMessageRole } from '@/services/common/models/chat-message';

export interface AgentRunOptions {
  signal?: AbortSignal;
  onToolStart?: (toolName: string) => void;
  onToolEnd?: (toolName: string) => void;
}

export interface AgentRunResult {
  /**
   * Fully assembled LlmMessage array ready to pass directly to
   * LLMService.complete() / LLMService.stream() for final answer.
   * The gateway should pass this straight through.
   */
  finalMessages: ChatMessage[];
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  iterations: number;
}

const TOOL_CALL_REGEX = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
// Keep iterations low to avoid runaway loops when the model fails to emit
// valid tool_call blocks. The agent will prompt the model to fix malformed
// calls a few times before aborting with a helpful message.
const MAX_ITERATIONS = 8;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llm: LLMService,
    private readonly toolRegistry: ToolRegistry
  ) {}

  async run(
    userMessage: string,
    history: ChatMessage[],
    options: AgentRunOptions = {}
  ): Promise<AgentRunResult> {
    const { signal, onToolStart, onToolEnd } = options;

    const workingHistory: ChatMessage[] = [
      ...history,
      { role: ChatMessageRole.User, content: userMessage },
    ];

    const toolCalls: AgentRunResult['toolCalls'] = [];
    let iterations = 0;
    let malformedToolCallCount = 0;

    while (iterations < MAX_ITERATIONS) {
      if (signal?.aborted) throw new Error('Aborted');
      iterations++;

      const messages = this.buildMessages(workingHistory);
      const rawOutput = await this.llm.complete(messages, { temperature: 0.2 }, signal);

      this.logger.debug(`[Iter ${iterations}] ${rawOutput.slice(0, 150)}`);

      // Reset lastIndex before each exec pass — required when reusing a global regex
      TOOL_CALL_REGEX.lastIndex = 0;
      const allMatches = [...rawOutput.matchAll(TOOL_CALL_REGEX)];
      if (!allMatches.length) {
        // No tool calls — ensure the model didn't invent numeric data.
        // If the assistant produced numeric claims or a data table without
        // calling tools, force another iteration that instructs the model
        // to call the lookup tool for each food. This prevents fabricated
        // numbers in final answers.
        const numericPattern = /\d+(?:\.\d+)?\s*(g|mg|k?cal|cal|grams|oz|%)/i;
        const containsTable = /\|.+\|/s;
        const mentionsNutrients = /(calorie|calories|protein|carb|carbs|fat|fiber|sodium|score)/i;
        const looksLikeData =
          numericPattern.test(rawOutput) ||
          containsTable.test(rawOutput) ||
          mentionsNutrients.test(rawOutput);

        if (looksLikeData) {
          // Ask the model explicitly to call tools for each food and not invent values.
          workingHistory.push({
            role: ChatMessageRole.User,
            content:
              'You produced numeric claims or a data table without calling any tools. For every food mentioned in the conversation, call the lookup_food tool using the exact <tool_call> JSON block format (no other text in that turn). Do NOT invent numbers — all numeric values must come from tool results.',
          });
          // Continue the loop so the model is queried again and ideally emits <tool_call> blocks.
          continue;
        }

        // No tool calls and no numeric/data output — accept as final answer.
        workingHistory.push({ role: ChatMessageRole.Assistant, content: rawOutput });
        return {
          finalMessages: this.buildMessages(workingHistory),
          toolCalls,
          iterations,
        };
      }

      // Record the full assistant turn containing all tool call blocks
      workingHistory.push({ role: ChatMessageRole.Assistant, content: rawOutput });

      // Execute every tool call found in this turn sequentially,
      // injecting each result before moving to the next
      for (const match of allMatches) {
        let parsed: { tool: string; args: Record<string, unknown> };
        try {
          parsed = JSON.parse(match[1]);
        } catch {
          malformedToolCallCount++;
          this.logger.warn(
            `Malformed tool_call JSON captured (attempt=${malformedToolCallCount}): ${String(match[1]).slice(0, 200)}`
          );
          // Ask the model (as the user) to emit a correctly formatted example.
          workingHistory.push({
            role: ChatMessageRole.User,
            content:
              'The tool_call block you produced contained invalid JSON. Please output ONLY a single <tool_call> block with valid JSON and nothing else. Example exactly: <tool_call>{"tool":"lookup_food","args":{"food_name":"scrambled eggs","amount_description":"2 large eggs"}}</tool_call>',
          });

          // If we've asked several times and still get malformed JSON, abort
          // to avoid a long-running loop and return a helpful message.
          if (malformedToolCallCount >= 3) {
            this.logger.error('Aborting agent run: repeated malformed tool_call output');
            workingHistory.push({
              role: ChatMessageRole.Assistant,
              content:
                "I couldn't perform the necessary lookups because my tool call outputs were malformed several times. Please try rephrasing your request or allow me to try again later.",
            });
            return {
              finalMessages: this.buildMessages(workingHistory),
              toolCalls,
              iterations,
            };
          }

          continue;
        }

        if (signal?.aborted) throw new Error('Aborted');

        onToolStart?.(parsed.tool);
        const result = await this.toolRegistry.execute({
          toolName: parsed.tool,
          args: parsed.args,
        });
        onToolEnd?.(parsed.tool);

        toolCalls.push({ tool: parsed.tool, args: parsed.args, result: result.result });

        workingHistory.push({
          role: ChatMessageRole.User,
          content: result.error
            ? `[Tool error: ${parsed.tool}] ${result.error}`
            : `[Tool result: ${parsed.tool}]\n${JSON.stringify(result.result, null, 2)}`,
        });
      }
    }

    // Max iterations reached — prompt for a summary with what was found
    this.logger.warn(`Session hit max iterations (${MAX_ITERATIONS})`);
    return {
      finalMessages: this.buildMessages([
        ...workingHistory,
        {
          role: ChatMessageRole.User,
          content: 'Summarize your findings so far as a final answer.',
        },
      ]),
      toolCalls,
      iterations,
    };
  }

  private buildSystemPrompt(): string {
    const toolDefs = JSON.stringify(this.toolRegistry.getDefinitions(), null, 2);
    return `Your name is Newton. You are a nutrition data analyst for mAIcros — precise, data-driven, and straightforward, but also warm and conversational in how you communicate findings. You talk to users like a knowledgeable friend who happens to have access to a nutrition database, not like a clinical report generator. You use plain language, acknowledge the realities of how people actually eat, and keep your tone encouraging without sugarcoating gaps in a meal's nutritional profile.

Your role is to report what the USDA database says about a meal — not to offer general nutrition advice, not to draw on your own training knowledge for numbers, and not to make claims beyond what the data supports. When you don't have data, you say so plainly and move on. When you do have data, you present it clearly and explain what it means in practical terms.

Available tools:
${toolDefs}

To call a tool, output EXACTLY this format and nothing else on that turn:
<tool_call>
{"tool": "<tool_name>", "args": {<args object>}}
</tool_call>

After a tool result, call another tool or provide your final answer.
Your final answer must NOT contain a <tool_call> block.

## Data integrity rules — non-negotiable
- Every numerical value in your final answer MUST come from a tool result. No exceptions.
- If a food returns no match or a low match score (below 0.5), say so explicitly — do not substitute estimates.
- If the user did not specify a quantity, report values per 100g and state that assumption clearly.
- If a food has no USDA entry (e.g. highly processed or non-standard items), say "No USDA data available for [food]" and exclude it from totals.
- Never use phrases like "approximately", "roughly", or "typically" for any number. Either you have the data or you don't.

## What to report
For each food item:
- USDA match name and match score
- Calories, protein, carbs, fat, fiber, sodium — from tool result only
- Flag if match score is below 0.7 so the user knows confidence is lower

For the meal total:
- Sum only the foods that returned valid USDA data
- Clearly list any foods excluded from totals and why

## Micronutrient flags — data-driven only
Flag the following only if the tool result contains the relevant value:
- Fiber below 7g for the meal total
- Sodium above 800mg for the meal total
- Vitamin D absent or zero across all items
- Iron below 3mg for the meal total

Do not flag micronutrients for which you have no tool data.

## Suggestions
- Suggestions must reference specific USDA foods by name
- State the specific nutrient gap the suggestion addresses
- Do not make suggestions based on general nutrition knowledge — only suggest changes that address gaps evidenced by the tool results
- If the data does not support a specific suggestion, say so rather than improvising
- Before making any suggestion, enumerate the macro roles already filled by the meal: identify which foods are serving as the protein source, carbohydrate source, and fat source
- Never suggest adding a food that fills a macro role already present in the meal. If the meal already contains a protein source, do not suggest another protein source. If the meal already contains a fat source, do not suggest another fat source unless the existing one is nutritionally poor.
- Prefer substitutions over additions where a macro role is already filled but the quality is poor. Frame as "replace X with Y" rather than "add Y" when the macro category is covered but the source is suboptimal
- If no data-evidenced suggestion exists, omit the suggestions section entirely rather than improvising
- Write suggestions conversationally — explain the reasoning in plain language as if talking to the user directly, not as bullet points in a clinical report

## Output format rules
- The Disclaimer section is mandatory and must appear as the final section of every response without exception
- Do not summarize, shorten, or paraphrase the disclaimer — reproduce it exactly as written in the output format below
- No response is complete without the disclaimer
- Outside of the data table and totals, write in a conversational first-person voice as Newton. Introduce findings naturally, connect the dots between sections, and address the user directly where appropriate.
- Your final answer must NOT contain a <tool_call> block!
- Do NOT include <tool_call> in the final answer!

## Output format
Present your final answer in this structure:

### Meal Analysis
[A brief conversational opening from Newton acknowledging the meal before the table — one or two sentences, plain language]

| Food | USDA Match | Score | Cal | Protein | Carbs | Fat | Fiber | Sodium |
|---|---|---|---|---|---|---|---|---|
[one row per food with tool data]

**Foods excluded from analysis:** [list any with reason, explained conversationally]

### Meal Totals
[summed values for foods with valid data only, followed by one or two sentences from Newton putting the totals in context]

### Micronutrient Flags
[data-supported flags only, written conversationally — omit this section entirely if no flags apply]

### Suggestions
[data-evidenced suggestions only, written conversationally as Newton speaking directly to the user — enumerate macro roles first, then suggest — omit this section entirely if the data does not support specific suggestions]

### Disclaimer
[REQUIRED — reproduce the following exactly, do not paraphrase or shorten]
*This analysis is generated by an AI system using USDA nutritional data and is provided for informational purposes only. It does not constitute medical advice, dietary advice, or a substitute for consultation with a qualified healthcare provider or registered dietitian. Nutritional needs vary by individual based on age, sex, weight, health status, medications, and other factors not accounted for in this analysis. Do not use this information to diagnose, treat, cure, or prevent any health condition. If you have specific dietary concerns or health conditions, consult a licensed medical professional before making changes to your diet. mAIcros assumes no liability for decisions made based on this output.*`;
  }

  private buildMessages(history: ChatMessage[]): ChatMessage[] {
    const msgs: ChatMessage[] = [
      { role: ChatMessageRole.System, content: this.buildSystemPrompt() },
    ];
    for (const msg of history) {
      if (msg.role === ChatMessageRole.System) continue;
      msgs.push(msg);
    }
    return msgs;
  }
}
