import type { Inspector } from './inspector';
import { LlmError, type LlmClient } from './llm/types';
import { maskText, restoreText, type MaskResult } from './masker';
import { checkOutput, type OutputCheck } from './outputCheck';
import { previewValue } from './preview';
import type { Decision, Finding, InspectionResult } from './types';
import { estimateCostUsd, estimateTokens, type Pricing, type UsageLogger, type UsageRecord } from './usage';

export { previewValue } from './preview';

export const DEFAULT_SYSTEM_PROMPT = [
  'あなたは資産運用会社の社内アシスタントです。',
  '入力に含まれる [顧客A] や [ファンドA] のような角括弧の語は、顧客情報を伏せるための仮名です。',
  '仮名は推測で別の名前に置き換えたり括弧を外したりせず、同じ表記のまま回答に使ってください。',
].join('\n');

/** 1回の入力の上限文字数（MAX_INPUT_CHARS）の既定値。大量の貼り付けによる費用の増加を防ぐ */
export const DEFAULT_MAX_INPUT_CHARS = 8000;

export interface GuardRequest {
  user: string;
  department: string;
  prompt: string;
}

/** 画面やログに出してよい形の検知情報（値は一部を伏せる） */
export interface PublicFinding {
  ruleId: string;
  label: string;
  action: 'mask' | 'block';
  preview: string;
}

export interface GuardResult {
  /** sent: 送信した / blocked: 送信前に止めた / error: 送信したがAI側でエラーになった */
  status: 'sent' | 'blocked' | 'error';
  decision: Decision;
  findings: PublicFinding[];
  blockReasons: string[];
  /** 実際にAIへ送った文（ブロック時は undefined） */
  sentPrompt?: string;
  aiResponse?: string;
  /** 仮名を元に戻した回答 */
  restoredResponse?: string;
  /** AIの回答に対するチェック結果（送信できた場合のみ） */
  outputCheck?: OutputCheck;
  /** status が error のときの理由 */
  error?: string;
  mode: UsageRecord['mode'];
  model: string;
  inputTokens: number;
  outputTokens: number;
  tokensEstimated: boolean;
  estimatedCostUsd: number;
}

export interface CheckResult {
  inspection: InspectionResult;
  masked?: MaskResult;
  findings: PublicFinding[];
  blockReasons: string[];
  /** 検知ルール以外でブロックした理由（入力が長すぎる など）のID */
  extraRuleIds: string[];
}

function toPublic(findings: Finding[]): PublicFinding[] {
  return findings.map((f) => ({ ruleId: f.ruleId, label: f.label, action: f.action, preview: previewValue(f.value) }));
}

function blockReasonsOf(findings: Finding[]): string[] {
  const seen = new Set<string>();
  const reasons: string[] = [];
  for (const f of findings) {
    if (f.action !== 'block' || seen.has(f.ruleId)) continue;
    seen.add(f.ruleId);
    reasons.push(`${f.label}（${previewValue(f.value)}）を検知: ${f.reason}`);
  }
  return reasons;
}

export interface GuardrailDeps {
  inspector: Inspector;
  client: LlmClient;
  pricing: Pricing;
  logger?: UsageLogger;
  systemPrompt?: string;
  /** 入力の上限文字数（省略時 8000） */
  maxInputChars?: number;
  now?: () => Date;
}

type AiPart = Pick<GuardResult, 'mode' | 'model' | 'aiResponse' | 'inputTokens' | 'outputTokens' | 'tokensEstimated'> & {
  stopReason?: string | null;
};

/**
 * 生成AIに送る前後のチェックをまとめた本体。
 *   1. 入力の検査（書式ルール＋辞書）           … コード
 *   2. 高リスクはブロック、低リスクは仮名に置換 … コード
 *   3. 回答の作成                               … AI（ここだけ）
 *   4. 回答のチェック（仮名の崩れ・実名の混入） … コード
 *   5. 仮名を元に戻して、利用記録を残す         … コード（検知した値そのものは残さない）
 */
export class Guardrail {
  constructor(private readonly deps: GuardrailDeps) {}

  get mode(): 'live' | 'mock' {
    return this.deps.client.mode;
  }

  /** AIを呼ばずに判定だけを行う（画面の事前チェックやテスト用） */
  check(prompt: string): CheckResult {
    const limit = this.deps.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    if (prompt.length > limit) {
      return {
        inspection: { text: prompt, findings: [], decision: 'block' },
        findings: [],
        blockReasons: [`入力が長すぎます（${prompt.length}文字／上限${limit}文字）。費用がかさむため、必要な部分だけに絞ってください。`],
        extraRuleIds: ['input_too_long'],
      };
    }
    const inspection = this.deps.inspector.inspect(prompt);
    const masked = inspection.decision === 'block' ? undefined : maskText(inspection.text, inspection.findings);
    return {
      inspection,
      masked,
      findings: toPublic(inspection.findings),
      blockReasons: blockReasonsOf(inspection.findings),
      extraRuleIds: [],
    };
  }

