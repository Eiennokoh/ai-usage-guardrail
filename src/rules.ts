import type { Category, FindingAction } from './types';

/** 書式（正規表現）で検知するルール */
export interface PatternRule {
  id: string;
  label: string;
  category: Category;
  action: FindingAction;
  pattern: RegExp;
  /** 一致全体ではなく特定のグループだけを値として扱う場合に指定 */
  group?: number;
  /** チェックディジットなどで誤検知を減らすための追加検証 */
  validate?: (value: string) => boolean;
  reason: string;
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/**
 * マイナンバー（個人番号）のチェックディジット検証。
 * 12桁の数字すべてをブロックすると文書番号などを誤って止めてしまうため、
 * 法令で定められた検査用数字の計算式に合うものだけを対象にする。
 */
export function isValidMyNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 12) return false;
  let sum = 0;
  for (let n = 1; n <= 11; n++) {
    const p = Number(d[11 - n]);
    const q = n <= 6 ? n + 1 : n - 5;
    sum += p * q;
  }
  const r = sum % 11;
  const check = r <= 1 ? 0 : 11 - r;
  return check === Number(d[11]);
}

/** クレジットカード番号の Luhn チェック */
export function isValidLuhn(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export const PATTERN_RULES: PatternRule[] = [
  {
    id: 'my_number',
    label: 'マイナンバー',
    category: 'my_number',
    action: 'block',
    pattern: /(?<!\d)(?<!\d[-\s])\d{4}[-\s]?\d{4}[-\s]?\d{4}(?!\d)(?![-\s]\d)/g,
    validate: isValidMyNumber,
    reason: 'マイナンバーは法令で利用目的が限られており、社外のAIに送ることはできません。',
  },
  {
    id: 'credit_card',
    label: 'クレジットカード番号',
    category: 'credit_card',
    action: 'block',
    pattern: /(?<!\d)(?<!\d[-\s])\d{4}(?:[-\s]?\d{4}){3}(?!\d)(?![-\s]\d)/g,
    validate: isValidLuhn,
    reason: 'カード番号は不正利用につながるため、社外のAIに送ることはできません。',
  },
  {
    id: 'account_number',
    label: '口座番号',
    category: 'account',
    action: 'block',
    // 「口座」「口座番号」「Account No.」の近くにある7桁（支店番号付きも可）
    pattern: /(?:口座(?:番号)?|account\s*(?:no\.?|number|#)?)[^0-9\n]{0,6}?((?:\d{3}[-\s])?\d{7})(?!\d)/gi,
    group: 1,
    reason: '口座番号は顧客の資産に直結する情報のため、社外のAIに送ることはできません。',
  },
  {
    id: 'account_number',
    label: '口座番号',
    category: 'account',
    action: 'block',
    // 「123-4567890」のような支店番号-口座番号の書式
    pattern: /(?<![\d-])\d{3}-\d{7}(?![\d-])/g,
    reason: '口座番号は顧客の資産に直結する情報のため、社外のAIに送ることはできません。',
  },
  {
    id: 'email',
    label: 'メールアドレス',
    category: 'email',
    action: 'mask',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    reason: 'メールアドレスは個人を特定できるため、仮名に置き換えて送ります。',
  },
  {
    id: 'phone',
    label: '電話番号',
    category: 'phone',
    action: 'mask',
    pattern: /(?<![\d-])(?:0\d{1,4}-\d{1,4}-\d{3,4}|0[5789]0\d{8})(?![\d-])/g,
    reason: '電話番号は個人を特定できるため、仮名に置き換えて送ります。',
  },
];

/** 辞書（CSV）由来の検知に付けるルール情報 */
export const DICTIONARY_RULES = {
  client: {
    id: 'client_name',
    label: '顧客名',
    reason: '顧客名は社外のAIにそのまま送らず、仮名に置き換えます。',
  },
  fund: {
    id: 'fund_name',
    label: 'ファンド名',
    reason: '取扱ファンド名は顧客との取引内容の推測につながるため、仮名に置き換えます。',
  },
  confidential: {
    id: 'confidential_term',
    label: '機密キーワード',
    reason: '未公表情報や社外秘情報を含む可能性があるため、送信を止めました。内容をコンプライアンス部門に確認してください。',
  },
} as const;
