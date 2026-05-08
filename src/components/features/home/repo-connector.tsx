import React from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useUserProviders } from "#/hooks/use-user-providers";
import { GitRepository } from "#/types/git";

const LazyConnectToProviderMessage = React.lazy(() =>
  import("./connect-to-provider-message").then((module) => ({
    default: module.ConnectToProviderMessage,
  })),
);

const LazyRepositorySelectionForm = React.lazy(() =>
  import("./repo-selection-form").then((module) => ({
    default: module.RepositorySelectionForm,
  })),
);

const LazyWorkspaceSelectionForm = React.lazy(() =>
  import("./workspace-selection-form").then((module) => ({
    default: module.WorkspaceSelectionForm,
  })),
);

interface RepoConnectorProps {
  onRepoSelection: (repo: GitRepository | null) => void;
}

export function RepoConnector({ onRepoSelection }: RepoConnectorProps) {
  const { isLoadingSettings, providers } = useUserProviders();
  const isCloud = useActiveBackend().backend.kind === "cloud";

  let connectorContent: React.ReactNode;
  if (!isCloud) {
    connectorContent = (
      <LazyWorkspaceSelectionForm isLoadingSettings={isLoadingSettings} />
    );
  } else if (providers.length > 0) {
    connectorContent = (
      <LazyRepositorySelectionForm
        onRepoSelection={onRepoSelection}
        isLoadingSettings={isLoadingSettings}
      />
    );
  } else {
    connectorContent = <LazyConnectToProviderMessage />;
  }

  return (
    <section
      data-testid="repo-connector"
      className="w-full flex flex-col gap-6 rounded-[12px] p-[20px] border border-[#727987] bg-[#26282D] min-h-[263.5px] relative"
    >
      <React.Suspense fallback={null}>{connectorContent}</React.Suspense>
    </section>
  );
}
