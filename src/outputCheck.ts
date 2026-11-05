import { previewValue } from './preview';
import type { Inspector } from './inspector';
import type { VaultEntry } from './masker';

/**
 * AIの回答に対するチェック（AIを信用しきらず、コードで確かめる）。
 *   - 仮名が崩れていないか（崩れると元の名前に戻せない）
 *   - 送っていない仮名を作っていないか
 *   - 送っていない実名や口座番号などを回答に書いていないか（推測・捏造）
 *   - 回答が途中で途切れたり、拒否されたりしていないか
 * 問題があっても回答は止めず「警告」として利用者に見せ、件数を利用記録に残す。
 */
export type OutputIssueCode =
  | 'placeholder_broken'
  | 'placeholder_unknown'
  | 'sensitive_in_output'
  | 'identifier_in_output'
  | 'truncated'
  | 'refused';

export interface OutputIssue {
  code: OutputIssueCode;
  message: string;
}

export interface OutputCheck {
  status: 'ok' | 'warning';
  issues: OutputIssue[];
}

/** 仮名の接頭辞（masker.ts の PREFIX と同じ） */
const PREFIXES = ['顧客', 'ファンド', 'メール', '電話', '機密'];
const PREFIX_RE = PREFIXES.join('|');
/** 角括弧の種類やすき間が違う仮名: 【顧客A】 ［顧客 A］ (顧客A) など */
const BRACKETED_RE = new RegExp(`[\\[［【(（]\\s*(${PREFIX_RE})\\s*([A-Z]+)\\s*[\\]］】)）]`, 'g');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function checkOutput(
  aiText: string,
  vault: VaultEntry[],
  inspector: Inspector,
  stopReason?: string | null,
): OutputCheck {
  const issues: OutputIssue[] = [];
  const known = new Set(vault.map((e) => e.placeholder.slice(1, -1)));

  // 1) 正しい形の仮名を取り除いてから、崩れた形・知らない仮名を探す
  let rest = aiText;
  for (const inner of known) rest = rest.split(`[${inner}]`).join(' ').split(`［${inner}］`).join(' ');

  const broken = new Set<string>();
  const unknown = new Set<string>();
  rest = rest.replace(BRACKETED_RE, (m, prefix: string, letters: string) => {
    (known.has(prefix + letters) ? broken : unknown).add(m);
    return ' ';
  });
  for (const inner of known) {
    const [, prefix, letters] = inner.match(new RegExp(`^(${PREFIX_RE})([A-Z]+)$`)) ?? [];
    if (!prefix) continue;
    // 括弧が外れた「顧客A」（後ろに英字が続く「顧客AB」は別の仮名なので除く）
    for (const m of rest.match(new RegExp(`${escapeRe(prefix)}\\s*${letters}(?![A-Za-z])`, 'g')) ?? []) broken.add(m);
  }
  if (broken.size) {
    issues.push({
      code: 'placeholder_broken',
      message: `仮名の書き方が崩れていて元の名前に戻せません: ${[...broken].join('、')}`,
    });
  }
  if (unknown.size) {
    issues.push({
      code: 'placeholder_unknown',
      message: `送っていない仮名が回答に含まれています: ${[...unknown].join('、')}`,
    });
  }

  // 2) 復元する前の回答を、入力と同じルールで検査する。
  //    AIには仮名しか渡していないので、実名や番号が出てきたら推測・捏造の可能性がある
  const found = inspector.inspect(aiText).findings;
  const describe = (fs: typeof found) =>
    [...new Map(fs.map((f) => [`${f.label}${f.value}`, `${f.label}（${previewValue(f.value)}）`])).values()].join('、');
  const high = found.filter((f) => f.action === 'block');
  const low = found.filter((f) => f.action === 'mask');
  if (high.length) {
    issues.push({
      code: 'sensitive_in_output',
      message: `送っていない機密情報が回答に含まれています: ${describe(high)}。そのまま使わず内容を確認してください。`,
    });
  }
  if (low.length) {
    issues.push({
      code: 'identifier_in_output',
      message: `仮名で送ったはずの情報が実名・実データで回答に含まれています: ${describe(low)}。AIの推測の可能性があります。`,
    });
  }

  // 3) 回答の終わり方
  if (stopReason === 'max_tokens') {
    issues.push({ code: 'truncated', message: '回答が最大トークン数で途切れています（MAX_TOKENS を確認）。' });
  }
  if (stopReason === 'refusal') {
    issues.push({ code: 'refused', message: 'AIが回答を断りました。依頼内容を見直してください。' });
  }

  return { status: issues.length ? 'warning' : 'ok', issues };
}
