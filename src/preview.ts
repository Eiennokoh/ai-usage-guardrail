/** 画面やメッセージに出すときに、検知した値の中ほどを伏せる（例: 1234567 → 12***67） */
export function previewValue(value: string): string {
  const s = value.replace(/\s/g, '');
  // 「未公表」のような短い語は1文字目だけ見せる（全部伏せると何を検知したか分からない）
  if (s.length <= 4) return s.slice(0, 1) + '*'.repeat(Math.max(s.length - 1, 0));
  return `${s.slice(0, 2)}${'*'.repeat(Math.min(s.length - 4, 8))}${s.slice(-2)}`;
}
