import type { ComponentProps } from "react";
import { MemoryGraph } from "@supermemory/memory-graph";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { CentriGraphDocument } from "#/api/centri/centri.types";

type GraphDocuments = NonNullable<
  ComponentProps<typeof MemoryGraph>["documents"]
>;

/**
 * Adapt the raw centrid graph feed to the shape `@supermemory/memory-graph`
 * consumes. Live divergence found 2026-07-22 against the pinned engine
 * (`server-v0.0.5`): the feed's documents carry their version chain under
 * `memoryEntries` and their type under `type`, while the graph component
 * requires `memories` and `documentType` (its `dist/api-types.d.ts`), and
 * crashed the whole /memory page ("memories is not iterable") with real
 * data. `centrid` stays a passthrough (SPEC §9); the divergence is contained
 * here, in the one component that needs the lib shape.
 */
export function toGraphDocuments(
  documents: CentriGraphDocument[],
): GraphDocuments {
  return documents.map((doc) => ({
    ...doc,
    title: doc.title ?? null,
    url: (doc.url as string | undefined) ?? null,
    documentType:
      (doc.documentType as string | undefined) ??
      (doc.type as string | undefined) ??
      "text",
    createdAt: (doc.createdAt as string | undefined) ?? "",
    updatedAt: (doc.updatedAt as string | undefined) ?? "",
    summary: (doc.summary as string | null | undefined) ?? null,
    memories: (doc.memoryEntries ?? []) as unknown,
  })) as GraphDocuments;
}

/**
 * The Supermemory-style graph over the centrid graph feed (C8), adapted to
 * the lib shape by `toGraphDocuments`. Styles are bundled and self-inject on
 * mount.
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
        documents={toGraphDocuments(documents)}
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
