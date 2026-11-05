import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getConfig } from '../src/config';
import { loadDictionaries, parseDictionaryCsv } from '../src/dictionary';
import { evaluate, loadTestCases } from '../src/evaluation';
import { Guardrail } from '../src/guardrail';
import { Inspector } from '../src/inspector';
import { MockClient } from '../src/llm/mock';
import { LlmError, type LlmClient } from '../src/llm/types';
import { maskText, restoreText } from '../src/masker';
import { isValidLuhn, isValidMyNumber } from '../src/rules';
import { MemoryUsageLogger, summarizeByDepartment } from '../src/usage';

const config = getConfig({ GUARDRAIL_MODE: 'mock' });
const inspector = new Inspector(loadDictionaries(config.dictionaryDir));
const testCases = loadTestCases(config.testCasesPath);
const pricing = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };

/** 呼ばれた回数と受け取った文を記録するAIクライアント */
class SpyClient implements LlmClient {
  readonly mode = 'mock' as const;
  readonly model = 'spy';
  readonly prompts: string[] = [];
  private readonly inner = new MockClient();
  async complete(prompt: string, system?: string) {
    this.prompts.push(prompt);
    return this.inner.complete(prompt, system);
  }
}

describe('テスト入力（data/test_inputs.json）', () => {
  it('15～20件の架空データがそろっている', () => {
    assert.ok(testCases.length >= 15 && testCases.length <= 20);
  });

  for (const tc of testCases) {
    const label = `${tc.id} ${tc.title}`;
    if (tc.knownLimitation) {
      it(`${label}: 既知の限界として「${tc.knownLimitation.actual}」になる`, () => {
        assert.equal(inspector.inspect(tc.input).decision, tc.knownLimitation!.actual);
      });
      continue;
    }
    it(`${label}: ${tc.expected} と判定される`, () => {
      const r = inspector.inspect(tc.input);
      assert.equal(r.decision, tc.expected);
      const rules = new Set(r.findings.map((f) => f.ruleId));
      for (const id of tc.expectedRules) assert.ok(rules.has(id), `${id} が検知されていない`);
    });
  }
});

describe('精度指標', () => {
  const report = evaluate(inspector, testCases);

  it('既知の限界以外はすべて期待どおり', () => {
    const unexpected = report.cases.filter((c) => !c.correct && !c.testCase.knownLimitation);
    assert.deepEqual(unexpected.map((c) => c.testCase.id), []);
  });

  it('検知漏れ率・誤ブロック率が README の値と一致する', () => {
    assert.equal(report.missed, 2);
    assert.equal(report.sensitiveCases, 14);
    assert.equal(report.falseBlocked, 1);
    assert.equal(report.nonBlockCases, 13);
  });
});

describe('誤検知を減らすための検証', () => {
  it('マイナンバーはチェックディジットが合うものだけを対象にする', () => {
    assert.equal(isValidMyNumber('123456789018'), true);
    assert.equal(isValidMyNumber('123456789012'), false);
  });

  it('カード番号は Luhn チェックが通るものだけを対象にする', () => {
    assert.equal(isValidLuhn('4111111111111111'), true);
    assert.equal(isValidLuhn('4111111111111112'), false);
  });

  it('全角数字の口座番号も検知する', () => {
    assert.equal(inspector.inspect('口座番号１２３４５６７').decision, 'block');
  });
});

describe('マスクと復元', () => {
  it('同じ顧客は正式名称でも英語名でも同じ仮名になる', () => {
    const r = inspector.inspect('さくら年金基金（Sakura Pension Fund）への報告');
    const m = maskText(r.text, r.findings);
    assert.equal(m.text, '[顧客A]([顧客A])への報告');
  });

  it('長い名称を優先する（「さくら年金」ではなく「さくら年金基金」全体を置換）', () => {
    const r = inspector.inspect('さくら年金基金の件');
    assert.equal(maskText(r.text, r.findings).text, '[顧客A]の件');
  });

  it('マスクしてから復元すると元の文に戻る', () => {
    for (const tc of testCases.filter((t) => t.expected === 'mask' && !t.knownLimitation)) {
      const r = inspector.inspect(tc.input);
      const m = maskText(r.text, r.findings);
      assert.equal(restoreText(m.text, m.vault), r.text, tc.id);
    }
  });

  it('全角の角括弧で返ってきた仮名も復元する', () => {
    const vault = [{ placeholder: '[顧客A]', original: '青葉生命保険', category: 'client' as const }];
    assert.equal(restoreText('［顧客A］へのご提案', vault), '青葉生命保険へのご提案');
  });
});

