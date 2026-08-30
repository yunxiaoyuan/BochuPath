import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { useAppDialog } from "../../../app/AppDialog";
import type {
  DiagramNode,
  EditorMode,
  Layer,
  NodeStyle,
  Pathway,
} from "../../../domain/types";
import {
  descendantIds,
  isLeafLayer,
  validateDiagram,
} from "../../../domain/rules";
import {
  fullLayerPath,
  leafLayers,
  nodePathways,
  styleReferenceCount,
} from "../../../domain/selectors";
import {
  createLayer,
  createLayersBatch,
  createNode,
  createNodesBatch,
  createNodeStyle,
  createPathway,
  deleteLayerWithMigration,
  deleteNode,
  deleteNodeStyleWithReplacement,
  deletePathway,
  duplicateNode,
  duplicateNodeStyle,
  getDeleteNodeImpact,
  renameDiagram,
  setDefaultStyle,
  updateLayer,
  updateLayoutConfig,
  updateNode,
  updateNodeStyle,
  updatePathway,
} from "../../../editor/commands";
import { parseBatchNames } from "../../../editor/batch-input";
import { useEditorStore } from "../../../editor/store";
import type { CreateKind } from "../WorkspacePage";

interface Props {
  mode: EditorMode;
  createKind: CreateKind;
  onCreateHandled: () => void;
  onClose: () => void;
}
export function Inspector({
  mode,
  createKind,
  onCreateHandled,
  onClose,
}: Props) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const selection = useEditorStore((s) => s.selection);
  const draft = useEditorStore((s) => s.pathwayDraft);
  const tool = useEditorStore((s) => s.tool);
  const historyVersion = useEditorStore(
    (s) => `${s.history.past.length}:${s.history.future.length}`,
  );
  const key = `${createKind ?? (selection ? `${selection.kind}:${selection.id}` : "diagram")}:${diagram.updatedAt}:${diagram.revision}:${historyVersion}`;
  let content: React.ReactNode;
  if (tool === "connectPathway" && draft) content = <DraftPathwayForm />;
  else if (createKind === "layer")
    content = <LayerForm onDone={onCreateHandled} />;
  else if (createKind === "node")
    content = <NodeForm onDone={onCreateHandled} />;
  else if (createKind === "nodeStyle")
    content = <StyleForm onDone={onCreateHandled} />;
  else if (createKind === "pathway")
    content = <PathwayForm onDone={onCreateHandled} />;
  else if (createKind === "batch")
    content = <BatchCreateForm onDone={onCreateHandled} />;
  else if (selection?.kind === "layer")
    content = (
      <LayerForm
        layer={diagram.layers.find((x) => x.id === selection.id)}
        mode={mode}
      />
    );
  else if (selection?.kind === "node")
    content = (
      <NodeForm
        node={diagram.nodes.find((x) => x.id === selection.id)}
        mode={mode}
      />
    );
  else if (selection?.kind === "nodeStyle")
    content = (
      <StyleForm
        style={diagram.nodeStyles.find((x) => x.id === selection.id)}
        mode={mode}
      />
    );
  else if (selection?.kind === "pathway")
    content = (
      <PathwayForm
        pathway={diagram.pathways.find((x) => x.id === selection.id)}
        mode={mode}
      />
    );
  else content = <DiagramForm mode={mode} />;
  return (
    <aside id="inspector-region" className="inspector" aria-label="属性面板">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">Inspector</span>
          <h2>{title(createKind, selection?.kind, tool)}</h2>
        </div>
        <button
          className="panel-close"
          onClick={onClose}
          aria-label="关闭属性面板"
        >
          ×
        </button>
      </div>
      <div key={key} className="inspector-content">
        {content}
      </div>
    </aside>
  );
}

function title(create: CreateKind, selection?: string, tool?: string): string {
  if (tool === "connectPathway") return "新建通路";
  if (create === "batch") return "批量添加";
  if (create)
    return `新建${({ layer: "层级", node: "节点", nodeStyle: "样式", pathway: "通路" } as const)[create]}`;
  return (
    (
      {
        layer: "层级属性",
        node: "节点属性",
        nodeStyle: "样式属性",
        pathway: "通路属性",
        diagram: "图概览",
      } as Record<string, string>
    )[selection ?? "diagram"] ?? "图概览"
  );
}

