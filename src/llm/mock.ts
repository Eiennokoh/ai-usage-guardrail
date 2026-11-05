import { estimateTokens } from '../usage';
import type { LlmClient, LlmResponse } from './types';

/**
 * APIキーがなくても動く模擬クライアント。
 * 受け取った仮名（[顧客A] など）を回答に含めるので、復元の流れをそのまま確認できる。
 */
export class MockClient implements LlmClient {
  readonly mode = 'mock' as const;
  readonly model = 'mock';

  async complete(prompt: string, system = ''): Promise<LlmResponse> {
    const placeholders = [...new Set(prompt.match(/\[[^\]\s]{1,12}\]/g) ?? [])];
    // 仮名（[顧客A] など）は日本語でも、それ以外が英語なら英語で答える
    const isEnglish = /^[\x00-\x7F]*$/.test(prompt.replace(/\[[^\]\s]{1,12}\]/g, ''));
    const text = isEnglish
      ? `[Mock answer] ${placeholders.length ? `Regarding ${placeholders.join(' and ')}, ` : ''}here is a suggested outline:\n1. Background\n2. Key points\n3. Next steps`
      : `【模擬回答】${placeholders.length ? `${placeholders.join('・')}の件について、` : ''}次の構成で整理すると分かりやすくなります。\n1. 背景と目的\n2. 現状と論点\n3. 次のアクション`;
    return {
      text,
      inputTokens: estimateTokens(system + prompt),
      outputTokens: estimateTokens(text),
      model: this.model,
      tokensEstimated: true,
      stopReason: 'end_turn',
    };
  }
}
