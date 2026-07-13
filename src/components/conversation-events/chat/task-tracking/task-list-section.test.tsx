import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import type { TaskItem as TaskItemType } from "#/types/agent-server/core/base/common";
import { TaskListSection } from "./task-list-section";

const createTask = (overrides: Partial<TaskItemType> = {}): TaskItemType => ({
  title: "Inspect the behavior",
  notes: "",
  status: "todo",
  ...overrides,
});

describe("task tracking list", () => {
  it("shows every planned task in its supplied order", () => {
    const taskList = [
      createTask({ title: "Inspect the behavior" }),
      createTask({ title: "Add focused coverage", status: "in_progress" }),
      createTask({ title: "Verify the result", status: "done" }),
    ];

    const { container } = render(<TaskListSection taskList={taskList} />);

    expect(screen.getByText(I18nKey.COMMON$TASKS)).toBeInTheDocument();
    const renderedTasks = container.querySelectorAll('[data-name="item"]');
    expect(renderedTasks).toHaveLength(3);
    expect(Array.from(renderedTasks, (task) => task.textContent)).toEqual([
      "Inspect the behavior",
      "Add focused coverage",
      "Verify the result",
    ]);
  });

  it("keeps the task section visible when the plan is empty", () => {
    const { container } = render(<TaskListSection taskList={[]} />);

    expect(screen.getByText(I18nKey.COMMON$TASKS)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-name="item"]')).toHaveLength(0);
  });
});
