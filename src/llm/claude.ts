import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmClient, type LlmResponse } from './types';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * 安全上の理由でモデルが回答を断ったとき、API側で自動的に別モデルに切り替える
 * 「サーバー側フォールバック（fallbacks: "default"）」を使えるモデル。
 */
const SERVER_FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

/**
 * Anthropic Claude API を呼び出すクライアント。トークン数は API が返す実測値を使う。
 * - effort（既定 low）: 社内の文書作成支援は深い推論を必要としないため、考える量を抑えて費用と待ち時間を減らす
 * - 応答が遅い・つながらない場合に備え、タイムアウト30秒・再試行1回にとどめる（デモで固まらないように）
 */
export class ClaudeClient implements LlmClient {
  readonly mode = 'live' as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly maxTokens = 2048,
    private readonly effort?: Effort,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  }

  async complete(prompt: string, system?: string): Promise<LlmResponse> {
    const useFallback = SERVER_FALLBACK_MODELS.has(this.model);
    try {
      const res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        ...(system ? { system } : {}),
        ...(this.effort ? { output_config: { effort: this.effort } } : {}),
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return {
        text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        // フォールバックが働いた場合は、実際に回答したモデル名が入る
        model: res.model,
        tokensEstimated: false,
        stopReason: res.stop_reason,
      };
    } catch (e) {
      throw toLlmError(e, this.model);
    }
  }
}

/** SDK のエラーを、利用者がそのまま読める日本語のメッセージに変える */
function toLlmError(e: unknown, model: string): unknown {
  const hint = 'APIキーなしで試す場合は npm run demo（模擬モード）を使ってください。';
  if (e instanceof Anthropic.AuthenticationError) return new LlmError(`APIキーが無効です（401）。.env の ANTHROPIC_API_KEY を確認してください。${hint}`, { cause: e });
  if (e instanceof Anthropic.PermissionDeniedError) return new LlmError(`このAPIキーでは利用できません（403）。${hint}`, { cause: e });
  if (e instanceof Anthropic.NotFoundError) return new LlmError(`モデル「${model}」が見つかりません（404）。ANTHROPIC_MODEL を確認してください。`, { cause: e });
  if (e instanceof Anthropic.RateLimitError) return new LlmError('利用上限に達しました（429）。しばらく待ってから再実行してください。', { cause: e });
  if (e instanceof Anthropic.BadRequestError) return new LlmError(`リクエストが受け付けられませんでした（400）: ${e.message}`, { cause: e });
  if (e instanceof Anthropic.APIConnectionError) return new LlmError(`Claude API に接続できません（ネットワークまたはタイムアウト）。${hint}`, { cause: e });
  if (e instanceof Anthropic.APIError) return new LlmError(`Claude API でエラーが発生しました（${e.status ?? '不明'}）: ${e.message}`, { cause: e });
  return e;
}
