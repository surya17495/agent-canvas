import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomSecretWithoutValue } from "#/api/secrets-service.types";
import { SecretForm } from "#/components/features/settings/secrets-settings/secret-form";
import { I18nKey } from "#/i18n/declaration";

const mocks = vi.hoisted(() => ({
  secrets: undefined as CustomSecretWithoutValue[] | undefined,
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string) =>
      namespace === "openhands" ? key : `wrong-namespace:${key}`,
  }),
}));

vi.mock("#/hooks/query/use-get-secrets", () => ({
  useSearchSecrets: () => ({ data: mocks.secrets }),
}));

vi.mock("#/hooks/mutation/use-create-secret", () => ({
  useCreateSecret: () => ({ mutate: mocks.create }),
}));

vi.mock("#/hooks/mutation/use-update-secret", () => ({
  useUpdateSecret: () => ({ mutate: mocks.update }),
}));

interface RenderFormOptions {
  mode?: "add" | "edit";
  selectedSecret?: string | null;
  onCancel?: () => void;
}

function renderForm({
  mode = "add",
  selectedSecret = null,
  onCancel = vi.fn(),
}: RenderFormOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SecretForm
        mode={mode}
        selectedSecret={selectedSecret}
        onCancel={onCancel}
      />
    </QueryClientProvider>,
  );
  return { ...view, invalidate, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.secrets = undefined;
});

