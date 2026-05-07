import { describe, it, expect } from "vitest";
import {
  groupEvents,
  isGroupableEvent,
  EVENT_GROUP_MIN_SIZE,
} from "#/components/v1/chat/group-events";
import {
  ActionEvent,
  MessageEvent,
  ObservationEvent,
  SecurityRisk,
} from "#/types/v1/core";
import {
  ExecuteBashAction,
  FinishAction,
  ThinkAction,
} from "#/types/v1/core/base/action";
import {
  ExecuteBashObservation,
  PlanningFileEditorObservation,
} from "#/types/v1/core/base/observation";

const makeBashAction = (id: string): ActionEvent<ExecuteBashAction> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: `echo ${id}`,
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: `call_${id}`,
  tool_call: {
    id: `call_${id}`,
    type: "function",
    function: {
      name: "execute_bash",
      arguments: JSON.stringify({ command: `echo ${id}` }),
    },
  },
  llm_response_id: `response_${id}`,
  security_risk: SecurityRisk.UNKNOWN,
});

const makeBashObservation = (
  id: string,
  actionId: string,
): ObservationEvent<ExecuteBashObservation> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "execute_bash",
  tool_call_id: `call_${actionId}`,
  action_id: actionId,
  observation: {
    kind: "ExecuteBashObservation",
    content: [{ type: "text", text: "ok" }],
    command: `echo ${actionId}`,
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: {} as never,
  },
});

const makeUserMessage = (id: string): MessageEvent => ({
  id,
  timestamp: new Date().toISOString(),
  source: "user",
  llm_message: {
    role: "user",
    content: [{ type: "text", text: "hi" }],
  },
  activated_microagents: [],
  extended_content: [],
});

const makeFinishAction = (id: string): ActionEvent<FinishAction> => ({
  ...makeBashAction(id),
  action: { kind: "FinishAction", message: "all done" },
});

const makeThinkAction = (id: string): ActionEvent<ThinkAction> => ({
  ...makeBashAction(id),
  action: { kind: "ThinkAction", thought: "thinking" },
});

const makePlanObs = (
  id: string,
  actionId: string,
): ObservationEvent<PlanningFileEditorObservation> => ({
  ...makeBashObservation(id, actionId),
  observation: {
    kind: "PlanningFileEditorObservation",
    content: [{ type: "text", text: "plan" }],
  } as PlanningFileEditorObservation,
});

describe("isGroupableEvent", () => {
  it("groups regular action events", () => {
    expect(isGroupableEvent(makeBashAction("a1"))).toBe(true);
  });

  it("groups regular observation events", () => {
    expect(isGroupableEvent(makeBashObservation("o1", "a1"))).toBe(true);
  });

  it("does not group user messages", () => {
    expect(isGroupableEvent(makeUserMessage("m1"))).toBe(false);
  });

  it("does not group FinishAction", () => {
    expect(isGroupableEvent(makeFinishAction("a1"))).toBe(false);
  });

  it("does not group ThinkAction", () => {
    expect(isGroupableEvent(makeThinkAction("a1"))).toBe(false);
  });

  it("does not group PlanningFileEditorObservation", () => {
    expect(isGroupableEvent(makePlanObs("o1", "a1"))).toBe(false);
  });
});

describe("groupEvents", () => {
  it("returns an empty list for no events", () => {
    expect(groupEvents([])).toEqual([]);
  });

  it("emits singles when there are not enough actions in a row", () => {
    const events = [
      makeUserMessage("m1"),
      makeBashObservation("o1", "a1"),
      makeBashObservation("o2", "a2"),
      makeUserMessage("m2"),
    ];

    // 2 < EVENT_GROUP_MIN_SIZE (3), so the pair stays as singles.
    const result = groupEvents(events);
    expect(result.every((item) => item.kind === "single")).toBe(true);
    expect(result).toHaveLength(4);
  });

  it("groups runs of >= EVENT_GROUP_MIN_SIZE events", () => {
    const events = [
      makeUserMessage("m1"),
      makeBashObservation("o1", "a1"),
      makeBashObservation("o2", "a2"),
      makeBashObservation("o3", "a3"),
      makeBashObservation("o4", "a4"),
      makeUserMessage("m2"),
    ];

    const result = groupEvents(events);
    // user, group(4), user
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ kind: "single", index: 0 });
    expect(result[1]).toMatchObject({ kind: "group", startIndex: 1 });
    if (result[1].kind === "group") {
      expect(result[1].events).toHaveLength(4);
    }
    expect(result[2]).toMatchObject({ kind: "single", index: 5 });
  });

  it("includes a still-pending action in the group", () => {
    // Last action hasn't been replaced by an observation yet -> the group
    // should still include it so the header can show a running indicator.
    const events = [
      makeBashObservation("o1", "a1"),
      makeBashObservation("o2", "a2"),
      makeBashAction("a3"),
    ];

    const result = groupEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("group");
    if (result[0].kind === "group") {
      expect(result[0].events).toHaveLength(3);
    }
  });

  it("breaks the group when a non-groupable event interrupts", () => {
    const events = [
      makeBashObservation("o1", "a1"),
      makeBashObservation("o2", "a2"),
      makeBashObservation("o3", "a3"),
      makeUserMessage("m1"),
      makeBashObservation("o4", "a4"),
      makeBashObservation("o5", "a5"),
      makeBashObservation("o6", "a6"),
    ];

    const result = groupEvents(events);
    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe("group");
    expect(result[1].kind).toBe("single");
    expect(result[2].kind).toBe("group");
  });

  it("respects a custom minSize", () => {
    const events = [
      makeBashObservation("o1", "a1"),
      makeBashObservation("o2", "a2"),
    ];

    const grouped = groupEvents(events, 2);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe("group");
  });
});
