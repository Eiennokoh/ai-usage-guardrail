import type { DictionaryEntry } from './dictionary';
import { DICTIONARY_RULES, PATTERN_RULES, type PatternRule } from './rules';
import type { Decision, Finding, InspectionResult } from './types';

/**
 * 送信前チェックの中核。書式ルールと辞書の両方でテキストを調べ、
 * 「通過 / マスク / ブロック」を判定する。外部通信は一切しない。
 */
export class Inspector {
  constructor(
    private readonly dictionary: DictionaryEntry[],
    private readonly rules: PatternRule[] = PATTERN_RULES,
  ) {}

  inspect(input: string): InspectionResult {
    // 全角数字「１２３」や全角英字を半角にそろえてから検査する
    const text = input.normalize('NFKC');
    const findings = dropContained(
      [...this.matchPatterns(text), ...this.matchDictionary(text)].sort(
        (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
      ),
    );
    return { text, findings, decision: decide(findings) };
  }

  private matchPatterns(text: string): Finding[] {
    const out: Finding[] = [];
    for (const rule of this.rules) {
      const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
      const re = new RegExp(rule.pattern.source, flags);
      for (const m of text.matchAll(re)) {
        const value = rule.group ? m[rule.group] : m[0];
        if (value === undefined) continue;
        if (rule.validate && !rule.validate(value)) continue;
        const start = (m.index ?? 0) + (rule.group ? m[0].lastIndexOf(value) : 0);
        out.push({
          ruleId: rule.id,
          label: rule.label,
          category: rule.category,
          action: rule.action,
          value,
          start,
          end: start + value.length,
          reason: rule.reason,
        });
      }
    }
    return out;
  }

  private matchDictionary(text: string): Finding[] {
    const out: Finding[] = [];
    const lower = text.toLowerCase();
    for (const entry of this.dictionary) {
      const meta = DICTIONARY_RULES[entry.category];
      for (const term of [entry.name, ...entry.aliases]) {
        const needle = term.normalize('NFKC').toLowerCase();
        if (!needle) continue;
        // 英語の語は単語単位で照合する（「Confidential」が「confidentiality」に反応しないように）
        const wordOnly = /^[a-z0-9]/.test(needle) && /[a-z0-9]$/.test(needle);
        for (let idx = lower.indexOf(needle); idx !== -1; idx = lower.indexOf(needle, idx + 1)) {
          if (wordOnly && (isWordChar(lower[idx - 1]) || isWordChar(lower[idx + needle.length]))) continue;
          const start = idx;
          idx += needle.length - 1; // 次は一致した語の後ろから探す
          out.push({
            ruleId: meta.id,
            label: meta.label,
            category: entry.category,
            action: entry.action,
            value: text.slice(start, start + needle.length),
            start,
            end: start + needle.length,
            canonical: entry.name,
            reason: meta.reason,
          });
        }
      }
    }
    return out;
  }
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[a-z0-9]/.test(ch);

/** 同じ種類の長い検知に含まれる短い検知（例: 「さくら年金基金」の中の「さくら年金」）を除く */
function dropContained(findings: Finding[]): Finding[] {
  return findings.filter(
    (f) =>
      !findings.some(
        (o) => o !== f && o.category === f.category && o.start <= f.start && o.end >= f.end && o.end - o.start > f.end - f.start,
      ),
  );
}

export function decide(findings: Finding[]): Decision {
  if (findings.some((f) => f.action === 'block')) return 'block';
  if (findings.length > 0) return 'mask';
  return 'allow';
}

/** 重なり合う検知（例: 「さくら年金」と「さくら年金基金」）は長い方だけを残す */
export function selectMaskTargets(findings: Finding[]): Finding[] {
  const candidates = findings
    .filter((f) => f.action === 'mask')
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: Finding[] = [];
  let lastEnd = -1;
  for (const f of candidates) {
    if (f.start >= lastEnd) {
      kept.push(f);
      lastEnd = f.end;
    }
  }
  return kept;
}
