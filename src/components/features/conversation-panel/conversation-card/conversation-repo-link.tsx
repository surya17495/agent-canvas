import { RepositorySelection } from "#/api/open-hands.types";
import { CodeBranchIcon } from "#/components/shared/icons";
import { GitProviderIcon } from "#/components/shared/git-provider-icon";

interface ConversationRepoLinkProps {
  selectedRepository: RepositorySelection;
}
export function ConversationRepoLink({
  selectedRepository,
}: ConversationRepoLinkProps) {
  return (
    <div className="flex items-center gap-3 flex-1">
      <div className="flex items-center gap-1">
        {selectedRepository.git_provider ? (
          <GitProviderIcon
            gitProvider={selectedRepository.git_provider}
            className="text-[#A3A3A3]"
          />
        ) : null}
        <span
          data-testid="conversation-card-selected-repository"
          className="text-xs text-[#A3A3A3] whitespace-nowrap overflow-hidden text-ellipsis max-w-44"
        >
          {selectedRepository.selected_repository}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <CodeBranchIcon size={12} className="text-[#A3A3A3]" />

        <span
          data-testid="conversation-card-selected-branch"
          className="text-xs text-[#A3A3A3] whitespace-nowrap overflow-hidden text-ellipsis max-w-24"
        >
          {selectedRepository.selected_branch}
        </span>
      </div>
    </div>
  );
}
