import { cn } from "#/utils/utils";
import { Provider } from "#/types/settings";
import AzureDevOpsLogo from "#/assets/branding/azure-devops-logo.svg?react";
import BitbucketLogo from "#/assets/branding/bitbucket-logo.svg?react";
import GithubLogo from "#/assets/branding/github-logo.svg?react";
import GitlabLogo from "#/assets/branding/gitlab-logo.svg?react";

interface GitProviderIconProps {
  gitProvider: Provider;
  className?: string;
}

const iconClassName = (className?: string) =>
  cn("w-[14px] h-[14px] shrink-0", className);

export function GitProviderIcon({
  gitProvider,
  className,
}: GitProviderIconProps) {
  return (
    <>
      {gitProvider === "github" && (
        <GithubLogo className={iconClassName(className)} />
      )}
      {gitProvider === "gitlab" && (
        <GitlabLogo className={iconClassName(className)} />
      )}
      {(gitProvider === "bitbucket" ||
        gitProvider === "bitbucket_data_center") && (
        <BitbucketLogo className={iconClassName(className)} />
      )}
      {gitProvider === "azure_devops" && (
        <AzureDevOpsLogo className={iconClassName(className)} />
      )}
    </>
  );
}
