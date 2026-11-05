/**
 * ai-usage-guardrail の公開API。
 * 他のプロジェクトからは createGuardrail() を呼ぶだけで検問所を通せる。
 */
import { getConfig } from './config';
import { loadDictionaries } from './dictionary';
import { Guardrail } from './guardrail';
import { Inspector } from './inspector';
import { ClaudeClient } from './llm/claude';
import { MockClient } from './llm/mock';
import type { LlmClient } from './llm/types';
import { JsonlUsageLogger, type UsageLogger } from './usage';

export interface CreateGuardrailOptions {
  /** 省略時は環境変数 GUARDRAIL_MODE / ANTHROPIC_API_KEY から決める */
  mode?: 'live' | 'mock';
  /** 利用記録の出力先。null で記録しない */
  logPath?: string | null;
  logger?: UsageLogger;
  client?: LlmClient;
  systemPrompt?: string;
}

export function createGuardrail(options: CreateGuardrailOptions = {}): Guardrail {
  const config = getConfig();
  const mode = options.mode ?? config.mode;
  let client = options.client;
  if (!client) {
    if (mode === 'live') {
      if (!config.apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません。模擬モードで動かす場合は GUARDRAIL_MODE=mock にしてください。');
      client = new ClaudeClient(config.apiKey, config.model, config.maxTokens, config.effort);
    } else {
      client = new MockClient();
    }
  }
  const logger =
    options.logger ?? (options.logPath === null ? undefined : new JsonlUsageLogger(options.logPath ?? config.logPath));

  return new Guardrail({
    inspector: new Inspector(loadDictionaries(config.dictionaryDir)),
    client,
    pricing: config.pricing,
    logger,
    systemPrompt: options.systemPrompt,
    maxInputChars: config.maxInputChars,
  });
}

export { getConfig, DEFAULT_MODEL } from './config';
export { loadDictionaries, parseDictionaryCsv, type DictionaryEntry } from './dictionary';
export { Guardrail, DEFAULT_SYSTEM_PROMPT, type GuardRequest, type GuardResult } from './guardrail';
export { Inspector } from './inspector';
export { maskText, restoreText } from './masker';
export { checkOutput, type OutputCheck, type OutputIssue } from './outputCheck';
export { PATTERN_RULES, isValidLuhn, isValidMyNumber } from './rules';
export { ClaudeClient } from './llm/claude';
export { MockClient } from './llm/mock';
export { LlmError, type LlmClient, type LlmResponse } from './llm/types';
export { JsonlUsageLogger, MemoryUsageLogger, summarizeByDepartment, estimateCostUsd, estimateTokens } from './usage';
export type { Decision, Finding } from './types';
