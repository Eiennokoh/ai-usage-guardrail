import { selectMaskTargets } from './inspector';
import type { Category, Finding } from './types';

const PREFIX: Partial<Record<Category, string>> = {
  client: '顧客',
  fund: 'ファンド',
  email: 'メール',
  phone: '電話',
};

export interface VaultEntry {
  placeholder: string;
  original: string;
  category: Category;
}

export interface MaskResult {
  text: string;
  /** 仮名と元の値の対応表。社内（このプロセス内）にだけ保持し、AIにもログにも渡さない */
  vault: VaultEntry[];
}

function toLetters(n: number): string {
  let s = '';
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

const keyOf = (f: Finding) => `${f.category}:${(f.canonical ?? f.value).toLowerCase()}`;

/**
 * 低リスクの検知を [顧客A] のような仮名に置き換える。
 * 同じ顧客は表記が違っても（正式名称・略称・英語名）同じ仮名にそろえる。
 */
export function maskText(text: string, findings: Finding[]): MaskResult {
  const targets = selectMaskTargets(findings);
  const byKey = new Map<string, VaultEntry>();
  const counters = new Map<Category, number>();
  const vault: VaultEntry[] = [];

  for (const f of targets) {
    const key = keyOf(f);
    if (byKey.has(key)) continue;
    const n = counters.get(f.category) ?? 0;
    counters.set(f.category, n + 1);
    const entry: VaultEntry = {
      placeholder: `[${PREFIX[f.category] ?? '機密'}${toLetters(n)}]`,
      original: f.value,
      category: f.category,
    };
    byKey.set(key, entry);
    vault.push(entry);
  }

  let out = '';
  let cursor = 0;
  for (const f of targets) {
    out += text.slice(cursor, f.start) + byKey.get(keyOf(f))!.placeholder;
    cursor = f.end;
  }
  out += text.slice(cursor);
  return { text: out, vault };
}

/** AIの回答に含まれる仮名を元の値に戻す（全角の角括弧で返ってきた場合にも対応） */
export function restoreText(text: string, vault: VaultEntry[]): string {
  let out = text;
  for (const e of vault) {
    const inner = e.placeholder.slice(1, -1);
    out = out.split(`[${inner}]`).join(e.original).split(`［${inner}］`).join(e.original);
  }
  return out;
}
