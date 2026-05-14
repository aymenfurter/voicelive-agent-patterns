import type { TokenUsage } from '../types';

/**
 * Token pricing per 1K tokens (USD) for models used in this app.
 * Source: Azure OpenAI pricing page (May 2026)
 *
 * gpt-realtime (GA):        Input $0.05/1K  Output $0.20/1K (audio tokens)
 * gpt-realtime-mini:        Input $0.03/1K  Output $0.12/1K (audio tokens)
 * gpt-realtime-1.5:         Input $0.04/1K  Output $0.16/1K (audio tokens)
 * gpt-4.1 (supervisor):     Input $0.002/1K Output $0.008/1K
 * gpt-4o:                   Input $0.005/1K Output $0.015/1K
 */
export interface ModelPricing {
  inputPer1K: number;
  outputPer1K: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-realtime': { inputPer1K: 0.05, outputPer1K: 0.20 },
  'gpt-realtime-mini': { inputPer1K: 0.03, outputPer1K: 0.12 },
  'gpt-realtime-1.5': { inputPer1K: 0.04, outputPer1K: 0.16 },
  'gpt-4o-realtime-preview': { inputPer1K: 0.05, outputPer1K: 0.20 },
  'gpt-4o-mini-realtime-preview': { inputPer1K: 0.03, outputPer1K: 0.12 },
  'gpt-4.1': { inputPer1K: 0.002, outputPer1K: 0.008 },
  'gpt-4.1-mini': { inputPer1K: 0.0004, outputPer1K: 0.0016 },
  'gpt-4o': { inputPer1K: 0.005, outputPer1K: 0.015 },
  'gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
};

const DEFAULT_PRICING: ModelPricing = MODEL_PRICING['gpt-realtime'];

export function estimateCost(usage: TokenUsage, model?: string): number {
  const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
  const inputCost = (usage.inputTokens / 1000) * pricing.inputPer1K;
  const outputCost = (usage.outputTokens / 1000) * pricing.outputPer1K;
  return inputCost + outputCost;
}

export function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
