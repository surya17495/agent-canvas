import type { ComponentProps } from "react";
import { useCallback } from "react";
import { MemoryGraph } from "@supermemory/memory-graph";
import type { GraphThemeColors } from "@supermemory/memory-graph";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { CentriGraphDocument } from "#/api/centri/centri.types";

type GraphDocuments = NonNullable<
  ComponentProps<typeof MemoryGraph>["documents"]
>;

/**
 * State-of-the-art theme for the memory graph, matched to the agent-canvas
 * dark palette (tailwind.config.js): near-black canvas, gold (#F3CE49) accent,
 * and three visually-distinct edge colors so the relation TYPE reads at a
 * glance — updates (gold, the engine's version/refine edge), extends (teal),
 * derives (violet, the shell-derived association edge). `colors` is a partial
 * merged over the lib's DEFAULT_COLORS, so anything omitted still resolves.
 */
export const CENTRI_GRAPH_THEME: Partial<GraphThemeColors> = {
  bg: "#050505",
  docFill: "#0f0f0f",
  docStroke: "#F3CE49",
  docInnerFill: "#1a1a1a",
  memFill: "#171717",
  memFillHover: "#242424",
  memStrokeDefault: "#3a3a3a",
  accent: "#F3CE49",
  textPrimary: "#fafafa",
  textSecondary: "#a3a3a3",
  textMuted: "#8c8c8c",
  edgeUpdates: "#F3CE49", // engine version/refine edge — gold, matches accent
  edgeExtends: "#34d399", // engine "extends" — teal
  edgeDerives: "#a78bfa", // shell-derived association — violet
  memBorderForgotten: "#525252",
  memBorderExpiring: "#fda4af",
  memBorderRecent: "#6ee7b7",
  glowColor: "#F3CE49",
  iconColor: "#8c8c8c",
  popoverBg: "#0a0a0a",
  popoverBorder: "#262626",
  popoverTextPrimary: "#fafafa",
  popoverTextSecondary: "#a3a3a3",
  popoverTextMuted: "#8c8c8c",
  controlBg: "#0a0a0a",
  controlBorder: "#262626",
};

// Cap how many association edges a single memory radiates, so dense documents
// form a readable cluster instead of a hairball.
const MAX_ASSOC_PER_NODE = 4;

/**
 * Derive association edges the engine did NOT record.
 *
 * Diagnosis (2026-07-23): the pinned engine (`server-v0.0.5`) extraction
 * prompt only ever emits an `updates` relation for a fact that contradicts a
 * prior memory, and never calls its own `linkMemories` tool — so ~97% of
 * live memories carry `memoryRelations: {}` and the graph renders as isolated
 * star-bursts. Until the engine populates relations, we surface the genuine
 * association that IS present in the feed: memories extracted from the SAME
 * document share a source context and belong in one cluster. We inject those
 * as `derives` edges (the softest relation type, rendered violet so they are
 * visually distinct from engine-authored `updates`/`extends`). Real engine
 * relations and version chains (`parentMemoryId`/`rootMemoryId`) are preserved
 * untouched — this only ADDS edges, never rewrites existing ones.
 */
function withDerivedRelations(
  doc: CentriGraphDocument,
): CentriGraphDocument["memoryEntries"] {
  const entries = (doc.memoryEntries ?? []).filter(
    (m) => m && !(m as { isForgotten?: boolean }).isForgotten,
  );
  const ids = entries.map((m) => m.id).filter(Boolean) as string[];

  return entries.map((m, i) => {
    const existing =
      ((m as { memoryRelations?: Record<string, string> }).memoryRelations as
        | Record<string, string>
        | undefined) ?? {};
    // Preserve every engine-authored relation exactly.
    const merged: Record<string, string> = { ...existing };

    // Link this memory to a bounded set of its document siblings. Skip self,
    // skip pairs already related by the engine, and skip the version parent
    // (the lib draws that from parentMemoryId already).
    const parentId = (m as { parentMemoryId?: string | null }).parentMemoryId;
    let added = 0;
    for (let j = 0; j < ids.length && added < MAX_ASSOC_PER_NODE; j += 1) {
      const other = ids[j];
      if (j === i || other === parentId) continue;
      if (merged[other]) continue;
      merged[other] = "derives";
      added += 1;
    }

    return { ...m, memoryRelations: merged };
  });
}

/**
 * Adapt the raw centrid graph feed to the shape `@supermemory/memory-graph`
 * consumes. Live divergence found 2026-07-22 against the pinned engine
 * (`server-v0.0.5`): the feed's documents carry their version chain under
 * `memoryEntries` and their type under `type`, while the graph component
 * requires `memories` and `documentType` (its `dist/api-types.d.ts`), and
 * crashed the whole /memory page ("memories is not iterable") with real
 * data. `centrid` stays a passthrough (SPEC §9); the divergence — plus the
 * derived-association edges above — is contained here, in the one component
 * that needs the lib shape.
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
    memories: withDerivedRelations(doc) as unknown,
  })) as GraphDocuments;
}

/**
 * The Supermemory-style graph over the centrid graph feed (C8), adapted to
 * the lib shape by `toGraphDocuments`. Styles are bundled and self-inject on
 * mount. The `colors` prop applies the Centri theme; `onOpenDocument` wires
 * node clicks back to the caller when provided.
 */
export function MemoryGraphPanel({
  documents,
  isLoading,
  error,
  onOpenDocument,
}: {
  documents: CentriGraphDocument[];
  isLoading: boolean;
  error: Error | null;
  onOpenDocument?: (documentId: string) => void;
}) {
  const { t } = useTranslation("openhands");

  const handleOpenDocument = useCallback(
    (documentId: string) => onOpenDocument?.(documentId),
    [onOpenDocument],
  );

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
        colors={CENTRI_GRAPH_THEME}
        maxNodes={600}
        onOpenDocument={onOpenDocument ? handleOpenDocument : undefined}
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
