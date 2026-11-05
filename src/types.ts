/** 判定結果: そのまま送る / 仮名に置き換えて送る / 送らずに止める */
export type Decision = 'allow' | 'mask' | 'block';

/** 個々の検知に対する処理 */
export type FindingAction = 'mask' | 'block';

export type Category =
  | 'client'
  | 'fund'
  | 'confidential'
  | 'email'
  | 'phone'
  | 'account'
  | 'my_number'
  | 'credit_card';

export interface Finding {
  ruleId: string;
  label: string;
  category: Category;
  action: FindingAction;
  /** 実際に一致した文字列（ログには保存しない） */
  value: string;
  start: number;
  end: number;
  /** 辞書由来の場合の正式名称（表記ゆれを同じ仮名にまとめるため） */
  canonical?: string;
  reason: string;
}

export interface InspectionResult {
  /** NFKC 正規化後のテキスト（全角数字・全角英字を半角に統一） */
  text: string;
  findings: Finding[];
  decision: Decision;
}
