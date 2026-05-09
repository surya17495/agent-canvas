import { configureRemoteVmAgentPrompt } from "#/prompts/templates/configure-remote-vm-agent";
import type {
  ApplicationPrompt,
  ApplicationPromptContextById,
  ApplicationPromptId,
} from "#/prompts/types";

export const APPLICATION_PROMPTS = {
  "configure-remote-vm-agent": configureRemoteVmAgentPrompt,
} satisfies {
  [TId in ApplicationPromptId]: ApplicationPrompt<
    ApplicationPromptContextById[TId]
  >;
};

export function getApplicationPrompt<TId extends ApplicationPromptId>(
  promptId: TId,
) {
  return APPLICATION_PROMPTS[promptId];
}

export function renderApplicationPrompt<TId extends ApplicationPromptId>(
  promptId: TId,
  context?: ApplicationPromptContextById[TId],
): string {
  const prompt = getApplicationPrompt(promptId) as ApplicationPrompt<
    ApplicationPromptContextById[TId]
  >;
  return prompt.render(context as ApplicationPromptContextById[TId]);
}
