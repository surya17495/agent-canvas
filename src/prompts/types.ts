import type { I18nKey } from "#/i18n/declaration";

export type ApplicationPromptId = "configure-remote-vm-agent";

export type ApplicationPromptCategory = "backend" | "git" | "repo" | "planning";

export interface ApplicationPromptContextById {
  "configure-remote-vm-agent": undefined;
}

export interface ApplicationPrompt<TContext = undefined> {
  id: ApplicationPromptId;
  labelKey: I18nKey;
  descriptionKey?: I18nKey;
  category: ApplicationPromptCategory;
  render: (context: TContext) => string;
}

export type ApplicationPromptRunMode =
  | "current-conversation-draft"
  | "new-conversation-draft"
  | "new-conversation-initial-message";

export interface RunApplicationPromptOptions<
  TId extends ApplicationPromptId = ApplicationPromptId,
> {
  promptId: TId;
  mode: ApplicationPromptRunMode;
  context?: ApplicationPromptContextById[TId];
  onSuccess?: () => void;
  navigate?: (to: string) => void;
}