function DiagramForm({ mode }: { mode: EditorMode }) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const execute = useEditorStore((s) => s.execute);
  const [name, setName] = useState(diagram.name);
  const [description, setDescription] = useState(diagram.description ?? "");
  const [direction, setDirection] = useState(diagram.layout.direction);
  const [layerGap, setLayerGap] = useState(diagram.layout.layerGap);
  const [nodeGap, setNodeGap] = useState(diagram.layout.nodeGap);
  const issues = validateDiagram(diagram);
  if (mode === "view")
    return (
      <div className="detail-stack">
        <Overview
          diagramName={diagram.name}
          counts={[
            ["层级", diagram.layers.length],
            ["节点", diagram.nodes.length],
            ["通路", diagram.pathways.length],
            ["样式", diagram.nodeStyles.length],
          ]}
        />
        <Detail label="说明" value={diagram.description || "暂无说明"} />
        <Detail
          label="布局方向"
          value={diagram.layout.direction === "TB" ? "从上到下" : "从左到右"}
        />
        {issues.length > 0 && <IssueList />}
      </div>
    );
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    execute("更新通路图", (current) =>
      updateLayoutConfig(renameDiagram(current, { name, description }), {
        direction,
        layerGap,
        nodeGap,
      }),
    );
  };
  const reset = () => {
    setName(diagram.name);
    setDescription(diagram.description ?? "");
    setDirection(diagram.layout.direction);
    setLayerGap(diagram.layout.layerGap);
    setNodeGap(diagram.layout.nodeGap);
  };
  return (
    <form className="property-form" onSubmit={submit}>
      <Overview
        diagramName={diagram.name}
        counts={[
          ["层级", diagram.layers.length],
          ["节点", diagram.nodes.length],
          ["通路", diagram.pathways.length],
          ["样式", diagram.nodeStyles.length],
        ]}
      />
      <Field label="名称" required>
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="说明">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="方向">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "TB" | "LR")}
        >
          <option value="TB">从上到下（TB）</option>
          <option value="LR">从左到右（LR）</option>
        </select>
      </Field>
      <div className="field-grid">
        <Field label="层级间距">
          <input
            type="number"
            min={8}
            max={160}
            value={layerGap}
            onChange={(e) => setLayerGap(Number(e.target.value))}
          />
        </Field>
        <Field label="节点间距">
          <input
            type="number"
            min={8}
            max={160}
            value={nodeGap}
            onChange={(e) => setNodeGap(Number(e.target.value))}
          />
        </Field>
      </div>
      {issues.length > 0 && <IssueList />}
      <FormFooter onCancel={reset} onConfirm={submit} />
    </form>
  );
}

