import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoDiagram } from "../src/domain/seed";
import { createHistory } from "../src/editor/history";
import { useEditorStore } from "../src/editor/store";
import { Inspector } from "../src/features/workspace/components/Inspector";
import { ObjectPanel } from "../src/features/workspace/components/ObjectPanel";

describe("workspace command transactions and unified selection", () => {
  beforeEach(() => {
    const diagram = createDemoDiagram();
    useEditorStore.setState({
      diagram,
      savedDiagram: structuredClone(diagram),
      baseRevision: diagram.revision,
      mode: "edit",
      tool: "select",
      selection: { kind: "node", id: "node_demand" },
      multiSelectedNodeIds: ["node_demand"],
      focusedPathwayId: null,
      pathwayDraft: null,
      saveState: "clean",
      history: createHistory(),
      message: "",
      loading: false,
      recoverableDraft: null,
    });
  });

  it("cancels local form edits and commits one undoable command on confirm", async () => {
    const user = userEvent.setup();
    render(
      <Inspector
        mode="edit"
        createKind={null}
        onCreateHandled={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("节点名称");
    await user.clear(input);
    await user.type(input, "临时名称");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByLabelText("节点名称")).toHaveValue("需求确认");
    expect(useEditorStore.getState().diagram?.nodes[0]?.name).toBe("需求确认");
    expect(useEditorStore.getState().saveState).toBe("clean");
    expect(useEditorStore.getState().history.past).toHaveLength(0);

    await user.clear(screen.getByLabelText("节点名称"));
    await user.type(screen.getByLabelText("节点名称"), "需求澄清");
    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(useEditorStore.getState().diagram?.nodes[0]?.name).toBe("需求澄清");
    expect(useEditorStore.getState().saveState).toBe("dirty");
    expect(useEditorStore.getState().history.past).toHaveLength(1);

    act(() => useEditorStore.getState().undo());
    await waitFor(() =>
      expect(screen.getByLabelText("节点名称")).toHaveValue("需求确认"),
    );
    expect(useEditorStore.getState().saveState).toBe("clean");
    act(() => useEditorStore.getState().redo());
    await waitFor(() =>
      expect(screen.getByLabelText("节点名称")).toHaveValue("需求澄清"),
    );
  });

  it("selects layer and node tree rows with pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<ObjectPanel mode="edit" onCreate={vi.fn()} onClose={vi.fn()} />);

    const layer = screen.getByRole("treeitem", { name: /需求层/ });
    layer.focus();
    await user.keyboard(" ");
    expect(useEditorStore.getState().selection).toEqual({
      kind: "layer",
      id: "layer_demand",
    });
    expect(layer).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("treeitem", { name: "需求确认" }));
    expect(useEditorStore.getState().selection).toEqual({
      kind: "node",
      id: "node_demand",
    });
    expect(screen.getByRole("treeitem", { name: "需求确认" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
