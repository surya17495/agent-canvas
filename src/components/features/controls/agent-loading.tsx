import { LoaderCircleIcon } from "#/components/shared/icons";

export function AgentLoading() {
  return (
    <div data-testid="agent-loading-spinner">
      <LoaderCircleIcon className="animate-spin w-4 h-4" color="white" />
    </div>
  );
}
