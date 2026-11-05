/** テスト入力で漏れ率・誤ブロック率を計算する。 npm run eval */
import { getConfig } from '../config';
import { loadDictionaries } from '../dictionary';
import { evaluate, loadTestCases } from '../evaluation';
import { Inspector } from '../inspector';
import { c, decisionLabel, pct, table } from './format';

const config = getConfig();
const report = evaluate(new Inspector(loadDictionaries(config.dictionaryDir)), loadTestCases(config.testCasesPath));

console.log(
  table(
    ['ID', '内容', '期待', '結果', '評価'],
    report.cases.map((r) => [
      r.testCase.id,
      r.testCase.title,
      decisionLabel(r.testCase.expected),
      decisionLabel(r.actual),
      r.correct ? c.green('OK') : c.yellow('既知の限界'),
    ]),
  ),
);
console.log(`\n正解: ${report.correct} / ${report.total}`);
console.log(`検知漏れ率:   ${pct(report.missRate)}（${report.missed} / ${report.sensitiveCases}）`);
console.log(`誤ブロック率: ${pct(report.falseBlockRate)}（${report.falseBlocked} / ${report.nonBlockCases}）`);
