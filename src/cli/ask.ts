/**
 * 1件だけチェックを通して送る。
 *   npm run ask -- --user tanaka --dept 運用部 "さくら年金基金向けの報告書の構成案を作って"
 *   npm run ask -- --mock "..."   （APIキーがあっても模擬モードで実行）
 */
import { createGuardrail } from '../index';
import { c, decisionLabel, parseArgs, usd } from './format';

const { flags, rest } = parseArgs(process.argv.slice(2));
const prompt = rest.join(' ').trim();
if (!prompt) {
  console.log('使い方: npm run ask -- [--user ID] [--dept 部署] [--mock] "AIへの依頼文"');
  process.exit(1);
}

const guardrail = createGuardrail(flags.mock ? { mode: 'mock' } : {});
const res = await guardrail.run({
  user: String(flags.user ?? 'demo-user'),
  department: String(flags.dept ?? '未設定'),
  prompt,
});

console.log(`判定: ${decisionLabel(res.decision, res.status)}  ${c.dim(`(${res.mode} / ${res.model})`)}`);
for (const f of res.findings) console.log(c.dim(`  検知: ${f.label} ${f.preview} -> ${f.action === 'block' ? 'ブロック' : 'マスク'}`));

if (res.status === 'blocked') {
  console.log(c.red('\nAIには送信していません。'));
  for (const r of res.blockReasons) console.log(`  NG ${r}`);
  process.exit(2);
}
if (res.status === 'error') {
  console.log(`\n${c.dim('AIへ送信:')} ${res.sentPrompt}`);
  console.log(c.red(`\nエラー: ${res.error}`));
  process.exit(3);
}

console.log(`\n${c.dim('AIへ送信:')} ${res.sentPrompt}`);
if (res.outputCheck?.status === 'warning') {
  console.log(c.yellow('\n回答チェック: 警告'));
  for (const i of res.outputCheck.issues) console.log(c.yellow(`  ! ${i.message}`));
} else {
  console.log(c.dim('\n回答チェック: OK'));
}
console.log(`\n${c.dim('回答（復元後）:')}\n${res.restoredResponse}`);
console.log(c.dim(`\nトークン: 入力 ${res.inputTokens} / 出力 ${res.outputTokens}${res.tokensEstimated ? '（概算）' : ''}  推定費用: ${usd(res.estimatedCostUsd)}`));