describe("Secret form behavior", () => {
  it("renders the add form constraints and cancels without saving", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    expect(screen.getByTestId("add-secret-form")).toBeInTheDocument();
    expect(screen.getByTestId("name-input")).toHaveAttribute(
      "pattern",
      "^[a-zA-Z][a-zA-Z0-9_]{0,63}$",
    );
    expect(screen.getByTestId("name-input")).toBeRequired();
    expect(screen.getByTestId("value-input")).toBeRequired();
    expect(screen.getByTestId("value-input")).toHaveClass(
      "resize-none",
      "placeholder:italic",
      "disabled:bg-[var(--oh-surface-raised)]",
      "disabled:border-[var(--oh-border-subtle)]",
      "disabled:cursor-not-allowed",
    );
    expect(screen.getByTestId("description-input")).toHaveValue("");
    expect(screen.getByTestId("description-input")).toHaveClass(
      "disabled:bg-[var(--oh-surface-raised)]",
      "disabled:border-[var(--oh-border-subtle)]",
    );
    expect(screen.getByTestId("submit-button")).toHaveTextContent(
      I18nKey.SECRETS$ADD_SECRET,
    );
    expect(screen.getByTestId("submit-button")).not.toHaveTextContent(
      I18nKey.SECRETS$EDIT_SECRET,
    );

    await user.type(screen.getByTestId("name-input"), "CANCELLED_SECRET");
    await user.type(screen.getByTestId("value-input"), "unused-value");

    await user.click(screen.getByTestId("cancel-button"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("renders an edit form with the selected secret and trimmed description", () => {
    mocks.secrets = [
      { name: "EDIT_ME", description: "  production credential  " },
    ];
    renderForm({ mode: "edit", selectedSecret: "EDIT_ME" });

    expect(screen.getByTestId("edit-secret-form")).toBeInTheDocument();
    expect(screen.getByTestId("name-input")).toHaveValue("EDIT_ME");
    expect(screen.queryByTestId("value-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("description-input")).toHaveValue(
      "production credential",
    );
    expect(screen.getByTestId("submit-button")).toHaveTextContent(
      I18nKey.SECRETS$EDIT_SECRET,
    );
    expect(screen.getByTestId("submit-button")).not.toHaveTextContent(
      I18nKey.SECRETS$ADD_SECRET,
    );
  });

  it("ignores a selected secret while rendering the add form", () => {
    mocks.secrets = [
      { name: "EDIT_ME", description: "must not prefill the add form" },
    ];

    renderForm({ mode: "add", selectedSecret: "EDIT_ME" });

    expect(screen.getByTestId("name-input")).toHaveValue("");
    expect(screen.getByTestId("description-input")).toHaveValue("");
  });

  it("leaves the edit description blank when metadata is absent or unmatched", () => {
    const first = renderForm({ mode: "edit", selectedSecret: "MISSING" });
    expect(screen.getByTestId("description-input")).toHaveValue("");
    first.unmount();

    mocks.secrets = [{ name: "MISSING" }];
    const second = renderForm({ mode: "edit", selectedSecret: "MISSING" });
    expect(screen.getByTestId("description-input")).toHaveValue("");
    second.unmount();

    mocks.secrets = [{ name: "OTHER", description: "other description" }];
    const third = renderForm({ mode: "edit", selectedSecret: "MISSING" });
    expect(screen.getByTestId("description-input")).toHaveValue("");
    third.unmount();

    renderForm({ mode: "edit", selectedSecret: null });
    expect(screen.getByTestId("name-input")).toHaveValue("");
    expect(screen.getByTestId("description-input")).toHaveValue("");
  });

  it("does nothing when a submitted form has no secret name", () => {
    renderForm();

    fireEvent.submit(screen.getByTestId("add-secret-form"));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(
      screen.queryByText(I18nKey.SECRETS$SECRET_VALUE_REQUIRED),
    ).not.toBeInTheDocument();
  });

  it("creates safely when its optional description control is missing", () => {
    renderForm();
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "NO_DESCRIPTION_CONTROL" },
    });
    fireEvent.change(screen.getByTestId("value-input"), {
      target: { value: "secret-value" },
    });
    screen.getByTestId("description-input").remove();

    fireEvent.submit(screen.getByTestId("add-secret-form"));

    expect(mocks.create).toHaveBeenCalledWith(
      {
        name: "NO_DESCRIPTION_CONTROL",
        value: "secret-value",
        description: undefined,
      },
      expect.any(Object),
    );
  });

  it("rejects an add when the secret name is already used", async () => {
    const user = userEvent.setup();
    mocks.secrets = [
      { name: "OTHER_SECRET", description: "existing" },
      { name: "DUPLICATE", description: "existing" },
    ];
    renderForm();

    await user.type(screen.getByTestId("name-input"), "DUPLICATE");
    await user.type(screen.getByTestId("value-input"), "secret-value");
    await user.click(screen.getByTestId("submit-button"));

    expect(screen.getByText(I18nKey.SECRETS$SECRET_ALREADY_EXISTS)).toHaveClass(
      "text-red-500",
      "text-sm",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires a non-whitespace value when adding a secret", () => {
    renderForm();
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "NEW_SECRET" },
    });
    fireEvent.change(screen.getByTestId("value-input"), {
      target: { value: "   " },
    });

    fireEvent.submit(screen.getByTestId("add-secret-form"));

    expect(
      screen.getByText(I18nKey.SECRETS$SECRET_VALUE_REQUIRED),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a trimmed secret, refreshes both secret lists, and closes after settlement", async () => {
    const user = userEvent.setup();
    const { invalidate, onCancel } = renderForm();

    await user.type(screen.getByTestId("name-input"), "NEW_SECRET");
    await user.type(screen.getByTestId("value-input"), "  secret value  ");
    await user.type(screen.getByTestId("description-input"), "for deployments");
    await user.click(screen.getByTestId("submit-button"));

    expect(mocks.create).toHaveBeenCalledWith(
      {
        name: "NEW_SECRET",
        value: "secret value",
        description: "for deployments",
      },
      expect.any(Object),
    );
    const options = mocks.create.mock.calls[0][1];

    expect(invalidate).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => options.onSuccess());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["secrets-search"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["secrets"] });
    expect(onCancel).not.toHaveBeenCalled();

    options.onSettled();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("omits an empty optional description when creating", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByTestId("name-input"), "NO_DESCRIPTION");
    await user.type(screen.getByTestId("value-input"), "value");
    await user.click(screen.getByTestId("submit-button"));

    expect(mocks.create).toHaveBeenCalledWith(
      { name: "NO_DESCRIPTION", value: "value", description: undefined },
      expect.any(Object),
    );
  });

  it("edits the selected secret without treating its unchanged name as a duplicate", async () => {
    const user = userEvent.setup();
    mocks.secrets = [
      { name: "EDIT_ME", description: "old description" },
      { name: "OTHER_SECRET" },
    ];
    const { invalidate, onCancel } = renderForm({
      mode: "edit",
      selectedSecret: "EDIT_ME",
    });

    await user.clear(screen.getByTestId("description-input"));
    await user.type(screen.getByTestId("description-input"), "new description");
    await user.click(screen.getByTestId("submit-button"));

    expect(mocks.update).toHaveBeenCalledWith(
      {
        secretToEdit: "EDIT_ME",
        name: "EDIT_ME",
        description: "new description",
      },
      expect.any(Object),
    );
    const options = mocks.update.mock.calls[0][1];

    expect(invalidate).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => options.onSuccess());

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();

    options.onSettled();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("rejects renaming an edited secret to an existing name", async () => {
    const user = userEvent.setup();
    mocks.secrets = [{ name: "EDIT_ME" }, { name: "OTHER_SECRET" }];
    renderForm({ mode: "edit", selectedSecret: "EDIT_ME" });

    await user.clear(screen.getByTestId("name-input"));
    await user.type(screen.getByTestId("name-input"), "OTHER_SECRET");
    await user.click(screen.getByTestId("submit-button"));

    expect(
      screen.getByText(I18nKey.SECRETS$SECRET_ALREADY_EXISTS),
    ).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("omits an empty edit description and does not edit without a selected secret", async () => {
    const user = userEvent.setup();
    mocks.secrets = [{ name: "EDIT_ME" }];
    const selected = renderForm({ mode: "edit", selectedSecret: "EDIT_ME" });
    await user.click(screen.getByTestId("submit-button"));
    expect(mocks.update).toHaveBeenCalledWith(
      {
        secretToEdit: "EDIT_ME",
        name: "EDIT_ME",
        description: undefined,
      },
      expect.any(Object),
    );
    selected.unmount();

    mocks.update.mockClear();
    renderForm({ mode: "edit", selectedSecret: null });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "ORPHANED_EDIT" },
    });
    fireEvent.submit(screen.getByTestId("edit-secret-form"));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
