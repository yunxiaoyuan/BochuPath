import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDialog } from '../../app/AppDialog';
import { isPageDropRuntime, usesSharedJsonRepository } from '../../app/runtime';
import { DomainError, errorMessages } from '../../domain/rules';
import type { DiagramSummary } from '../../domain/types';
import { renameDiagram } from '../../editor/commands';
import { getRepository } from '../../persistence/get-repository';
import { parseImportedJson } from '../../persistence/exchange';

interface Props { theme: 'light' | 'dark'; onTheme: () => void }
export function GalleryPage({ theme, onTheme }: Props) {
  const navigate = useNavigate(); const [items, setItems] = useState<DiagramSummary[]>([]); const [message, setMessage] = useState(''); const [query, setQuery] = useState(''); const [createOpen, setCreateOpen] = useState(false); const [newName, setNewName] = useState('未命名通路图');
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const dialog = useAppDialog();
  const pageDrop = isPageDropRuntime();
  const shared = usesSharedJsonRepository();
  const refresh = async () => setItems(await getRepository().list());
  useEffect(() => {
    const reload = () => void refresh().catch(() => setMessage('图库加载失败'));
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, []);
  const openCreate = () => { setNewName('未命名通路图'); setCreateOpen(true); };
  const create = async () => { const name = newName.trim(); if (!name) { setMessage('请输入通路图名称'); return; } try { const diagram = await getRepository().create({ name }); setCreateOpen(false); navigate(`/diagrams/${diagram.id}/edit`); } catch { setMessage('新建失败，请检查共享数据连接或浏览器存储'); } };
  const duplicate = async (item: DiagramSummary) => { const name = (await dialog.prompt({ title: '复制通路图', label: '副本名称', defaultValue: `${item.name} 副本`, confirmLabel: '复制' }))?.trim(); if (!name) return; try { await getRepository().duplicate(item.id, name); await refresh(); setMessage('复制成功'); } catch { setMessage('复制失败'); } };
  const remove = async (item: DiagramSummary) => { if (!await dialog.confirm({ title: '删除通路图', message: `删除“${item.name}”？此操作不可撤销。`, confirmLabel: '删除', destructive: true })) return; try { await getRepository().delete(item.id); await refresh(); setMessage('已删除通路图'); } catch { setMessage('删除失败；图库至少需要保留一张图'); } };
  const rename = async (item: DiagramSummary) => { const name = (await dialog.prompt({ title: '重命名通路图', label: '新名称', defaultValue: item.name, confirmLabel: '重命名' }))?.trim(); if (!name || name === item.name) return; try { const diagram = await getRepository().get(item.id); await getRepository().save(renameDiagram(diagram, { name, description: diagram.description }), item.revision); await refresh(); setMessage('重命名成功'); } catch { setMessage('重命名失败'); } };
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const imported = parseImportedJson(await readFileText(file));
      const created = await getRepository().importDiagram(imported);
      await refresh();
      setMessage(`已导入“${created.name}”`);
      navigate(`/diagrams/${created.id}/edit`);
    } catch (error) {
      setMessage(importErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };
  const visible = items.filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="gallery-shell">
    <header className="gallery-header" aria-label="图库顶部栏">
      <div><span className="product-mark" aria-hidden="true">路</span><strong>BochuPath 业务通路图</strong></div>
      <div className="header-actions"><button className="icon-button" onClick={onTheme} aria-label={`切换到${theme === 'light' ? '深色' : '浅色'}主题`} title="切换主题">{theme === 'light' ? '◐' : '○'}</button><button onClick={() => importInput.current?.click()} disabled={importing}>{importing ? '导入中…' : '导入 JSON'}</button><input ref={importInput} className="sr-only" type="file" accept="application/json,.json" aria-label="选择要导入的 JSON 文件" onChange={(event) => void importFile(event)} /><button className="primary-button" onClick={openCreate}>＋ 新建通路图</button></div>
    </header>
    <main className="gallery-main">
      <section className="gallery-title"><div><p className="eyebrow">{pageDrop ? 'PAGEDROP 异步协作' : shared ? '本机共享 JSON' : '本机工作空间'}</p><h1>通路图库</h1><p>{shared ? '保存后写入共享数据；其他协作者刷新或重新聚焦页面即可读取最新版本。' : '创建、维护并重新打开结构化业务通路图。'}</p></div><label className="search-field"><span className="sr-only">搜索通路图</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索通路图" /></label></section>
      {message && <div className="message-bar" role="status">{message}<button className="quiet-button" onClick={() => setMessage('')}>关闭</button></div>}
      <section className="diagram-grid" aria-label="通路图列表">
        <button className="new-diagram-card" onClick={openCreate}><span>＋</span><strong>从空白图开始</strong><small>自动创建默认节点样式</small></button>
        {visible.map((item) => <article className="diagram-card" key={item.id}>
          <button className="diagram-preview" onClick={() => navigate(`/diagrams/${item.id}/edit`)} aria-label={`编辑 ${item.name}`}>
            <span className="preview-lane"><i /><i /><i /></span><span className="preview-lane short"><i /><i /></span>
          </button>
          <div className="diagram-card-body"><div><h2 title={item.name}>{item.name}</h2><p>{item.nodeCount} 个节点 · {item.pathwayCount} 条通路</p><time>{new Date(item.updatedAt).toLocaleString('zh-CN')}</time></div>
            <div className="card-actions"><button onClick={() => navigate(`/diagrams/${item.id}/view`)}>查看</button><button onClick={() => void rename(item)}>重命名</button><button onClick={() => void duplicate(item)}>复制</button><button className="danger-text" onClick={() => void remove(item)}>删除</button></div>
          </div>
        </article>)}
      </section>
      {!visible.length && <div className="empty-state"><strong>没有匹配的通路图</strong><button onClick={() => setQuery('')}>清除筛选</button></div>}
    </main>
    {createOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateOpen(false)}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <h2 id="create-dialog-title">新建通路图</h2>
          <p>从空白图开始，系统会自动创建默认节点样式。</p>
          <label className="field"><span>通路图名称<b>*</b></span><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} /></label>
          <div className="modal-actions"><button type="button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary-button" type="button" onClick={() => void create()}>创建</button></div>
        </form>
      </section>
    </div>}
  </div>;
}

function importErrorMessage(error: unknown): string {
  if (error instanceof DomainError) return error.issue.message;
  if (error instanceof Error && error.message in errorMessages) return errorMessages[error.message as keyof typeof errorMessages];
  return '导入失败，请检查文件内容或稍后重试';
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FILE_READ_FAILED'));
    reader.readAsText(file, 'utf-8');
  });
}