function BatchCreateForm({ onDone }: { onDone: () => void }) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const selection = useEditorStore((s) => s.selection);
  const execute = useEditorStore((s) => s.execute);
  const select = useEditorStore((s) => s.select);
  const leaves = leafLayers(diagram);
  const contextualLayerId =
    selection?.kind === "layer"
      ? selection.id
      : selection?.kind === "node"
        ? diagram.nodes.find((node) => node.id === selection.id)?.layerId
        : undefined;
  const [objectKind, setObjectKind] = useState<"node" | "layer">("node");
  const [rawNames, setRawNames] = useState("");
  const [parentId, setParentId] = useState(
    selection?.kind === "layer" ? selection.id : "",
  );
  const [layerId, setLayerId] = useState(
    contextualLayerId && isLeafLayer(diagram, contextualLayerId)
      ? contextualLayerId
      : (leaves[0]?.id ?? ""),
  );
  const [styleId, setStyleId] = useState(
    diagram.nodeStyles.find((style) => style.isDefault)?.id ??
      diagram.nodeStyles[0]?.id ??
      "",
  );
  const names = useMemo(() => parseBatchNames(rawNames), [rawNames]);
  const maxNameLength = objectKind === "layer" ? 40 : 80;
  const tooLongNames = names.filter((name) => name.length > maxNameLength);
  const duplicateLayerNames = useMemo(() => {
    if (objectKind !== "layer") return [];
    const occupied = new Set(
      diagram.layers
        .filter((layer) => layer.parentId === (parentId || null))
        .map((layer) => layer.name.trim().toLocaleLowerCase()),
    );
    const conflicts = new Set<string>();
    names.forEach((name) => {
      const normalized = name.toLocaleLowerCase();
      if (occupied.has(normalized)) conflicts.add(name);
      occupied.add(normalized);
    });
    return [...conflicts];
  }, [diagram.layers, names, objectKind, parentId]);
  const missingTarget =
    objectKind === "node" && (!layerId || !styleId || !leaves.length);
  const invalid =
    !names.length ||
    tooLongNames.length > 0 ||
    duplicateLayerNames.length > 0 ||
    missingTarget;
  const affectedParentNodes = parentId
    ? diagram.nodes.filter((node) => node.layerId === parentId)
    : [];

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (invalid) return;
    const before = new Set(
      objectKind === "layer"
        ? diagram.layers.map((item) => item.id)
        : diagram.nodes.map((item) => item.id),
    );
    const ok = execute(
      `批量添加 ${names.length} 个${objectKind === "layer" ? "层级" : "节点"}`,
      (current) =>
        objectKind === "layer"
          ? createLayersBatch(current, {
              names,
              parentId: parentId || null,
            })
          : createNodesBatch(current, { names, layerId, styleId }),
    );
    if (!ok) return;
    const current = useEditorStore.getState().diagram;
    const created =
      objectKind === "layer"
        ? current?.layers.filter((item) => !before.has(item.id)).at(-1)
        : current?.nodes.filter((item) => !before.has(item.id)).at(-1);
    if (created)
      select(
        objectKind === "layer"
          ? { kind: "layer", id: created.id }
          : { kind: "node", id: created.id },
      );
    onDone();
  };

  return (
    <form className="property-form" onSubmit={submit}>
      <p className="inline-info">
        同一批对象共享归属设置，并追加在已有对象之后；输入顺序就是显示顺序。
      </p>
      <Field label="对象类型" required>
        <select
          value={objectKind}
          onChange={(event) =>
            setObjectKind(event.target.value as "node" | "layer")
          }
        >
          <option value="node">节点</option>
          <option value="layer">层级</option>
        </select>
      </Field>
      {objectKind === "layer" ? (
        <Field label="上级层级">
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">顶层</option>
            {diagram.layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {fullLayerPath(diagram, layer.id)}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          {!leaves.length && (
            <p className="inline-warning">请先创建层级，节点只能属于叶子层级。</p>
          )}
          <Field label="所属叶子层级" required>
            <select
              required
              value={layerId}
              onChange={(event) => setLayerId(event.target.value)}
            >
              {diagram.layers.map((layer) => (
                <option
                  key={layer.id}
                  value={layer.id}
                  disabled={!isLeafLayer(diagram, layer.id)}
                >
                  {fullLayerPath(diagram, layer.id)}
                  {!isLeafLayer(diagram, layer.id) ? "（不可选）" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="节点样式" required>
            <select
              required
              value={styleId}
              onChange={(event) => setStyleId(event.target.value)}
            >
              {diagram.nodeStyles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                  {style.isDefault ? "（默认）" : ""}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field
        label={objectKind === "layer" ? "层级名称列表" : "节点名称列表"}
        required
      >
        <textarea
          autoFocus
          required
          rows={5}
          value={rawNames}
          onChange={(event) => setRawNames(event.target.value)}
          placeholder={
            objectKind === "layer"
              ? "需求层；方案层；交付层"
              : "需求确认；方案评审；交付验收"
          }
        />
        <small>
          支持中文分号“；”、英文分号“;”或换行；连续分隔符和空白项会忽略。
        </small>
      </Field>
      {affectedParentNodes.length > 0 && objectKind === "layer" && (
        <p className="inline-warning">
          该上级已有 {affectedParentNodes.length} 个节点；提交后会一次迁入首个新层级
          {names[0] ? `“${names[0]}”` : ""}。
        </p>
      )}
      {tooLongNames.length > 0 && (
        <p className="field-error">
          名称长度不能超过 {maxNameLength} 个字符：{tooLongNames.join("、")}
        </p>
      )}
      {duplicateLayerNames.length > 0 && (
        <p className="field-error">
          同一上级下层级名称不能重复：{duplicateLayerNames.join("、")}
        </p>
      )}
      <section className="batch-preview" aria-live="polite">
        <strong>
          {names.length
            ? `将按顺序添加 ${names.length} 个${objectKind === "layer" ? "层级" : "节点"}`
            : "输入后将在这里预览"}
        </strong>
        {names.length > 0 && (
          <ol className="batch-preview-list">
            {names.map((name, index) => (
              <li key={`${name}-${index}`}>
                <b>{index + 1}</b>
                <span>{name}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <FormFooter onCancel={onDone} onConfirm={submit} disabled={invalid} />
    </form>
  );
}

function LayerForm({
  layer,
  mode = "edit",
  onDone,
}: {
  layer?: Layer;
  mode?: EditorMode;
  onDone?: () => void;
}) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const execute = useEditorStore((s) => s.execute);
  const select = useEditorStore((s) => s.select);
  const dialog = useAppDialog();
  const [name, setName] = useState(layer?.name ?? "");
  const [parentId, setParentId] = useState<string>(layer?.parentId ?? "");
  const [order, setOrder] = useState(layer?.order ?? 10);
  const [description, setDescription] = useState(layer?.description ?? "");
  const [target, setTarget] = useState("");
  if (mode === "view" && layer)
    return (
      <div className="detail-stack">
        <Detail label="层级名称" value={layer.name} />
        <Detail
          label="上级层级"
          value={
            layer.parentId
              ? (diagram.layers.find((x) => x.id === layer.parentId)?.name ??
                "未知")
              : "顶层"
          }
        />
        <Detail label="顺序" value={String(layer.order)} />
        <Detail label="说明" value={layer.description || "暂无说明"} />
      </div>
    );
  const invalidParents = layer
    ? descendantIds(diagram, layer.id)
    : new Set<string>();
  if (layer) invalidParents.add(layer.id);
  const removedIds = layer
    ? descendantIds(diagram, layer.id)
    : new Set<string>();
  if (layer) removedIds.add(layer.id);
  const affected = layer
    ? diagram.nodes.filter((x) => removedIds.has(x.layerId))
    : [];
  const targets = leafLayers(diagram).filter((x) => !removedIds.has(x.id));
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const before = new Set(diagram.layers.map((x) => x.id));
    const ok = execute(layer ? "更新层级" : "新建层级", (d) =>
      layer
        ? updateLayer(d, layer.id, {
            name,
            parentId: parentId || null,
            order,
            description,
          })
        : createLayer(d, {
            name,
            parentId: parentId || null,
            order,
            description,
          }),
    );
    if (ok) {
      const created = useEditorStore
        .getState()
        .diagram?.layers.find((x) => !before.has(x.id));
      if (created) select({ kind: "layer", id: created.id });
      onDone?.();
    }
  };
  const cancel = () => {
    if (onDone) {
      onDone();
      return;
    }
    setName(layer?.name ?? "");
    setParentId(layer?.parentId ?? "");
    setOrder(layer?.order ?? 10);
    setDescription(layer?.description ?? "");
    setTarget("");
  };
  const remove = async () => {
    if (!layer || !await dialog.confirm({
      title: "删除层级",
      message: `删除“${layer.name}”及其 ${removedIds.size - 1} 个子层级？${affected.length ? ` ${affected.length} 个节点将被迁移。` : ""}`,
      confirmLabel: "删除",
      destructive: true,
    })) return;
    if (
      execute("删除层级", (d) =>
        deleteLayerWithMigration(d, layer.id, target || undefined),
      )
    )
      select({ kind: "diagram", id: diagram.id });
  };
  return (
    <form className="property-form" onSubmit={submit}>
      <Field label="层级名称" required>
        <input
          autoFocus
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="上级层级">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">顶层</option>
          {diagram.layers.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={invalidParents.has(item.id)}
            >
              {fullLayerPath(diagram, item.id)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="顺序">
        <input
          type="number"
          step={10}
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
        />
      </Field>
      <Field label="说明">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {parentId && diagram.nodes.some((x) => x.layerId === parentId) && (
        <p className="inline-warning">
          该上级已有节点；创建子层后，这些节点会在同一事务中迁入新子层。
        </p>
      )}
      <FormFooter onCancel={cancel} onConfirm={submit} />
      {layer && (
        <DangerZone>
          <p>
            删除将同时移除全部子层级。
            {affected.length
              ? `需迁移 ${affected.length} 个节点。`
              : "当前没有节点受影响。"}
          </p>
          {affected.length > 0 && (
            <Field label="迁移到叶子层级" required>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">请选择</option>
                {targets.map((x) => (
                  <option value={x.id} key={x.id}>
                    {fullLayerPath(diagram, x.id)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            type="button"
            className="danger-button"
            disabled={affected.length > 0 && !target}
            onClick={() => void remove()}
          >
            删除层级
          </button>
        </DangerZone>
      )}
    </form>
  );
}

function NodeForm({
  node,
  mode = "edit",
  onDone,
}: {
  node?: DiagramNode;
  mode?: EditorMode;
  onDone?: () => void;
}) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const execute = useEditorStore((s) => s.execute);
  const select = useEditorStore((s) => s.select);
  const dialog = useAppDialog();
  const leaves = leafLayers(diagram);
  const [name, setName] = useState(node?.name ?? "");
  const [layerId, setLayerId] = useState(node?.layerId ?? leaves[0]?.id ?? "");
  const [styleId, setStyleId] = useState(
    node?.styleId ?? diagram.nodeStyles.find((x) => x.isDefault)?.id ?? "",
  );
  const [items, setItems] = useState(node?.decompositionItems.join("\n") ?? "");
  const [description, setDescription] = useState(node?.description ?? "");
  const participations = node ? nodePathways(diagram, node.id) : [];
  if (mode === "view" && node)
    return (
      <div className="detail-stack">
        <Detail label="节点名称" value={node.name} />
        <Detail
          label="完整层级路径"
          value={fullLayerPath(diagram, node.layerId)}
        />
        <Detail
          label="节点样式"
          value={
            diagram.nodeStyles.find((x) => x.id === node.styleId)?.name ??
            "未知"
          }
        />
        <Detail
          label="拆解信息"
          value={
            node.decompositionItems.length
              ? node.decompositionItems.join("、")
              : "暂无"
          }
        />
        <Detail label="业务备注" value={node.description || "暂无"} />
        <Detail
          label="参与通路"
          value={
            participations.length
              ? participations.map((x) => x.name).join("、")
              : "未参与通路"
          }
        />
      </div>
    );
  if (!leaves.length)
    return (
      <div className="panel-empty">
        <strong>请先创建层级</strong>
        <span>节点只能属于叶子层级。</span>
        {onDone && <button onClick={onDone}>返回</button>}
      </div>
    );
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const before = new Set(diagram.nodes.map((x) => x.id));
    const input = {
      name,
      layerId,
      styleId,
      decompositionItems: items.split("\n"),
      description,
      order: node?.order,
    };
    const ok = execute(node ? "更新节点" : "新建节点", (d) =>
      node ? updateNode(d, node.id, input) : createNode(d, input),
    );
    if (ok) {
      const created = useEditorStore
        .getState()
        .diagram?.nodes.find((x) => !before.has(x.id));
      if (created) select({ kind: "node", id: created.id });
      onDone?.();
    }
  };
  const duplicate = () => {
    if (!node) return;
    const before = new Set(diagram.nodes.map((x) => x.id));
    if (execute("复制节点", (d) => duplicateNode(d, node.id))) {
      const created = useEditorStore
        .getState()
        .diagram?.nodes.find((x) => !before.has(x.id));
      if (created) select({ kind: "node", id: created.id });
    }
  };
  const cancel = () => {
    if (onDone) {
      onDone();
      return;
    }
    setName(node?.name ?? "");
    setLayerId(node?.layerId ?? leaves[0]?.id ?? "");
    setStyleId(
      node?.styleId ?? diagram.nodeStyles.find((x) => x.isDefault)?.id ?? "",
    );
    setItems(node?.decompositionItems.join("\n") ?? "");
    setDescription(node?.description ?? "");
  };
  const impact = node ? getDeleteNodeImpact(diagram, node.id) : [];
  const blocked = impact.some((x) => x.blocked);
  const remove = async () => {
    if (!node || blocked || !await dialog.confirm({
      title: "删除节点",
      message: `删除“${node.name}”？${impact.length ? ` 将从 ${impact.length} 条通路中移除并自动重连相邻步骤。` : ""}`,
      confirmLabel: "删除",
      destructive: true,
    })) return;
    if (execute("删除节点", (d) => deleteNode(d, node.id)))
      select({ kind: "diagram", id: diagram.id });
  };
  return (
    <form className="property-form" onSubmit={submit}>
      <Field label="节点名称" required>
        <input
          autoFocus
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="所属叶子层级" required>
        <select
          required
          value={layerId}
          onChange={(e) => setLayerId(e.target.value)}
        >
          {diagram.layers.map((x) => (
            <option
              key={x.id}
              value={x.id}
              disabled={!isLeafLayer(diagram, x.id)}
            >
              {fullLayerPath(diagram, x.id)}
              {!isLeafLayer(diagram, x.id) ? "（不可选）" : ""}
            </option>
          ))}
        </select>
        <small>节点只能放入叶子层级</small>
      </Field>
      <Field label="节点样式" required>
        <select
          required
          value={styleId}
          onChange={(e) => setStyleId(e.target.value)}
        >
          {diagram.nodeStyles.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.isDefault ? "（默认）" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="拆解信息">
        <textarea
          rows={5}
          value={items}
          onChange={(e) => setItems(e.target.value)}
          placeholder={"每行一项，例如：\n范围\n目标"}
        />
      </Field>
      <Field label="业务备注">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <FormFooter onCancel={cancel} onConfirm={submit} />
      {node && (
        <>
          <button type="button" className="wide-secondary" onClick={duplicate}>
            复制节点
          </button>
          <DangerZone>
            {impact.length > 0 && (
              <div className={blocked ? "impact blocked" : "impact"}>
                <strong>影响 {impact.length} 条通路</strong>
                {impact.map((x) => (
                  <span key={x.pathway.id}>
                    {x.pathway.name}：
                    {x.blocked
                      ? "删除后不足两个节点，已阻止"
                      : `将保留 ${x.afterNodes.map((n) => n.name).join(" → ")}`}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              className="danger-button"
              disabled={blocked}
              onClick={() => void remove()}
            >
              删除节点
            </button>
          </DangerZone>
        </>
      )}
    </form>
  );
}

const defaultStyle = {
  name: "",
  shape: "roundedRect" as const,
  fillColor: "#EEF3FF",
  borderColor: "#2F64F7",
  borderStyle: "solid" as const,
  borderWidth: 1 as const,
  borderRadius: 4,
  textColor: "#1F2329",
};
function StyleForm({
  style,
  mode = "edit",
  onDone,
}: {
  style?: NodeStyle;
  mode?: EditorMode;
  onDone?: () => void;
}) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const execute = useEditorStore((s) => s.execute);
  const select = useEditorStore((s) => s.select);
  const dialog = useAppDialog();
  const [form, setForm] = useState({ ...defaultStyle, ...style });
  const [replacement, setReplacement] = useState("");
  const refs = style ? styleReferenceCount(diagram, style.id) : 0;
  const readOnly = mode === "view" || Boolean(style?.isSystem);
  if (mode === "view" && style)
    return (
      <div className="detail-stack">
        <StylePreview form={form} />
        <Detail label="样式名称" value={style.name} />
        <Detail label="引用节点" value={`${refs} 个`} />
        <Detail label="形状" value={style.shape} />
        <Detail
          label="边框"
          value={`${style.borderWidth}px ${style.borderStyle}`}
        />
      </div>
    );
  const patch = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm({ ...form, [key]: value });
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (readOnly) return;
    const before = new Set(diagram.nodeStyles.map((x) => x.id));
    const input = {
      name: form.name,
      shape: form.shape,
      fillColor: form.fillColor,
      borderColor: form.borderColor,
      borderStyle: form.borderStyle,
      borderWidth: form.borderWidth,
      borderRadius: form.borderRadius,
      textColor: form.textColor,
    };
    const ok = execute(style ? "更新样式" : "新建样式", (d) =>
      style ? updateNodeStyle(d, style.id, input) : createNodeStyle(d, input),
    );
    if (ok) {
      const created = useEditorStore
        .getState()
        .diagram?.nodeStyles.find((x) => !before.has(x.id));
      if (created) select({ kind: "nodeStyle", id: created.id });
      onDone?.();
    }
  };
  const cancel = () => {
    if (onDone) {
      onDone();
      return;
    }
    setForm({ ...defaultStyle, ...style });
    setReplacement("");
  };
  const duplicate = () => {
    if (!style) return;
    const before = new Set(diagram.nodeStyles.map((x) => x.id));
    if (execute("复制样式", (d) => duplicateNodeStyle(d, style.id))) {
      const created = useEditorStore
        .getState()
        .diagram?.nodeStyles.find((x) => !before.has(x.id));
      if (created) select({ kind: "nodeStyle", id: created.id });
    }
  };
  const remove = async () => {
    if (!style || !await dialog.confirm({
      title: "删除样式",
      message: `删除样式“${style.name}”？${refs ? ` ${refs} 个节点将替换样式。` : ""}`,
      confirmLabel: "删除",
      destructive: true,
    })) return;
    if (
      execute("删除样式并替换引用", (d) =>
        deleteNodeStyleWithReplacement(d, style.id, replacement || undefined),
      )
    )
      select({ kind: "diagram", id: diagram.id });
  };
  return (
    <form className="property-form" onSubmit={submit}>
      <StylePreview form={form} />
      <Field label="样式名称" required>
        <input
          autoFocus
          required
          maxLength={40}
          value={form.name}
          disabled={readOnly}
          onChange={(e) => patch("name", e.target.value)}
        />
      </Field>
      <Field label="形状">
        <select
          value={form.shape}
          disabled={readOnly}
          onChange={(e) => patch("shape", e.target.value as NodeStyle["shape"])}
        >
          <option value="rect">直角矩形</option>
          <option value="roundedRect">圆角矩形</option>
          <option value="document">文档</option>
        </select>
      </Field>
      <div className="field-grid">
        <Field label="填充">
          <input
            type="color"
            value={form.fillColor}
            disabled={readOnly}
            onChange={(e) => patch("fillColor", e.target.value)}
          />
        </Field>
        <Field label="文字">
          <input
            type="color"
            value={form.textColor}
            disabled={readOnly}
            onChange={(e) => patch("textColor", e.target.value)}
          />
        </Field>
      </div>
      <Field label="边框颜色">
        <input
          type="color"
          value={form.borderColor}
          disabled={readOnly}
          onChange={(e) => patch("borderColor", e.target.value)}
        />
      </Field>
      <div className="field-grid">
        <Field label="边框线型">
          <select
            value={form.borderStyle}
            disabled={readOnly}
            onChange={(e) =>
              patch("borderStyle", e.target.value as NodeStyle["borderStyle"])
            }
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
          </select>
        </Field>
        <Field label="边框宽度">
          <select
            value={form.borderWidth}
            disabled={readOnly}
            onChange={(e) =>
              patch("borderWidth", Number(e.target.value) as 1 | 2 | 3)
            }
          >
            <option value="1">1px</option>
            <option value="2">2px</option>
            <option value="3">3px</option>
          </select>
        </Field>
      </div>
      {style?.isSystem && (
        <p className="inline-info">系统样式为只读；可以复制后再编辑。</p>
      )}
      {!readOnly && <FormFooter onCancel={cancel} onConfirm={submit} />}
      {style && (
        <>
          <button type="button" className="wide-secondary" onClick={duplicate}>
            复制为自定义样式
          </button>
          {!style.isDefault && (
            <button
              type="button"
              className="wide-secondary"
              onClick={() =>
                execute("设为默认样式", (d) => setDefaultStyle(d, style.id))
              }
            >
              设为默认样式
            </button>
          )}
          {!style.isSystem && !style.isDefault && (
            <DangerZone>
              <p>当前被 {refs} 个节点引用。</p>
              {refs > 0 && (
                <Field label="替代样式" required>
                  <select
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {diagram.nodeStyles
                      .filter((x) => x.id !== style.id)
                      .map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <button
                type="button"
                disabled={refs > 0 && !replacement}
                className="danger-button"
                onClick={() => void remove()}
              >
                删除样式
              </button>
            </DangerZone>
          )}
        </>
      )}
    </form>
  );
}

function PathwayForm({
  pathway,
  mode = "edit",
  onDone,
}: {
  pathway?: Pathway;
  mode?: EditorMode;
  onDone?: () => void;
}) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const execute = useEditorStore((s) => s.execute);
  const select = useEditorStore((s) => s.select);
  const dialog = useAppDialog();
  const [name, setName] = useState(pathway?.name ?? "");
  const [nodeIds, setNodeIds] = useState(
    pathway
      ? [...pathway.steps]
          .sort((a, b) => a.order - b.order)
          .map((x) => x.nodeId)
      : [],
  );
  const [color, setColor] = useState(pathway?.color ?? "#2F64F7");
  const [lineStyle, setLineStyle] = useState<Pathway["lineStyle"]>(
    pathway?.lineStyle ?? "solid",
  );
  const [description, setDescription] = useState(pathway?.description ?? "");
  const [visible, setVisible] = useState(pathway?.visible ?? true);
  const [addId, setAddId] = useState("");
  if (mode === "view" && pathway)
    return (
      <div className="detail-stack">
        <Detail label="通路名称" value={pathway.name} />
        <ol className="readonly-steps">
          {[...pathway.steps]
            .sort((a, b) => a.order - b.order)
            .map((step) => {
              const node = diagram.nodes.find((x) => x.id === step.nodeId);
              return (
                <li key={step.id}>
                  <strong>{node?.name}</strong>
                  <span>
                    {node ? fullLayerPath(diagram, node.layerId) : "未知节点"}
                  </span>
                </li>
              );
            })}
        </ol>
        <Detail
          label="线型"
          value={pathway.lineStyle === "solid" ? "实线" : "虚线"}
        />
        <Detail label="备注" value={pathway.description || "暂无"} />
      </div>
    );
  const move = (index: number, delta: number) => {
    const next = [...nodeIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setNodeIds(next);
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const before = new Set(diagram.pathways.map((x) => x.id));
    const input = {
      name,
      nodeIds,
      color,
      lineStyle,
      description,
      visible,
      order: pathway?.order,
    };
    const ok = execute(pathway ? "更新通路" : "新建通路", (d) =>
      pathway ? updatePathway(d, pathway.id, input) : createPathway(d, input),
    );
    if (ok) {
      const created = useEditorStore
        .getState()
        .diagram?.pathways.find((x) => !before.has(x.id));
      if (created) select({ kind: "pathway", id: created.id });
      onDone?.();
    }
  };
  const cancel = () => {
    if (onDone) {
      onDone();
      return;
    }
    setName(pathway?.name ?? "");
    setNodeIds(
      pathway
        ? [...pathway.steps]
            .sort((a, b) => a.order - b.order)
            .map((step) => step.nodeId)
        : [],
    );
    setColor(pathway?.color ?? "#2F64F7");
    setLineStyle(pathway?.lineStyle ?? "solid");
    setDescription(pathway?.description ?? "");
    setVisible(pathway?.visible ?? true);
    setAddId("");
  };
  const remove = async () => {
    if (!pathway || !await dialog.confirm({
      title: "删除通路",
      message: `删除通路“${pathway.name}”？节点不会被删除。`,
      confirmLabel: "删除",
      destructive: true,
    })) return;
    if (execute("删除通路", (d) => deletePathway(d, pathway.id)))
      select({ kind: "diagram", id: diagram.id });
  };
  return (
    <form className="property-form" onSubmit={submit}>
      <Field label="通路名称" required>
        <input
          autoFocus
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="有序节点列表" required>
        <StepList
          nodeIds={nodeIds}
          onMove={move}
          onRemove={(index) =>
            setNodeIds(nodeIds.filter((_, i) => i !== index))
          }
        />
      </Field>
      <div className="add-step">
        <select value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">选择要添加的节点</option>
          {diagram.nodes
            .filter((x) => !nodeIds.includes(x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {fullLayerPath(diagram, x.layerId)}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={!addId}
          onClick={() => {
            setNodeIds([...nodeIds, addId]);
            setAddId("");
          }}
        >
          添加
        </button>
      </div>
      {nodeIds.length < 2 && (
        <p className="field-error">至少添加两个不同节点</p>
      )}
      <div className="field-grid">
        <Field label="颜色">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </Field>
        <Field label="线型">
          <select
            value={lineStyle}
            onChange={(e) =>
              setLineStyle(e.target.value as Pathway["lineStyle"])
            }
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
          </select>
        </Field>
      </div>
      <Field label="备注">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
        />
        在画布中显示
      </label>
      <FormFooter onCancel={cancel} onConfirm={submit} disabled={nodeIds.length < 2} />
      {pathway && (
        <DangerZone>
          <p>删除通路不会删除其中的节点。</p>
          <button type="button" className="danger-button" onClick={() => void remove()}>
            删除通路
          </button>
        </DangerZone>
      )}
    </form>
  );
}

function DraftPathwayForm() {
  const diagram = useEditorStore((s) => s.diagram)!;
  const draft = useEditorStore((s) => s.pathwayDraft)!;
  const setDraft = useEditorStore((s) => s.setPathwayDraft);
  const setTool = useEditorStore((s) => s.setTool);
  const execute = useEditorStore((s) => s.execute);
  const select = useEditorStore((s) => s.select);
  const move = (index: number, delta: number) => {
    const ids = [...draft.nodeIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setDraft({ ...draft, nodeIds: ids });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const before = new Set(diagram.pathways.map((pathway) => pathway.id));
    if (execute("新建通路", (d) => createPathway(d, draft))) {
      const created = useEditorStore
        .getState()
        .diagram?.pathways.find((pathway) => !before.has(pathway.id));
      setTool("select");
      if (created) select({ kind: "pathway", id: created.id });
    }
  };
  return (
    <form className="property-form" onSubmit={submit}>
      <p className="inline-info">
        依次在画布点击节点。这里的顺序会实时决定候选箭头方向。
      </p>
      <Field label="通路名称" required>
        <input
          autoFocus
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>
      <Field label="已选节点" required>
        <StepList
          nodeIds={draft.nodeIds}
          onMove={move}
          onRemove={(index) =>
            setDraft({
              ...draft,
              nodeIds: draft.nodeIds.filter((_, i) => i !== index),
            })
          }
        />
      </Field>
      {draft.nodeIds.length < 2 && (
        <p className="field-error">
          请再选择 {2 - draft.nodeIds.length} 个节点
        </p>
      )}
      <div className="field-grid">
        <Field label="颜色">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </Field>
        <Field label="线型">
          <select
            value={draft.lineStyle}
            onChange={(e) =>
              setDraft({
                ...draft,
                lineStyle: e.target.value as Pathway["lineStyle"],
              })
            }
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
          </select>
        </Field>
      </div>
      <div className="form-footer draft-form-footer">
        <small>
          选满两个节点后，请在最后一个节点旁完成；也可在画布按 Enter。
        </small>
        <button type="button" onClick={() => setTool("select")}>
          取消
        </button>
      </div>
    </form>
  );
}

function StepList({
  nodeIds,
  onMove,
  onRemove,
}: {
  nodeIds: string[];
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
}) {
  const diagram = useEditorStore((s) => s.diagram)!;
  return (
    <ol className="step-list">
      {nodeIds.map((id, index) => {
        const node = diagram.nodes.find((x) => x.id === id);
        return (
          <li key={id}>
            <b>{index + 1}</b>
            <span>
              <strong>{node?.name ?? "未知节点"}</strong>
              <small>{node ? fullLayerPath(diagram, node.layerId) : ""}</small>
            </span>
            <span className="step-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                aria-label={`上移 ${node?.name}`}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === nodeIds.length - 1}
                onClick={() => onMove(index, 1)}
                aria-label={`下移 ${node?.name}`}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`移除 ${node?.name}`}
              >
                ×
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
function StylePreview({
  form,
}: {
  form: Pick<
    NodeStyle,
    | "name"
    | "fillColor"
    | "borderColor"
    | "borderStyle"
    | "borderWidth"
    | "borderRadius"
    | "textColor"
    | "shape"
  >;
}) {
  return (
    <div className="style-preview">
      <span
        style={{
          background: form.fillColor,
          color: form.textColor,
          borderColor: form.borderColor,
          borderStyle: form.borderStyle,
          borderWidth: form.borderWidth,
          borderRadius: form.shape === "rect" ? 0 : form.borderRadius,
        }}
      >
        {form.name || "样式预览"}
      </span>
    </div>
  );
}
function Overview({
  diagramName,
  counts,
}: {
  diagramName: string;
  counts: [string, number][];
}) {
  return (
    <div className="overview-block">
      <strong>{diagramName}</strong>
      <div>
        {counts.map(([label, count]) => (
          <span key={label}>
            <b>{count}</b>
            <small>{label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
function IssueList() {
  const diagram = useEditorStore((s) => s.diagram)!;
  const issues = useMemo(() => validateDiagram(diagram), [diagram]);
  return (
    <div className="issue-list">
      <strong>校验问题</strong>
      {issues.map((item, index) => (
        <span key={`${item.code}-${index}`}>{item.message}</span>
      ))}
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <small>{label}</small>
      <p>{value}</p>
    </div>
  );
}
function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  const generatedId = useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;
  const labelId = `${controlId}-label`;
  let linked = false;
  const linkedChildren = Children.map(children, (child) => {
    if (
      !linked &&
      isValidElement(child) &&
      typeof child.type === "string" &&
      ["input", "select", "textarea"].includes(child.type)
    ) {
      linked = true;
      return cloneElement(child as ReactElement<Record<string, unknown>>, {
        id: controlId,
        "aria-label": label,
        "aria-required": required || undefined,
      });
    }
    return child;
  });
  return (
    <div
      className="field"
      role={linked ? undefined : "group"}
      aria-labelledby={linked ? undefined : labelId}
    >
      <label id={labelId} htmlFor={linked ? controlId : undefined}>
        {label}
        {required && <b aria-hidden="true">*</b>}
      </label>
      {linkedChildren}
    </div>
  );
}
function FormFooter({
  onCancel,
  onConfirm,
  disabled,
}: {
  onCancel?: () => void;
  onConfirm?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="form-footer">
      {onCancel && (
        <button type="button" onClick={onCancel}>
          取消
        </button>
      )}
      <button
        type={onConfirm ? "button" : "submit"}
        className="primary-button"
        disabled={disabled}
        onClick={onConfirm}
      >
        确定
      </button>
    </div>
  );
}
function DangerZone({ children }: { children: React.ReactNode }) {
  return (
    <section className="danger-zone">
      <h3>危险操作</h3>
      {children}
    </section>
  );
}
