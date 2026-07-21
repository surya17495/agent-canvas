import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useCentriMemoryGraph } from "#/hooks/query/use-centri-memory-graph";
import { hasCentriMutationPath } from "#/api/centri/centri-config";
import { CentriMemoryScreen } from "#/components/features/settings/centri-memory/centri-memory-screen";
import { centriErrorMessageKey } from "#/components/features/settings/centri-settings/centri-error-message";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { MemoryGraphPanel } from "./memory-graph-panel";
import { EngineMemoriesPanel } from "./engine-memories-panel";

/**
 * The standalone Memory page (C8): the Supermemory-style graph over the
 * centrid graph feed, plus editable memory blocks — engine memories
 * (versioned, revise/forget/create) and the authored turn-zero stores
 * (SPEC §3.14). Reads work unauthenticated; mutations need a browser token
 * or the server-side proxy-auth posture (§3.12).
 */
export function MemoryPage() {
  const { t } = useTranslation("openhands");
  const [role, setRole] = React.useState("");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useCentriMemoryGraph(role);
  const canMutate = hasCentriMutationPath();

  const documents = data?.documents ?? [];
  const roles = data?.roles ?? [];

  return (
    <div data-testid="memory-page" className="min-h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">
              {t(I18nKey.MEMORY$PAGE_TITLE)}
            </h1>
            <p className="text-sm text-tertiary-light">
              {t(I18nKey.MEMORY$PAGE_SUBTITLE)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-tertiary-light">
              {t(I18nKey.CENTRI_MEMORY$ROLE)}
              <select
                data-testid="memory-role-filter"
                className="rounded-md border border-base-secondary bg-base-primary px-2 py-1 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">{t(I18nKey.MEMORY$ALL_ROLES)}</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <BrandButton
              testId="memory-refresh"
              variant="secondary"
              type="button"
              isDisabled={isFetching}
              aria-busy={isFetching}
              onClick={() => refetch()}
            >
              {t(I18nKey.CENTRI$REFRESH)}
            </BrandButton>
          </div>
        </header>

        {!canMutate ? (
          <p
            data-testid="memory-mutations-disabled-banner"
            className="text-sm text-warning"
          >
            {t(I18nKey.CENTRI_MEMORY$TOKEN_MISSING)}
          </p>
        ) : null}

        {isError ? (
          <div
            data-testid="memory-graph-error"
            className="flex flex-col items-start gap-3 py-2"
            role="alert"
          >
            <p className="text-sm text-danger">
              {t(centriErrorMessageKey(error))}
            </p>
            <BrandButton
              testId="memory-graph-retry"
              variant="secondary"
              type="button"
              isDisabled={isFetching}
              onClick={() => refetch()}
            >
              {t(I18nKey.CENTRI$RETRY)}
            </BrandButton>
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">
                {t(I18nKey.MEMORY$GRAPH_TITLE)}
              </h2>
              <MemoryGraphPanel
                documents={documents}
                isLoading={isLoading}
                error={null}
              />
            </section>

            {isLoading ? (
              <div
                data-testid="memory-page-loading"
                className="flex items-center gap-3 py-4"
                role="status"
                aria-live="polite"
              >
                <LoadingSpinner size="small" />
                <span className="text-sm text-tertiary-light">
                  {t(I18nKey.CENTRI_MEMORY$LOADING)}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <EngineMemoriesPanel
                  documents={documents}
                  user={data?.user ?? ""}
                  roles={roles}
                  selectedRole={role}
                  canMutate={canMutate}
                />
                <section className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-semibold">
                      {t(I18nKey.MEMORY$AUTHORED_TITLE)}
                    </h3>
                    <p className="text-xs text-tertiary-light">
                      {t(I18nKey.MEMORY$AUTHORED_HELP)}
                    </p>
                  </div>
                  <CentriMemoryScreen />
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MemoryPage;
