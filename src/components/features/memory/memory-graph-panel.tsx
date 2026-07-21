import type { ComponentProps } from "react";
import { MemoryGraph } from "@supermemory/memory-graph";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { CentriGraphDocument } from "#/api/centri/centri.types";

/**
 * The Supermemory-style graph over the centrid graph feed (C8). The feed is
 * a raw `DocumentWithMemories` passthrough — `centrid` deliberately does not
 * normalize it because this component consumes that exact engine shape
 * (SPEC §9 update 2026-07-21) — so the cast below is the documented contract,
 * not a guess. Styles are bundled and self-inject on mount.
 */
export function MemoryGraphPanel({
  documents,
  isLoading,
  error,
}: {
  documents: CentriGraphDocument[];
  isLoading: boolean;
  error: Error | null;
}) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="memory-graph-panel"
      className="h-[520px] w-full overflow-hidden rounded-lg border border-base-secondary"
    >
      <MemoryGraph
        documents={
          documents as unknown as ComponentProps<
            typeof MemoryGraph
          >["documents"]
        }
        isLoading={isLoading}
        error={error}
        variant="console"
      >
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-tertiary-light">
            {t(I18nKey.MEMORY$GRAPH_EMPTY)}
          </p>
        </div>
      </MemoryGraph>
    </div>
  );
}