describe('Guardrail（検問所）', () => {
  it('ブロックした入力はAIに一切送らない', async () => {
    const spy = new SpyClient();
    const logger = new MemoryUsageLogger();
    const g = new Guardrail({ inspector, client: spy, pricing, logger });
    const res = await g.run({ user: 'tanaka', department: '運用部', prompt: '口座番号 1234567 の残高を教えて' });
    assert.equal(res.status, 'blocked');
    assert.equal(spy.prompts.length, 0);
    assert.ok(res.blockReasons[0].includes('口座番号'));
    assert.equal(logger.records[0].status, 'blocked');
  });

  it('AIにはマスク済みの文だけが届き、回答は復元される', async () => {
    const spy = new SpyClient();
    const g = new Guardrail({ inspector, client: spy, pricing });
    const res = await g.run({ user: 'sato', department: '営業企画部', prompt: 'みなと信用金庫への提案を整理して' });
    assert.equal(spy.prompts[0], '[顧客A]への提案を整理して');
    assert.ok(!spy.prompts[0].includes('みなと'));
    assert.ok(res.restoredResponse?.includes('みなと信用金庫'));
  });

  it('利用記録に検知した値そのものを残さない', async () => {
    const logger = new MemoryUsageLogger();
    const g = new Guardrail({ inspector, client: new MockClient(), pricing, logger });
    await g.run({ user: 'u1', department: '運用部', prompt: '口座番号 1234567 の件' });
    await g.run({ user: 'u1', department: '運用部', prompt: '青葉生命保険（yamada.t@aoba-life.example.jp）の件' });
    const json = JSON.stringify(logger.records);
    for (const secret of ['1234567', '青葉生命保険', 'yamada.t']) assert.ok(!json.includes(secret), secret);
    assert.deepEqual(logger.records[1].ruleIds.sort(), ['client_name', 'email']);
  });

  it('protect() で他プロジェクトのAI呼び出し関数を包める', async () => {
    const received: string[] = [];
    const g = new Guardrail({ inspector, client: new MockClient(), pricing });
    const safeAsk = g.protect(async (p) => {
      received.push(p);
      return `${p.match(/\[顧客A\]/)?.[0]}向けの要約です`;
    });
    const res = await safeAsk({ user: 'u1', department: 'IT部', prompt: '北斗大学向けの要約を作って' });
    assert.equal(received[0], '[顧客A]向けの要約を作って');
    assert.equal(res.restoredResponse, '北斗大学向けの要約です');
    assert.equal(res.mode, 'custom');
  });
});

describe('AIの回答チェック', () => {
  const g = new Guardrail({ inspector, client: new MockClient(), pricing });
  const prompt = 'さくら年金基金向けの報告書の構成案を作って'; // AIには「[顧客A]向けの…」が届く
  const answer = (reply: string) => g.protect(async () => reply)({ user: 'u', department: 'd', prompt });
  const codes = (r: { outputCheck?: { issues: { code: string }[] } }) => r.outputCheck?.issues.map((i) => i.code) ?? [];

  it('仮名がそのまま返ってくれば OK で、元の名前に戻る', async () => {
    const r = await answer('[顧客A]向けの構成案です');
    assert.equal(r.outputCheck?.status, 'ok');
    assert.equal(r.restoredResponse, 'さくら年金基金向けの構成案です');
  });

  for (const [title, reply] of [
    ['括弧が外れた', '顧客A向けの構成案です'],
    ['隅付き括弧になった', '【顧客A】向けの構成案です'],
    ['空白が入った', '[顧客 A]向けの構成案です'],
  ] as const) {
    it(`仮名の${title}場合は「仮名の崩れ」として警告する`, async () => {
      const r = await answer(reply);
      assert.equal(r.outputCheck?.status, 'warning');
      assert.deepEqual(codes(r), ['placeholder_broken']);
    });
  }

  it('送っていない仮名（[顧客B]）を作った場合は警告する', async () => {
    assert.deepEqual(codes(await answer('[顧客A]と[顧客B]の比較です')), ['placeholder_unknown']);
  });

  it('[顧客AB] のような別の仮名を、[顧客A] の崩れと誤認しない', async () => {
    assert.deepEqual(codes(await answer('[顧客A]と[顧客AB]の比較です')), ['placeholder_unknown']);
  });

  it('AIが実名を推測して書いた場合は警告する', async () => {
    assert.deepEqual(codes(await answer('さくら年金基金向けの構成案です')), ['identifier_in_output']);
  });

  it('AIが口座番号を書いた場合は警告する', async () => {
    assert.deepEqual(codes(await answer('[顧客A]の口座番号 1234567 宛に送金してください')), ['sensitive_in_output']);
  });

  it('回答が上限で途切れた・拒否された場合も警告する', async () => {
    const stub = (stopReason: string): LlmClient => ({
      mode: 'mock',
      model: 'stub',
      complete: async () => ({ text: '途中まで', inputTokens: 1, outputTokens: 1, model: 'stub', tokensEstimated: true, stopReason }),
    });
    for (const [reason, code] of [['max_tokens', 'truncated'], ['refusal', 'refused']]) {
      const r = await new Guardrail({ inspector, client: stub(reason), pricing }).run({ user: 'u', department: 'd', prompt: 'こんにちは' });
      assert.deepEqual(codes(r), [code]);
    }
  });

  it('警告の種類は利用記録に残すが、回答の中身は残さない', async () => {
    const logger = new MemoryUsageLogger();
    const lg = new Guardrail({ inspector, client: new MockClient(), pricing, logger });
    await lg.protect(async () => 'さくら年金基金の口座 1234567 です')({ user: 'u', department: '運用部', prompt });
    assert.deepEqual(logger.records[0].outputIssues?.sort(), ['identifier_in_output', 'sensitive_in_output']);
    const json = JSON.stringify(logger.records);
    for (const secret of ['さくら', '1234567']) assert.ok(!json.includes(secret), secret);
    assert.equal(summarizeByDepartment(logger.records)[0].outputWarnings, 1);
  });
});

