import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Effort } from './llm/claude';
import type { Pricing } from './usage';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ANTHROPIC_MODEL が未設定のときの既定値 */
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface AppConfig {
  mode: 'live' | 'mock';
  apiKey?: string;
  model: string;
  maxTokens: number;
  /** 未設定（空）なら API に送らない */
  effort?: Effort;
  maxInputChars: number;
  pricing: Pricing;
  logPath: string;
  dictionaryDir: string;
  testCasesPath: string;
}

let envLoaded = false;

/** プロジェクト直下の .env を読み込む（Node.js 20.12 以降の標準機能。dotenv 不要） */
export function loadDotEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const path = resolve(PROJECT_ROOT, '.env');
  if (existsSync(path) && typeof process.loadEnvFile === 'function') process.loadEnvFile(path);
}

const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(PROJECT_ROOT, p));
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : fallback;
};
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const effortOf = (v: string | undefined): Effort | undefined => {
  if (v === undefined) return 'low';
  const s = v.trim().toLowerCase();
  return (EFFORTS as string[]).includes(s) ? (s as Effort) : undefined;
};

/**
 * 設定はすべて環境変数から読む。
 * GUARDRAIL_MODE=auto（既定）: APIキーがあれば Claude API、なければ模擬モード
 */
export function getConfig(env?: NodeJS.ProcessEnv): AppConfig {
  loadDotEnv();
  const e = env ?? process.env;
  const apiKey = e.ANTHROPIC_API_KEY?.trim() || undefined;
  const requested = (e.GUARDRAIL_MODE ?? 'auto').trim().toLowerCase();
  const mode: 'live' | 'mock' =
    requested === 'mock' ? 'mock' : requested === 'live' ? 'live' : apiKey ? 'live' : 'mock';

  return {
    mode,
    apiKey,
    model: e.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens: num(e.MAX_TOKENS, 2048),
    effort: effortOf(e.EFFORT),
    maxInputChars: num(e.MAX_INPUT_CHARS, 8000),
    // 既定値は claude-sonnet-5-5 の料金（入力 $2 / 出力 $10、100万トークンあたり）。モデルを変えたら合わせて変更する
    pricing: {
      inputUsdPerMTok: num(e.PRICE_INPUT_USD_PER_MTOK, 2),
      outputUsdPerMTok: num(e.PRICE_OUTPUT_USD_PER_MTOK, 10),
    },
    logPath: fromRoot(e.USAGE_LOG_PATH || 'logs/usage.jsonl'),
    dictionaryDir: fromRoot(e.DICTIONARY_DIR || 'data/dictionaries'),
    testCasesPath: fromRoot('data/test_inputs.json'),
  };
}
