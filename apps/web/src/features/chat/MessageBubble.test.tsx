import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders Markdown and inline or block LaTeX", () => {
    const { container } = render(
      <MessageBubble
        message={{
          id: "assistant-1",
          role: "assistant",
          status: "complete",
          content: "**重点**：行内公式 $y_h = r^2$。\n\n$$\nx^2 + y^2 = 1\n$$",
        }}
      />,
    );

    expect(screen.getByText("重点")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("edits a user message and requests regeneration", async () => {
    const onEdit = vi.fn();
    render(
      <MessageBubble
        editable
        onEdit={onEdit}
        message={{
          id: "user-1",
          role: "user",
          status: "complete",
          content: "原问题",
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const editor = screen.getByRole("textbox");
    await userEvent.clear(editor);
    await userEvent.type(editor, "修改后的问题");
    await userEvent.click(
      screen.getByRole("button", { name: "保存并重新生成" }),
    );
    expect(onEdit).toHaveBeenCalledWith("user-1", "修改后的问题");
  });
});
