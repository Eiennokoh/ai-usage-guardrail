/**
 * 他のプロジェクトから検問所を使う例。 npx tsx examples/integrate.ts
 *
 * パターン1: 内蔵クライアント（Claude API / 模擬）をそのまま使う
 * パターン2: 既存の「AIを呼ぶ関数」を protect() で包む（社内の別システムに組み込む場合）
 */
import { createGuardrail } from '../src/index';

const guardrail = createGuardrail({ mode: 'mock', logPath: null });

// パターン1
const r1 = await guardrail.run({ user: 'tanaka', department: '運用部', prompt: '青葉生命保険向けの月次レポートの構成案を作って' });
console.log('[パターン1]', r1.decision, '→', r1.restoredResponse?.split('\n')[0]);

// パターン2: 既存のAI呼び出し（ここでは仮の関数）を包む
async function existingAiCall(prompt: string): Promise<string> {
  console.log('  既存AIが受け取った文:', prompt);
  return `${prompt.match(/\[顧客[A-Z]+\]/)?.[0] ?? ''}向けの要点は、運用実績・リスク管理・報告体制の3つです。`;
}
const safeCall = guardrail.protect(existingAiCall, { model: 'in-house-llm' });

const r2 = await safeCall({ user: 'sato', department: '営業企画部', prompt: 'みなと信用金庫への提案の要点を3つ挙げて' });
console.log('[パターン2]', r2.decision, '→', r2.restoredResponse, `（回答チェック: ${r2.outputCheck?.status}）`);

const r3 = await safeCall({ user: 'sato', department: '営業企画部', prompt: '口座番号 7654321 の入金を確認して' });
console.log('[パターン2]', r3.decision, '→', r3.blockReasons[0]);
