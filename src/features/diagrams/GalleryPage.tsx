import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DiagramSummary } from '../../domain/types';
import { renameDiagram } from '../../editor/commands';
import { getRepository } from '../../persistence/local-storage';

interface Props { theme: 'light' | 'dark'; onTheme: () => void }
export function GalleryPage({ theme, onTheme }: Props) {
  const navigate = useNavigate(); const [items, setItems] = useState<DiagramSummary[]>([]); const [message, setMessage] = useState(''); const [query, setQuery] = useState('');
  const refresh = async () => setItems(await getRepository().list());
  useEffect(() => { void refresh().catch(() => setMessage('图库加载失败')); }, []);
  const create = async () => { const name = window.prompt('通路图名称', '未命名通路图')?.trim(); if (!name) return; try { const diagram = await getRepository().create({ name }); navigate(`/diagrams/${diagram.id}/edit`); } catch { setMessage('新建失败，请检查浏览器存储空间'); } };
  const duplicate = async (item: DiagramSummary) => { const name = window.prompt('副本名称', `${item.name} 副本`)?.trim(); if (!name) return; try { await getRepository().duplicate(item.id, name); await refresh(); setMessage('复制成功'); } catch { setMessage('复制失败'); } };
  const remove = async (item: DiagramSummary) => { if (!window.confirm(`删除“${item.name}”？此操作不可撤销。`)) return; try { await getRepository().delete(item.id); await refresh(); setMessage('已删除通路图'); } catch { setMessage('删除失败；图库至少需要保留一张图'); } };
  const rename = async (item: DiagramSummary) => { const name = window.prompt('新名称', item.name)?.trim(); if (!name || name === item.name) return; try { const diagram = await getRepository().get(item.id); await getRepository().save(renameDiagram(diagram, { name, description: diagram.description }), item.revision); await refresh(); setMessage('重命名成功'); } catch { setMessage('重命名失败'); } };
  const visible = items.filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="gallery-shell">
    <header className="gallery-header" aria-label="图库顶部栏">
      <div><span className="product-mark" aria-hidden="true">路</span><strong>业务通路图</strong></div>
      <div className="header-actions"><button className="icon-button" onClick={onTheme} aria-label={`切换到${theme === 'light' ? '深色' : '浅色'}主题`} title="切换主题">{theme === 'light' ? '◐' : '○'}</button><button className="primary-button" onClick={create}>＋ 新建通路图</button></div>
    </header>
    <main className="gallery-main">
      <section className="gallery-title"><div><p className="eyebrow">工作空间</p><h1>通路图库</h1><p>创建、维护并重新打开结构化业务通路图。</p></div><label className="search-field"><span className="sr-only">搜索通路图</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索通路图" /></label></section>
      {message && <div className="message-bar" role="status">{message}<button className="quiet-button" onClick={() => setMessage('')}>关闭</button></div>}
      <section className="diagram-grid" aria-label="通路图列表">
        <button className="new-diagram-card" onClick={create}><span>＋</span><strong>从空白图开始</strong><small>自动创建默认节点样式</small></button>
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
  </div>;
}