describe('エラー・費用・誤検知への備え', () => {
  it('AIの呼び出しが失敗しても落ちずに「エラー」として返し、記録する', async () => {
    const logger = new MemoryUsageLogger();
    const broken: LlmClient = {
      mode: 'live',
      model: 'broken',
      complete: async () => {
        throw new LlmError('Claude API に接続できません');
      },
    };
    const res = await new Guardrail({ inspector, client: broken, pricing, logger }).run({ user: 'u', department: 'IT部', prompt: '会議の議事録の型を作って' });
    assert.equal(res.status, 'error');
    assert.equal(res.error, 'Claude API に接続できません');
    assert.equal(logger.records[0].status, 'error');
    assert.equal(summarizeByDepartment(logger.records)[0].errors, 1);
  });

  it('上限を超える長い入力はAIに送らずに止める', async () => {
    const spy = new SpyClient();
    const logger = new MemoryUsageLogger();
    const g = new Guardrail({ inspector, client: spy, pricing, logger, maxInputChars: 100 });
    const res = await g.run({ user: 'u', department: 'd', prompt: 'あ'.repeat(101) });
    assert.equal(res.status, 'blocked');
    assert.equal(spy.prompts.length, 0);
    assert.ok(res.blockReasons[0].includes('上限100文字'));
    assert.deepEqual(logger.records[0].ruleIds, ['input_too_long']);
  });

  it('料金の既定値は claude-sonnet-5-5（入力 $2 / 出力 $10）', () => {
    const cfg = getConfig({});
    assert.equal(cfg.model, 'claude-sonnet-5-5');
    assert.deepEqual(cfg.pricing, { inputUsdPerMTok: 2, outputUsdPerMTok: 10 });
  });

  it('英語の機密キーワードは単語単位で照合する', () => {
    assert.equal(inspector.inspect('Please draft a confidentiality agreement template.').decision, 'allow');
    assert.equal(inspector.inspect('This memo is Confidential.').decision, 'block');
  });

  it('英語の依頼には、仮名を含んでいても英語で答える（模擬モード）', async () => {
    const r = await new MockClient().complete('Summarize the notes with [顧客A].');
    assert.ok(r.text.startsWith('[Mock answer] Regarding [顧客A]'));
  });
});

describe('部署別集計', () => {
  it('利用件数・ブロック件数・トークン・費用を部署ごとに合計する', async () => {
    const logger = new MemoryUsageLogger();
    const g = new Guardrail({ inspector, client: new MockClient(), pricing, logger });
    for (const tc of testCases) await g.run({ user: tc.user, department: tc.department, prompt: tc.input });
    const summary = summarizeByDepartment(logger.readAll());
    assert.equal(summary.reduce((n, s) => n + s.requests, 0), testCases.length);
    const ops = summary.find((s) => s.department === '運用部')!;
    assert.equal(ops.blocked, testCases.filter((t) => t.department === '運用部' && inspector.inspect(t.input).decision === 'block').length);
    assert.ok(summary.every((s) => s.estimatedCostUsd >= 0));
  });
});

describe('辞書CSV', () => {
  it('action に mask / block 以外が書かれていたらエラーにする', () => {
    assert.throws(() => parseDictionaryCsv('name,aliases,action\nA社,,delete', 'client'));
  });
});
