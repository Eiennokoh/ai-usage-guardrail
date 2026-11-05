import { readFileSync } from 'node:fs';
import type { Inspector } from './inspector';
import type { Decision } from './types';

export interface TestCase {
  id: string;
  title: string;
  user: string;
  department: string;
  input: string;
  /** 本来あるべき判定 */
  expected: Decision;
  expectedRules: string[];
  /** ルールでは正しく扱えないと分かっているケース（README の「限界」の根拠） */
  knownLimitation?: { actual: Decision; note: string };
}

export interface EvaluatedCase {
  testCase: TestCase;
  actual: Decision;
  actualRules: string[];
  correct: boolean;
}

export interface EvaluationReport {
  cases: EvaluatedCase[];
  total: number;
  correct: number;
  /** 機密情報を含むケース数（expected が mask / block） */
  sensitiveCases: number;
  /** 本来より甘い判定になった件数（例: ブロックすべきものを通過させた） */
  missed: number;
  missRate: number;
  /** ブロックすべきでないケース数（expected が allow / mask） */
  nonBlockCases: number;
  /** 本来ブロック不要なのにブロックした件数 */
  falseBlocked: number;
  falseBlockRate: number;
}

const STRICTNESS: Record<Decision, number> = { allow: 0, mask: 1, block: 2 };

export function loadTestCases(path: string): TestCase[] {
  return JSON.parse(readFileSync(path, 'utf8')) as TestCase[];
}

export function evaluate(inspector: Inspector, testCases: TestCase[]): EvaluationReport {
  const cases = testCases.map((testCase) => {
    const r = inspector.inspect(testCase.input);
    const actualRules = [...new Set(r.findings.map((f) => f.ruleId))];
    return { testCase, actual: r.decision, actualRules, correct: r.decision === testCase.expected };
  });

  const sensitive = cases.filter((c) => c.testCase.expected !== 'allow');
  const missed = sensitive.filter((c) => STRICTNESS[c.actual] < STRICTNESS[c.testCase.expected]);
  const nonBlock = cases.filter((c) => c.testCase.expected !== 'block');
  const falseBlocked = nonBlock.filter((c) => c.actual === 'block');

  return {
    cases,
    total: cases.length,
    correct: cases.filter((c) => c.correct).length,
    sensitiveCases: sensitive.length,
    missed: missed.length,
    missRate: sensitive.length ? missed.length / sensitive.length : 0,
    nonBlockCases: nonBlock.length,
    falseBlocked: falseBlocked.length,
    falseBlockRate: nonBlock.length ? falseBlocked.length / nonBlock.length : 0,
  };
}
