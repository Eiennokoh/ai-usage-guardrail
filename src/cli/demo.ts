/**
 * デモ（数秒で完了）。npm run demo で APIキーなしでも最後まで動く。
 *   --step  セクションごとに Enter を待つ（面接・発表で説明しながら進める用）
 *   --live  Claude API を使う（APIキーが必要）
 *
 *   [1] テスト入力20件をチェックに通す
 *   [2] マスク -> AIへ送信 -> 回答チェック -> 復元 の流れ
 *   [3] ブロック理由
 *   [4] AIの回答チェック（AIが仮名を崩したり、送っていない情報を書いたりした場合）
 *   [5] 部署別の利用集計
 *   [6] 検知漏れ率・誤ブロック率
 */
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getConfig, PROJECT_ROOT } from '../config';
import { evaluate, loadTestCases } from '../evaluation';
import type { GuardResult } from '../guardrail';
import { createGuardrail } from '../index';
import { Inspector } from '../inspector';
import { loadDictionaries } from '../dictionary';
import { JsonlUsageLogger } from '../usage';
import { c, decisionLabel, pad, parseArgs, pct, table, truncate } from './format';
import { departmentTable } from './summary';

const { flags } = parseArgs(process.argv.slice(2));
const config = getConfig();
let mode: 'live' | 'mock' = flags.live ? 'live' : 'mock';
if (mode === 'live' && !config.apiKey) {
  console.log(c.yellow('ANTHROPIC_API_KEY が未設定のため、模擬モードで実行します。\n'));
  mode = 'mock';
}

const stepMode = Boolean(flags.step) && process.stdin.isTTY;
async function pause(): Promise<void> {
  if (!stepMode) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(c.dim('\n  (Enter で次へ)'));
  rl.close();
}
const heading = (s: string) => console.log(c.bold(`\n${s}`));
const row = (label: string, value: string) => console.log(`  ${c.dim(pad(label, 12))} ${value}`);

/** 判定の根拠が一目で分かるよう、ブロック対象だけは値の一部も表示する */
function detected(res: GuardResult): string {
  const items = new Map<string, string>();
  for (const f of res.findings) {
    if (f.action === 'block') items.set(`${f.label}${f.preview}`, `${f.label}(${f.preview})`);
    else items.set(f.label, f.label);
  }
  return [...items.values()].join('・') || '-';
}

const logger = new JsonlUsageLogger(join(config.logPath, '..', 'demo-usage.jsonl'));
logger.reset();
const guardrail = createGuardrail({ mode, logger });
const cases = loadTestCases(config.testCasesPath);

console.log(c.bold('\n== ai-usage-guardrail デモ =='));
console.log(c.dim(`  モード: ${mode === 'live' ? `Claude API（${config.model}）` : '模擬（APIキー不要）'}`));
console.log(c.dim('  判定・マスク・回答チェック・記録はコード、回答の作成だけがAIの担当です。'));

heading('[1] テスト入力20件をチェックに通す');
const results: { tc: (typeof cases)[number]; res: GuardResult }[] = [];
for (const tc of cases) {
  results.push({ tc, res: await guardrail.run({ user: tc.user, department: tc.department, prompt: tc.input }) });
}
console.log(
  table(
    ['ID', '判定', '検知したもの', '入力（抜粋）'],
    results.map(({ tc, res }) => [tc.id, decisionLabel(res.decision, res.status), detected(res), truncate(tc.input, 30)]),
  ),
);
const firstError = results.find((r) => r.res.status === 'error');
if (firstError) {
  console.log(c.red(`\n  AIの呼び出しでエラーが発生しました: ${firstError.res.error}`));
}
await pause();

heading('[2] マスク -> AIへ送信 -> 回答チェック -> 復元');
const sample = results.find((r) => r.tc.id === 'C07' && r.res.status === 'sent') ?? results.find((r) => r.res.status === 'sent' && r.res.decision === 'mask');
if (sample) {
  row('入力', sample.tc.input);
  row('AIへ送信', c.yellow(sample.res.sentPrompt ?? ''));
  row('AIの回答', (sample.res.aiResponse ?? '').split('\n')[0]);
  row('回答チェック', sample.res.outputCheck?.status === 'ok' ? c.green('OK（仮名はそのまま、実名や番号の混入なし）') : c.yellow('警告あり'));
  row('復元後', c.green((sample.res.restoredResponse ?? '').split('\n')[0]));
} else {
  console.log(c.yellow('  送信できた例がありません（上のエラーを確認してください）。'));
}
await pause();

const blocked = results.find((r) => r.tc.id === 'C12') ?? results.find((r) => r.res.status === 'blocked')!;
heading('[3] ブロック（AIには一切送らない）');
row('入力', blocked.tc.input);
for (const reason of blocked.res.blockReasons) console.log(`  ${c.red('NG')} ${reason}`);
await pause();

heading('[4] AIの回答もコードで確かめる（AIが間違えた場合）');
// AIの誤りを再現するため、わざと問題を含めた回答を返す「AI」を使う
const faultyReply = '【顧客A】と[顧客B]の違いを表にしました。参考として、さくら年金基金の口座 1234567 の残高推移も載せています。';
const checker = createGuardrail({ mode: 'mock', logPath: null });
const faulty = await checker.protect(async () => faultyReply, { model: 'faulty-ai' })({
  user: 'demo',
  department: 'デモ',
  prompt: 'さくら年金基金とみなと信用金庫向けの提案書の違いを表に整理してください。',
});
row('AIへ送信', c.yellow(faulty.sentPrompt ?? ''));
row('AIの回答', faultyReply);
for (const issue of faulty.outputCheck?.issues ?? []) console.log(`  ${c.yellow('!')} ${issue.message}`);
console.log(c.dim('  -> 回答は止めずに警告を表示し、警告の種類だけを利用記録に残します。'));
await pause();

heading('[5] 部署別の利用状況');
console.log(departmentTable(logger.readAll()));
console.log(c.dim(`  記録: ${relative(PROJECT_ROOT, logger.path)}（検知した値そのものは保存しない）`));
await pause();

const report = evaluate(new Inspector(loadDictionaries(config.dictionaryDir)), cases);
heading('[6] 精度（テスト入力20件）');
console.log(`  検知漏れ率   ${pct(report.missRate)}（機密を含む ${report.sensitiveCases} 件中 ${report.missed} 件を見逃し）`);
console.log(`  誤ブロック率 ${pct(report.falseBlockRate)}（止める必要のない ${report.nonBlockCases} 件中 ${report.falseBlocked} 件を停止）`);
for (const r of report.cases.filter((x) => !x.correct)) {
  console.log(c.dim(`  - ${r.testCase.id}: ${r.testCase.knownLimitation?.note ?? '想定外の判定'}`));
}
console.log(c.dim('  -> ルールだけでは防ぎきれないため、社内規程と人の確認を組み合わせる前提です。\n'));
