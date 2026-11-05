export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** true の場合、トークン数は実測ではなく概算 */
  tokensEstimated: boolean;
  /** 回答が終わった理由。max_tokens（上限で途切れた）や refusal（回答を断った）は出力チェックで警告にする */
  stopReason?: string | null;
}

/** AIの呼び出し口。Claude 以外のモデルに差し替える場合もこの形に合わせる */
export interface LlmClient {
  readonly mode: 'live' | 'mock';
  readonly model: string;
  complete(prompt: string, system?: string): Promise<LlmResponse>;
}

/** 利用者にそのまま見せてよい日本語メッセージを持つエラー（APIキー不正・接続失敗など） */
export class LlmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmError';
  }
}
