import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MetricsModal } from "#/components/features/conversation/metrics-modal/metrics-modal";
import type {
  MetricsSnapshot,
  TokenUsage,
} from "#/api/conversation-service/agent-server-conversation-service.types";
import useMetricsStore, { type MetricsState } from "#/stores/metrics-store";
import { renderWithProviders } from "../../../../test-utils";

const mocks = vi.hoisted(() => ({
  conversation: {
    id: "conversation-123",
    conversation_url: "https://agent.example/conversations/conversation-123",
    session_api_key: "session-key",
  } as
    | {
        id: string;
        conversation_url: string | null;
        session_api_key: string | null;
      }
    | undefined,
  conversationMetrics: undefined as MetricsSnapshot | undefined,
  useConversationMetrics: vi.fn(),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({ data: mocks.conversation }),
}));

vi.mock("#/hooks/query/use-conversation-metrics", () => ({
  useConversationMetrics: (
    conversationId: string | null | undefined,
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    enabled: boolean,
  ) => {
    mocks.useConversationMetrics(
      conversationId,
      conversationUrl,
      sessionApiKey,
      enabled,
    );
    return {
      data: mocks.conversationMetrics,
      isLoading: false,
      error: null,
    };
  },
}));

function getTokenUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    prompt_tokens: 1_234,
    completion_tokens: 567,
    cache_read_tokens: 345,
    cache_write_tokens: 89,
    context_window: 128_000,
    per_turn_token: 1_801,
    ...overrides,
  };
}

function getStoreMetrics(overrides: Partial<MetricsState> = {}): MetricsState {
  return {
    cost: null,
    max_budget_per_task: null,
    usage: null,
    ...overrides,
  };
}

function getConversationMetrics(
  overrides: Partial<MetricsSnapshot> = {},
): MetricsSnapshot {
  return {
    accumulated_cost: 2.3456,
    max_budget_per_task: 10,
    accumulated_token_usage: getTokenUsage(),
    ...overrides,
  };
}

type RenderModalOptions = {
  isOpen?: boolean;
  conversation?: typeof mocks.conversation | null;
  conversationMetrics?: MetricsSnapshot;
  storeMetrics?: MetricsState;
};

function renderModal(options: RenderModalOptions = {}) {
  mocks.useConversationMetrics.mockClear();
  mocks.conversation =
    options.conversation === null
      ? undefined
      : (options.conversation ?? {
          id: "conversation-123",
          conversation_url:
            "https://agent.example/conversations/conversation-123",
          session_api_key: "session-key",
        });
  mocks.conversationMetrics = options.conversationMetrics;
  useMetricsStore.setState(options.storeMetrics ?? getStoreMetrics());

  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <MetricsModal
      isOpen={options.isOpen ?? true}
      onOpenChange={onOpenChange}
    />,
  );

  return { ...rendered, onOpenChange };
}

describe("conversation metrics modal", () => {
  it("stays hidden and disables remote metrics without a conversation", () => {
    renderModal({ isOpen: false, conversation: null });

    expect(screen.queryByTestId("metrics-modal")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.useConversationMetrics).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      false,
    );
  });

  it("shows an empty state and closes from either modal control", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("metrics-modal")).toBeInTheDocument();
    expect(screen.getByText("CONVERSATION$METRICS_INFO")).toBeInTheDocument();
    expect(screen.getByText("CONVERSATION$NO_METRICS")).toBeInTheDocument();
    expect(mocks.useConversationMetrics).toHaveBeenCalledWith(
      "conversation-123",
      "https://agent.example/conversations/conversation-123",
      "session-key",
      true,
    );

    await user.click(screen.getByTestId("close-metrics-modal"));
    fireEvent.click(screen.getByRole("dialog").firstElementChild!);

    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
  });

  it("renders stored cost metrics without a usage section", () => {
    renderModal({
      storeMetrics: getStoreMetrics({
        cost: 1.25,
        usage: null,
      }),
    });

    expect(screen.getByText("CONVERSATION$TOTAL_COST")).toBeInTheDocument();
    expect(screen.getByText("$1.2500")).toBeInTheDocument();
    expect(
      screen.getByText("CONVERSATION$NO_BUDGET_LIMIT"),
    ).toBeInTheDocument();
    expect(screen.queryByText("CONVERSATION$INPUT")).not.toBeInTheDocument();
    expect(
      screen.queryByText("CONVERSATION$NO_METRICS"),
    ).not.toBeInTheDocument();
  });

  it("renders stored token usage when cost is unavailable", () => {
    renderModal({
      storeMetrics: getStoreMetrics({
        cost: null,
        max_budget_per_task: 20,
        usage: getTokenUsage(),
      }),
    });

    expect(
      screen.queryByText("CONVERSATION$TOTAL_COST"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("CONVERSATION$INPUT")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("CONVERSATION$OUTPUT")).toBeInTheDocument();
    expect(screen.getByText("567")).toBeInTheDocument();
    expect(screen.getByText("1,801")).toBeInTheDocument();
    expect(screen.getByText(/1,801 \/ 128,000 \(1\.41%/)).toBeInTheDocument();
    expect(
      screen.queryByText("CONVERSATION$NO_METRICS"),
    ).not.toBeInTheDocument();
  });

  it("prefers complete remote metrics over stored values", () => {
    renderModal({
      storeMetrics: getStoreMetrics({
        cost: 99,
        max_budget_per_task: 100,
        usage: getTokenUsage({ prompt_tokens: 99_999 }),
      }),
      conversationMetrics: getConversationMetrics(),
    });

    expect(screen.getByText("$2.3456")).toBeInTheDocument();
    expect(screen.queryByText("$99.0000")).not.toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.queryByText("99,999")).not.toBeInTheDocument();
  });

  it("normalizes missing remote token fields to zero", () => {
    const missingTokenFields = {
      prompt_tokens: undefined,
      completion_tokens: undefined,
      cache_read_tokens: undefined,
      cache_write_tokens: undefined,
      context_window: undefined,
      per_turn_token: undefined,
    } as unknown as TokenUsage;

    renderModal({
      conversationMetrics: getConversationMetrics({
        accumulated_cost: null,
        max_budget_per_task: null,
        accumulated_token_usage: missingTokenFields,
      }),
    });

    expect(screen.getAllByText("0")).toHaveLength(5);
    expect(screen.getByText(/0 \/ 0 \(0\.00%/)).toBeInTheDocument();
    expect(
      screen.queryByText("CONVERSATION$NO_METRICS"),
    ).not.toBeInTheDocument();
  });

  it("renders remote cost when token usage is absent", () => {
    renderModal({
      conversationMetrics: getConversationMetrics({
        accumulated_cost: 3,
        max_budget_per_task: null,
        accumulated_token_usage: null,
      }),
    });

    expect(screen.getByText("$3.0000")).toBeInTheDocument();
    expect(screen.queryByText("CONVERSATION$INPUT")).not.toBeInTheDocument();
    expect(
      screen.queryByText("CONVERSATION$NO_METRICS"),
    ).not.toBeInTheDocument();
  });
});
