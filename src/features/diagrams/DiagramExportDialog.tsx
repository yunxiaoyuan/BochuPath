import { useState } from "react";
import { isPageDropRuntime } from "../../app/runtime";
import type { Diagram } from "../../domain/types";
import { safeDiagramFileName, serializeDiagram } from "../../persistence/exchange";

interface Props {
  diagram: Diagram;
  onClose: () => void;
}

export function DiagramExportDialog({ diagram, onClose }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const json = serializeDiagram(diagram);
  const pageDrop = isPageDropRuntime();

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeDiagramFileName(diagram.name)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card exchange-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="export-dialog-title">导出通路图</h2>
        <p>
          已准备“{diagram.name}”的完整 JSON 数据。导入时会作为一张新图加入图库，不会覆盖原图。
        </p>
        <label className="field export-json-field">
          <span>JSON 数据</span>
          <textarea aria-label="JSON 数据" readOnly value={json} rows={12} onFocus={(event) => event.currentTarget.select()} />
        </label>
        {copyState === "failed" && <p className="field-error">复制失败，请直接选中文本后复制。</p>}
        {copyState === "copied" && <p className="inline-success" role="status">JSON 已复制到剪贴板。</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>关闭</button>
          <button type="button" onClick={() => void copy()}>复制 JSON</button>
          {!pageDrop && <button type="button" className="primary-button" onClick={download}>下载 .json</button>}
        </div>
      </section>
    </div>
  );
}
