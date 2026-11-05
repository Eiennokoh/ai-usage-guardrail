const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  cyan: wrap(36),
};

/** 全角文字を2桁として数えた表示幅 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, '')) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
}

export function pad(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}

/*
 * 罫線「─」や「…」「①」「✕」「→」は、日本語版 Windows のターミナルでは全角幅で表示されることがあり、
 * 表がずれる原因になる。そのため表示には ASCII の記号だけを使う。
 */
export function truncate(s: string, width: number): string {
  if (displayWidth(s) <= width) return s;
  let out = '';
  for (const ch of s) {
    if (displayWidth(out + ch) > width - 3) return `${out}...`;
    out += ch;
  }
  return out;
}

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ''))));
  const line = (cells: string[]) => cells.map((cell, i) => pad(cell, widths[i])).join('  ').trimEnd();
  return [c.bold(line(headers)), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

export function decisionLabel(d: 'allow' | 'mask' | 'block', status?: 'sent' | 'blocked' | 'error'): string {
  if (status === 'error') return c.red('エラー');
  if (d === 'block') return c.red('ブロック');
  if (d === 'mask') return c.yellow('マスク');
  return c.green('通過');
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const usd = (x: number) => `$${x.toFixed(4)}`;

export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}
