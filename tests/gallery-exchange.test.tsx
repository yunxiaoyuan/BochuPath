import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/app/App";
import { createDemoDiagram } from "../src/domain/seed";
import { serializeDiagram } from "../src/persistence/exchange";

describe("gallery JSON exchange", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves a diagram without a preview and imports the file as a new diagram", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/diagrams"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "通路图库" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑 需求到交付示例" }));
    await waitFor(() => expect(screen.getByLabelText("通路图画布")).toBeInTheDocument());

    let savedJson = "";
    let closed = false;
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options: { suggestedName: string }) => {
        expect(options.suggestedName).toBe("需求到交付示例.json");
        return {
          createWritable: async () => ({
            write: async (data: string) => { savedJson = data; },
            close: async () => { closed = true; },
          }),
        };
      },
    });
    await user.click(screen.getByRole("button", { name: "导出" }));
    await waitFor(() => expect(screen.getByText("文件已保存")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "导出通路图" })).not.toBeInTheDocument();
    expect(savedJson).toContain('"schemaVersion": "1.1"');
    expect(closed).toBe(true);
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;

    await user.click(screen.getByRole("button", { name: "返回通路图库" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "通路图库" })).toBeInTheDocument());
    const input = screen.getByLabelText("选择要导入的 JSON 文件");
    const file = new File([serializeDiagram(createDemoDiagram())], "需求到交付示例.json", { type: "application/json" });
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByLabelText("通路图画布")).toBeInTheDocument());
    expect(screen.getAllByText("需求到交付示例").length).toBeGreaterThan(0);
  });
});
