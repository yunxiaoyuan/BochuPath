import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValid } from '../src/domain/rules';
import { parseDiagram } from '../src/domain/schema';
import type { Diagram } from '../src/domain/types';
import { Store } from '../server/store';

export interface ImportOptions { source: string; dataDirectory: string; apply: boolean }
export interface ImportResult { diagramCount: number; sourceHash: string; applied: boolean; alreadyApplied: boolean; backupPath?: string }

function diagramsFrom(input: unknown): Diagram[] {
  const candidates = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as { diagrams?: unknown }).diagrams)
      ? (input as { diagrams: unknown[] }).diagrams
      : [input];
  if (!candidates.length) throw new Error('源文件中没有通路图');
  const diagrams = candidates.map((item) => assertValid(parseDiagram(item)));
  const ids = new Set<string>();
  for (const diagram of diagrams) {
    if (ids.has(diagram.id)) throw new Error(`源文件包含重复通路图 ID：${diagram.id}`);
    ids.add(diagram.id);
  }
  return diagrams;
}

export function importData(options: ImportOptions): ImportResult {
  const source = resolve(options.source);
  const dataDirectory = resolve(options.dataDirectory);
  const raw = readFileSync(source);
  const sourceHash = createHash('sha256').update(raw).digest('hex');
  let decoded: unknown;
  try { decoded = JSON.parse(raw.toString('utf8')); } catch { throw new Error('源文件不是有效 JSON'); }
  const diagrams = diagramsFrom(decoded);
  if (!options.apply) return { diagramCount: diagrams.length, sourceHash, applied: false, alreadyApplied: false };

  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const store = new Store(dataDirectory);
  try {
    const marker = store.get<{ sourceHash: string; diagramCount: number }>('metadata', 'legacy-json-import');
    if (marker?.sourceHash === sourceHash) return { diagramCount: marker.diagramCount, sourceHash, applied: false, alreadyApplied: true };
    if (marker) throw new Error('该数据库已经从另一份 JSON 迁移过，禁止重复覆盖');
    if (store.diagrams().length) throw new Error('目标数据库已有通路图；迁移只允许写入空数据库');
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const backupPath = resolve(dataDirectory, `migration-source-${stamp}-${sourceHash.slice(0, 12)}-${basename(source)}`);
    copyFileSync(source, backupPath);
    store.transaction(() => {
      for (const diagram of diagrams) store.put('diagrams', diagram.id, diagram);
      store.put('metadata', 'legacy-json-import', { sourceHash, diagramCount: diagrams.length, source, backupPath, importedAt: store.timestamp() });
      store.audit('system', 'data.legacy-json-imported', 'migration', sourceHash, crypto.randomUUID(), undefined, { diagramCount: diagrams.length, backupPath });
    });
    return { diagramCount: diagrams.length, sourceHash, applied: true, alreadyApplied: false, backupPath };
  } finally { store.close(); }
}

function valueAfter(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少 ${flag} 参数`);
  return process.argv[index + 1]!;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = importData({ source: valueAfter('--source'), dataDirectory: valueAfter('--data-directory'), apply: process.argv.includes('--apply') });
    if (!result.applied && !result.alreadyApplied) {
      console.log(`校验通过：${result.diagramCount} 张通路图；未写入。确认停服且目标为空后增加 --apply。`);
    } else if (result.alreadyApplied) {
      console.log(`同一数据已经迁移：${result.diagramCount} 张通路图；未重复写入。`);
    } else {
      console.log(`迁移完成：${result.diagramCount} 张通路图；源文件备份：${result.backupPath}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : '数据迁移失败');
    process.exitCode = 1;
  }
}
