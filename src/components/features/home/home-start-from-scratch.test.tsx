import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import { NewConversation } from "./new-conversation";

const hookMocks = vi.hoisted(() => ({
  useNavigation: vi.fn(),
  useCreateConversation: vi.fn(),
  useIsCreatingConversation: vi.fn(),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: (namespace?: string) => ({
    t: (key: string) =>
      namespace === "openhands" ? key : `missing-namespace:${key}`,
  }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: hookMocks.useNavigation,
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: hookMocks.useCreateConversation,
}));

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: hookMocks.useIsCreatingConversation,
}));

interface LaunchState {
  isPending?: boolean;
  isSuccess?: boolean;
  isCreatingElsewhere?: boolean;
}

function renderStartFromScratch({
  isPending = false,
  isSuccess = false,
  isCreatingElsewhere = false,
}: LaunchState = {}) {
  const navigate = vi.fn<(to: string) => void>();
  const createConversation = vi.fn<
    (
      variables: { entryPoint: string },
      options: {
        onSuccess: (data: { conversation_id: string }) => void;
      },
    ) => void
  >();

  hookMocks.useNavigation.mockReturnValue({
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate,
  });
  hookMocks.useCreateConversation.mockReturnValue({
    mutate: createConversation,
    isPending,
    isSuccess,
  });
  hookMocks.useIsCreatingConversation.mockReturnValue(isCreatingElsewhere);

  return {
    ...render(<NewConversation />),
    createConversation,
    navigate,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("home start-from-scratch conversation", () => {
  it("launches a new conversation and opens it after creation", () => {
    const { createConversation, navigate } = renderStartFromScratch();

    expect(
      screen.getByText(I18nKey.COMMON$START_FROM_SCRATCH),
    ).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.HOME$NEW_PROJECT_DESCRIPTION),
    ).toBeInTheDocument();

    const launchButton = screen.getByTestId("launch-new-conversation-button");
    expect(launchButton).toBeEnabled();
    expect(launchButton).toHaveTextContent(I18nKey.COMMON$NEW_CONVERSATION);

    fireEvent.click(launchButton);

    expect(createConversation).toHaveBeenCalledOnce();
    expect(createConversation).toHaveBeenCalledWith(
      { entryPoint: "home_start_from_scratch" },
      { onSuccess: expect.any(Function) },
    );
    expect(navigate).not.toHaveBeenCalled();

    const [, { onSuccess }] = createConversation.mock.calls[0];
    onSuccess({ conversation_id: "conversation-123" });

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/conversations/conversation-123");
  });

  it.each([
    {
      reason: "the creation request is pending",
      state: { isPending: true },
    },
    {
      reason: "creation succeeded while the conversation screen loads",
      state: { isSuccess: true },
    },
    {
      reason: "another conversation launch is in progress",
      state: { isCreatingElsewhere: true },
    },
  ])("prevents another launch when $reason", ({ state }) => {
    const { createConversation } = renderStartFromScratch(state);
    const launchButton = screen.getByTestId("launch-new-conversation-button");

    expect(launchButton).toBeDisabled();
    expect(launchButton).toHaveTextContent(I18nKey.HOME$LOADING);
    expect(launchButton).not.toHaveTextContent(I18nKey.COMMON$NEW_CONVERSATION);

    fireEvent.click(launchButton);

    expect(createConversation).not.toHaveBeenCalled();
  });
});
