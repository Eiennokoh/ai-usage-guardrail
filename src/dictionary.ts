import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FindingAction } from './types';

export type DictionaryCategory = 'client' | 'fund' | 'confidential';

export interface DictionaryEntry {
  name: string;
  aliases: string[];
  category: DictionaryCategory;
  action: FindingAction;
}

export const DICTIONARY_FILES: { file: string; category: DictionaryCategory }[] = [
  { file: 'clients.csv', category: 'client' },
  { file: 'funds.csv', category: 'fund' },
  { file: 'confidential_terms.csv', category: 'confidential' },
];

/**
 * 辞書CSVを読み込む。
 * 列: name,aliases,action,note  （aliases は「|」区切り、action は mask / block）
 * 「#」で始まる行はコメントとして無視する。
 */
export function parseDictionaryCsv(csv: string, category: DictionaryCategory): DictionaryEntry[] {
  const lines = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return [];

  const header = lines[0].split(',').map((s) => s.trim());
  const col = (row: string[], name: string) => row[header.indexOf(name)]?.trim() ?? '';

  return lines.slice(1).map((line, i) => {
    const row = line.split(',');
    const name = col(row, 'name');
    const action = (col(row, 'action') || 'mask') as FindingAction;
    if (!name) throw new Error(`辞書の ${i + 2} 行目に name がありません`);
    if (action !== 'mask' && action !== 'block') {
      throw new Error(`辞書の ${i + 2} 行目の action は mask か block にしてください: ${action}`);
    }
    const aliases = col(row, 'aliases')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    return { name, aliases, category, action };
  });
}

export function loadDictionaries(dir: string): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];
  for (const { file, category } of DICTIONARY_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    entries.push(...parseDictionaryCsv(readFileSync(path, 'utf8'), category));
  }
  return entries;
}
