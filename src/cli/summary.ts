import { summarizeByDepartment, type UsageRecord } from '../usage';
import { table, usd } from './format';

export function departmentTable(records: UsageRecord[]): string {
  const rows = summarizeByDepartment(records).map((s) => [
    s.department,
    String(s.requests),
    String(s.masked),
    String(s.blocked),
    String(s.outputWarnings),
    String(s.errors),
    String(s.inputTokens + s.outputTokens),
    usd(s.estimatedCostUsd),
  ]);
  return table(['部署', '利用', 'マスク', 'ブロック', '回答の警告', 'エラー', 'トークン', '推定費用'], rows);
}
