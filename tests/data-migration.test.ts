import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createDemoDiagram } from '../src/domain/seed';
import { Store } from '../server/store';
import { importData } from '../scripts/import-data';

const directories: string[] = [];
afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
function directory() { const value = mkdtempSync(join(tmpdir(), 'bochupath-migration-test-')); directories.push(value); return value; }

describe('legacy shared JSON migration', () => {
  test('validates without writing, then imports once with exact IDs and a source backup', () => {
    const root = directory();
    const target = join(root, 'private-data');
    const source = join(root, 'bochupath-data.json');
    const diagram = createDemoDiagram();
    writeFileSync(source, JSON.stringify({ schemaVersion: '1.1', revision: 8, updatedAt: new Date().toISOString(), lastMutationId: 'old', diagrams: [diagram] }));
    const dryRun = importData({ source, dataDirectory: target, apply: false });
    expect(dryRun).toMatchObject({ diagramCount: 1, applied: false, alreadyApplied: false });

    const applied = importData({ source, dataDirectory: target, apply: true });
    expect(applied).toMatchObject({ diagramCount: 1, applied: true, alreadyApplied: false });
    expect(readFileSync(applied.backupPath!, 'utf8')).toBe(readFileSync(source, 'utf8'));
    const store = new Store(target);
    expect(store.diagrams().map((item) => item.id)).toEqual([diagram.id]);
    expect(store.audits()[0]?.action).toBe('data.legacy-json-imported');
    store.close();

    expect(importData({ source, dataDirectory: target, apply: true })).toMatchObject({ applied: false, alreadyApplied: true });
  });

  test('refuses duplicate IDs and refuses to overwrite a populated database', () => {
    const root = directory();
    const source = join(root, 'duplicate.json');
    const diagram = createDemoDiagram();
    writeFileSync(source, JSON.stringify({ diagrams: [diagram, diagram] }));
    expect(() => importData({ source, dataDirectory: join(root, 'target-a'), apply: false })).toThrow(/重复通路图 ID/);

    writeFileSync(source, JSON.stringify({ diagrams: [diagram] }));
    const target = join(root, 'target-b');
    const store = new Store(target); store.put('diagrams', diagram.id, diagram); store.close();
    expect(() => importData({ source, dataDirectory: target, apply: true })).toThrow(/已有通路图/);
  });
});