  /** 内蔵のAIクライアント（Claude API または模擬）で送信する */
  async run(req: GuardRequest): Promise<GuardResult> {
    const { client } = this.deps;
    const checked = this.check(req.prompt);
    if (!checked.masked) return this.blocked(req, checked, client.mode, client.model);

    const system = this.deps.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    try {
      const ai = await client.complete(checked.masked.text, system);
      return this.finish(req, checked, {
        mode: client.mode,
        model: ai.model,
        aiResponse: ai.text,
        inputTokens: ai.inputTokens,
        outputTokens: ai.outputTokens,
        tokensEstimated: ai.tokensEstimated,
        stopReason: ai.stopReason,
      });
    } catch (e) {
      return this.failed(req, checked, client.mode, client.model, e);
    }
  }

  /**
   * 他のプロジェクトが持っている「AIを呼ぶ関数」を、このチェックの内側に包む。
   *   const safeAsk = guardrail.protect((p) => myOwnAiCall(p));
   *   const res = await safeAsk({ user, department, prompt });
   * 包まれた関数には、マスク済みの文しか渡らない。回答も同じようにチェックする。
   */
  protect(callAi: (safePrompt: string) => Promise<string>, options: { model?: string } = {}) {
    return async (req: GuardRequest): Promise<GuardResult> => {
      const checked = this.check(req.prompt);
      const model = options.model ?? 'custom';
      if (!checked.masked) return this.blocked(req, checked, 'custom', model);
      try {
        const answer = await callAi(checked.masked.text);
        return this.finish(req, checked, {
          mode: 'custom',
          model,
          aiResponse: answer,
          inputTokens: estimateTokens(checked.masked.text),
          outputTokens: estimateTokens(answer),
          tokensEstimated: true,
        });
      } catch (e) {
        return this.failed(req, checked, 'custom', model, e);
      }
    };
  }

  private blocked(req: GuardRequest, checked: CheckResult, mode: GuardResult['mode'], model: string): GuardResult {
    const result: GuardResult = {
      status: 'blocked',
      decision: 'block',
      findings: checked.findings,
      blockReasons: checked.blockReasons,
      mode,
      model,
      inputTokens: 0,
      outputTokens: 0,
      tokensEstimated: false,
      estimatedCostUsd: 0,
    };
    this.log(req, result, checked);
    return result;
  }

  private failed(req: GuardRequest, checked: CheckResult, mode: GuardResult['mode'], model: string, e: unknown): GuardResult {
    const message = e instanceof LlmError ? e.message : `AIの呼び出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`;
    const result: GuardResult = {
      status: 'error',
      decision: checked.inspection.decision,
      findings: checked.findings,
      blockReasons: [],
      sentPrompt: checked.masked?.text,
      error: message,
      mode,
      model,
      inputTokens: 0,
      outputTokens: 0,
      tokensEstimated: false,
      estimatedCostUsd: 0,
    };
    this.log(req, result, checked);
    return result;
  }

  private finish(req: GuardRequest, checked: CheckResult, ai: AiPart): GuardResult {
    const masked = checked.masked!;
    const { stopReason, ...aiFields } = ai;
    const aiText = ai.aiResponse ?? '';
    const result: GuardResult = {
      status: 'sent',
      decision: checked.inspection.decision,
      findings: checked.findings,
      blockReasons: [],
      sentPrompt: masked.text,
      restoredResponse: restoreText(aiText, masked.vault),
      outputCheck: checkOutput(aiText, masked.vault, this.deps.inspector, stopReason),
      ...aiFields,
      estimatedCostUsd: estimateCostUsd(ai.inputTokens, ai.outputTokens, this.deps.pricing),
    };
    this.log(req, result, checked);
    return result;
  }

  private log(req: GuardRequest, result: GuardResult, checked: CheckResult): void {
    this.deps.logger?.write({
      timestamp: (this.deps.now?.() ?? new Date()).toISOString(),
      user: req.user,
      department: req.department,
      mode: result.mode,
      model: result.model,
      status: result.status,
      decision: result.decision,
      ruleIds: [...new Set([...checked.inspection.findings.map((f) => f.ruleId), ...checked.extraRuleIds])],
      outputIssues: result.outputCheck?.issues.map((i) => i.code) ?? [],
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      tokensEstimated: result.tokensEstimated,
      estimatedCostUsd: result.estimatedCostUsd,
    });
  }
}
