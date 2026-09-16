import { useMemo, useState } from "react";
import { isValidStyleOptionValue, styleDimensionProperties } from "../../../domain/style-dimensions";
import type { StyleDimensionProperty } from "../../../domain/types";
import { createStyleDimensionsBatch } from "../../../editor/commands";
import { groupStyleDimensionRows, parseStyleDimensionRows, type StyleDimensionPasteRow } from "../../../editor/style-dimension-input";
import { useEditorStore } from "../../../editor/store";

export function StyleDimensionBatchDialog({ onClose }: { onClose: () => void }) {
  const diagram = useEditorStore((state) => state.diagram)!;
  const execute = useEditorStore((state) => state.execute);
  const select = useEditorStore((state) => state.select);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<StyleDimensionPasteRow[]>([]);
  const parsed = useMemo(() => groupStyleDimensionRows(rows), [rows]);
  const conflicts = new Set(diagram.styleDimensions.map((item) => item.property));
  const errors = rows.flatMap((row, index) => {
    const result: string[] = [];
    if (!row.dimension || !row.property || !row.option || !row.value) result.push(`第 ${index + 1} 行信息不完整`);
    else if (conflicts.has(row.property)) result.push(`“${row.dimension}”控制的属性已存在`);
    else if (!isValidStyleOptionValue(row.property, row.value)) result.push(`第 ${index + 1} 行视觉值无效`);
    return result;
  });
  const dimensionProperties = new Map<string, string>();
  rows.forEach((row) => {
    const previous = dimensionProperties.get(row.dimension);
    if (previous && previous !== row.property) errors.push(`维度“${row.dimension}”不能控制多个属性`);
    else if (row.dimension && row.property) dimensionProperties.set(row.dimension, row.property);
  });
  const submit = () => {
    if (!parsed.length || errors.length) return;
    const before = new Set(diagram.styleDimensions.map((item) => item.id));
    if (!execute(`批量创建 ${parsed.length} 个样式维度`, (current) => createStyleDimensionsBatch(current, parsed))) return;
    const created = useEditorStore.getState().diagram?.styleDimensions.find((item) => !before.has(item.id));
    if (created) select({ kind: "styleDimension", id: created.id });
    onClose();
  };
  const importRows = () => setRows(parseStyleDimensionRows(raw));
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card dimension-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="dimension-batch-title">
        <header>
          <div><span className="eyebrow">批量创建</span><h2 id="dimension-batch-title">样式维度与选项</h2></div>
          <button className="panel-close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <p>从 Excel 或飞书复制四列：维度名称、控制属性、选项名称、视觉值。同名维度会自动合并。</p>
        <div className="dimension-paste-grid">
          <textarea
            aria-label="粘贴四列表格"
            rows={5}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={"应对形式\t形状\t自研\t方框\n应对形式\t形状\t外采\t腰圆\nV0.9开发\t底色\t是\t粉色"}
          />
          <button type="button" onClick={importRows}>解析粘贴内容</button>
        </div>
        <div className="dimension-batch-table" role="table" aria-label="待创建的样式选项">
          <div className="dimension-batch-row heading" role="row"><b>维度名称</b><b>控制属性</b><b>选项名称</b><b>视觉值</b><span /></div>
          {rows.map((row, index) => (
            <div className="dimension-batch-row" role="row" key={index}>
              <input aria-label={`第 ${index + 1} 行维度名称`} value={row.dimension} onChange={(event) => patchRow(index, "dimension", event.target.value)} />
              <select aria-label={`第 ${index + 1} 行控制属性`} value={row.property} onChange={(event) => patchRow(index, "property", event.target.value as StyleDimensionProperty)}>
                <option value="">请选择</option>{styleDimensionProperties.map((property) => <option value={property.value} key={property.value}>{property.label}</option>)}
              </select>
              <input aria-label={`第 ${index + 1} 行选项名称`} value={row.option} onChange={(event) => patchRow(index, "option", event.target.value)} />
              <input aria-label={`第 ${index + 1} 行视觉值`} value={row.value} onChange={(event) => patchRow(index, "value", event.target.value)} />
              <button type="button" aria-label={`删除第 ${index + 1} 行`} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
            </div>
          ))}
          {!rows.length && <div className="panel-empty"><strong>尚未解析数据</strong><span>粘贴四列内容后点击“解析粘贴内容”</span></div>}
        </div>
        {errors.length > 0 && <p className="field-error">{[...new Set(errors)].join("；")}</p>}
        {parsed.length > 0 && !errors.length && <p className="inline-info">将创建 {parsed.length} 个维度、{parsed.reduce((total, item) => total + item.options.length, 0)} 个选项。</p>}
        <footer><button onClick={onClose}>取消</button><button className="primary-button" disabled={!parsed.length || Boolean(errors.length)} onClick={submit}>创建</button></footer>
      </section>
    </div>
  );

  function patchRow<K extends keyof StyleDimensionPasteRow>(index: number, key: K, value: StyleDimensionPasteRow[K]) {
    setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }
}
