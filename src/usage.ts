import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Decision } from './types';

export interface Pricing {
  /** 入力 100万トークンあたりの料金（USD） */
  inputUsdPerMTok: number;
  /** 出力 100万トークンあたりの料金（USD） */
  outputUsdPerMTok: number;
}

export function estimateCostUsd(inputTokens: number, outputTokens: number, p: Pricing): number {
  const cost = (inputTokens / 1e6) * p.inputUsdPerMTok + (outputTokens / 1e6) * p.outputUsdPerMTok;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * APIを使わないとき（模擬モード・独自のAI呼び出し）のトークン数の目安。
 * 英数字はおよそ4文字で1トークン、日本語はおよそ1文字1トークンとして概算する。
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4 + other);
}

/** 利用記録。検知した値そのものは保存せず、ルールIDだけを残す */
export interface UsageRecord {
  timestamp: string;
  user: string;
  department: string;
  mode: 'live' | 'mock' | 'custom';
  model: string;
  status: 'sent' | 'blocked' | 'error';
  decision: Decision;
  ruleIds: string[];
  /** AIの回答チェックで見つかった問題の種類（値そのものは残さない）。古い記録には無い */
  outputIssues?: string[];
  inputTokens: number;
  outputTokens: number;
  tokensEstimated: boolean;
  estimatedCostUsd: number;
}

export interface UsageLogger {
  write(record: UsageRecord): void;
  readAll(): UsageRecord[];
}

/** JSON Lines 形式（1行1レコード）で追記する。監査ツールや表計算にそのまま取り込める */
export class JsonlUsageLogger implements UsageLogger {
  constructor(readonly path: string) {}

  write(record: UsageRecord): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, 'utf8');
  }

  readAll(): UsageRecord[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as UsageRecord);
  }

  reset(): void {
    rmSync(this.path, { force: true });
  }
}

export class MemoryUsageLogger implements UsageLogger {
  readonly records: UsageRecord[] = [];
  write(record: UsageRecord): void {
    this.records.push(record);
  }
  readAll(): UsageRecord[] {
    return [...this.records];
  }
}

export interface DepartmentSummary {
  department: string;
  requests: number;
  masked: number;
  blocked: number;
  /** AIの回答チェックで警告が出た件数 */
  outputWarnings: number;
  /** AI側のエラーで回答が得られなかった件数 */
  errors: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export function summarizeByDepartment(records: UsageRecord[]): DepartmentSummary[] {
  const map = new Map<string, DepartmentSummary>();
  for (const r of records) {
    const s =
      map.get(r.department) ??
      {
        department: r.department,
        requests: 0,
        masked: 0,
        blocked: 0,
        outputWarnings: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      };
    s.requests++;
    if (r.decision === 'mask') s.masked++;
    if (r.status === 'blocked') s.blocked++;
    if (r.status === 'error') s.errors++;
    if (r.outputIssues?.length) s.outputWarnings++;
    s.inputTokens += r.inputTokens;
    s.outputTokens += r.outputTokens;
    s.estimatedCostUsd = Math.round((s.estimatedCostUsd + r.estimatedCostUsd) * 1e6) / 1e6;
    map.set(r.department, s);
  }
  return [...map.values()].sort((a, b) => b.requests - a.requests || a.department.localeCompare(b.department, 'ja'));
}
