import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setSessionIdentity } from '../src/auth/client';
import { createDemoDiagram } from '../src/domain/seed';
import { HttpDiagramRepository } from '../src/persistence/http';

describe('authenticated repository boundaries', () => {
  beforeEach(() => { localStorage.clear(); setSessionIdentity('member-a', 'csrf-a'); });
  afterEach(() => { setSessionIdentity(null, null); vi.unstubAllGlobals(); });

  it('isolates personal drafts by user and never adopts an unowned legacy draft', async () => {
    const repo = new HttpDiagramRepository(localStorage);
    const diagram = createDemoDiagram();
    localStorage.setItem(`bochupath:v1:draft:${diagram.id}`, JSON.stringify({ diagram, savedAt: new Date().toISOString() }));
    expect(await repo.getDraft(diagram.id)).toBeNull();
    await repo.saveDraft(diagram);
    setSessionIdentity('member-b', 'csrf-b');
    expect(await repo.getDraft(diagram.id)).toBeNull();
    await repo.saveDraft({ ...diagram, name: '乙的个人草稿' });
    setSessionIdentity('member-a', 'csrf-a');
    expect((await repo.getDraft(diagram.id))?.diagram.name).toBe(diagram.name);
    await repo.deleteDraft(diagram.id);
    setSessionIdentity('member-b', 'csrf-b');
    expect((await repo.getDraft(diagram.id))?.diagram.name).toBe('乙的个人草稿');
  });

  it('keeps the draft on permission denial and sends version, CSRF and a mutation key', async () => {
    const repo = new HttpDiagramRepository(localStorage);
    const diagram = createDemoDiagram();
    await repo.saveDraft(diagram);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'PERMISSION_REVOKED', message: '编辑权限已撤销' } }), { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(repo.save(diagram, 6)).rejects.toBeInstanceOf(ApiError);
    expect((await repo.getDraft(diagram.id))?.diagram).toEqual(diagram);
    const [, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(request.headers);
    expect(headers.get('If-Match')).toBe('6');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-a');
    expect(headers.get('Idempotency-Key')).toBeTruthy();
    expect(request.credentials).toBe('include');
  });

  it('does not delete a different account draft when an earlier account save completes', async () => {
    const repo = new HttpDiagramRepository(localStorage);
    const diagram = createDemoDiagram();
    await repo.saveDraft(diagram);
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveRequest = resolve; })));
    const pending = repo.save(diagram, diagram.revision);
    setSessionIdentity('member-b', 'csrf-b');
    await repo.saveDraft({ ...diagram, name: '乙的草稿' });
    resolveRequest(new Response(JSON.stringify({ ...diagram, revision: diagram.revision + 1 })));
    await pending;
    expect((await repo.getDraft(diagram.id))?.diagram.name).toBe('乙的草稿');
  });
});
