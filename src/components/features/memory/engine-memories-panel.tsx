import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type {
  CentriEngineMemoryEntry,
  CentriGraphDocument,
} from "#/api/centri/centri.types";
import { useCentriEngineMemoryCreate } from "#/hooks/mutation/use-centri-engine-memory-create";
import { useCentriEngineMemoryUpdate } from "#/hooks/mutation/use-centri-engine-memory-update";
import { useCentriEngineMemoryForget } from "#/hooks/mutation/use-centri-engine-memory-forget";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { centriErrorMessageKey } from "#/components/features/settings/centri-settings/centri-error-message";

/** One editable engine memory: its entry plus the role its container maps to. */
interface EngineMemoryRow {
  role: string;
  entry: CentriEngineMemoryEntry;
}

/**
 * Maps a document to its role via the container-tag convention
 * `centri:<user>:<role>` (SPEC §3.6). Documents without a matching tag are
 * skipped — they aren't ours to edit.
 */
function documentRole(doc: CentriGraphDocument, user: string): string | null {
  const prefix = `centri:${user}:`;
  for (const tag of doc.containerTags ?? []) {
    if (tag.startsWith(prefix)) return tag.slice(prefix.length);
  }
  return null;
}

/** Flattens the graph feed into editable rows: latest, non-forgotten entries. */
export function toEngineMemoryRows(
  documents: CentriGraphDocument[],
  user: string,
): EngineMemoryRow[] {
  const rows: EngineMemoryRow[] = [];
  for (const doc of documents) {
    const role = documentRole(doc, user);
    if (!role) continue;
    for (const entry of doc.memoryEntries ?? []) {
      if (entry.isLatest && !entry.isForgotten) rows.push({ role, entry });
    }
  }
  rows.sort((a, b) =>
    String(b.entry.updatedAt ?? b.entry.createdAt ?? "").localeCompare(
      String(a.entry.updatedAt ?? a.entry.createdAt ?? ""),
    ),
  );
  return rows;
}

function MemoryRowView({
  row,
  canMutate,
}: {
  row: EngineMemoryRow;
  canMutate: boolean;
}) {
  const { t } = useTranslation("openhands");
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draft, setDraft] = React.useState(row.entry.memory);
  const { mutate: update, isPending: isSaving } = useCentriEngineMemoryUpdate();
  const { mutate: forget, isPending: isForgetting } =
    useCentriEngineMemoryForget();

  const save = () => {
    update(
      { role: row.role, memoryId: row.entry.id, newContent: draft },
      {
        onSuccess: () => {
          setEditing(false);
          displaySuccessToast(t(I18nKey.MEMORY$UPDATED));
        },
        onError: (err) => displayErrorToast(t(centriErrorMessageKey(err))),
      },
    );
  };

  const doForget = () => {
    forget(
      { role: row.role, memoryId: row.entry.id },
      {
        onSuccess: () => {
          setConfirming(false);
          displaySuccessToast(t(I18nKey.MEMORY$ENGINE_FORGOTTEN));
        },
        onError: (err) => displayErrorToast(t(centriErrorMessageKey(err))),
      },
    );
  };

  return (
    <li
      data-testid={`engine-memory-${row.entry.id}`}
      className="flex flex-col gap-2 rounded-md border border-base-secondary px-3 py-2"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-tertiary-light">
          <span className="font-mono">{row.role}</span>
          {" · "}
          {t(I18nKey.MEMORY$VERSION, { version: row.entry.version })}
        </span>
        {canMutate && !editing && !confirming ? (
          <span className="flex gap-2">
            <BrandButton
              testId={`engine-memory-edit-${row.entry.id}`}
              variant="secondary"
              type="button"
              onClick={() => {
                setDraft(row.entry.memory);
                setEditing(true);
              }}
            >
              {t(I18nKey.CENTRI_MEMORY$EDIT)}
            </BrandButton>
            <BrandButton
              testId={`engine-memory-forget-${row.entry.id}`}
              variant="secondary"
              type="button"
              onClick={() => setConfirming(true)}
            >
              {t(I18nKey.CENTRI_MEMORY$FORGET)}
            </BrandButton>
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            data-testid={`engine-memory-editor-${row.entry.id}`}
            className="min-h-24 w-full rounded-md border border-base-secondary bg-base-primary p-2 font-mono text-sm"
            value={draft}
            disabled={isSaving}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <BrandButton
              testId={`engine-memory-save-${row.entry.id}`}
              variant="primary"
              type="button"
              isDisabled={isSaving || draft.trim().length === 0}
              onClick={save}
            >
              {t(
                isSaving
                  ? I18nKey.CENTRI_MEMORY$SAVING
                  : I18nKey.CENTRI_MEMORY$SAVE,
              )}
            </BrandButton>
            <BrandButton
              testId={`engine-memory-cancel-${row.entry.id}`}
              variant="secondary"
              type="button"
              isDisabled={isSaving}
              onClick={() => setEditing(false)}
            >
              {t(I18nKey.MEMORY$CANCEL)}
            </BrandButton>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{row.entry.memory}</p>
      )}

      {confirming ? (
        <div
          data-testid={`engine-memory-confirm-${row.entry.id}`}
          className="flex flex-col gap-2 rounded-md bg-base-secondary/60 p-2"
        >
          <p className="text-sm">{t(I18nKey.MEMORY$ENGINE_FORGET_CONFIRM)}</p>
          <div className="flex gap-2">
            <BrandButton
              testId={`engine-memory-confirm-forget-${row.entry.id}`}
              variant="danger"
              type="button"
              isDisabled={isForgetting}
              onClick={doForget}
            >
              {t(
                isForgetting
                  ? I18nKey.CENTRI_MEMORY$FORGETTING
                  : I18nKey.CENTRI_MEMORY$FORGET,
              )}
            </BrandButton>
            <BrandButton
              testId={`engine-memory-cancel-forget-${row.entry.id}`}
              variant="secondary"
              type="button"
              isDisabled={isForgetting}
              onClick={() => setConfirming(false)}
            >
              {t(I18nKey.MEMORY$CANCEL)}
            </BrandButton>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function AddMemoryBox({
  roles,
  defaultRole,
}: {
  roles: string[];
  defaultRole: string;
}) {
  const { t } = useTranslation("openhands");
  const [role, setRole] = React.useState(defaultRole || roles[0] || "");
  const [content, setContent] = React.useState("");
  const { mutate: create, isPending } = useCentriEngineMemoryCreate();

  React.useEffect(() => {
    if (defaultRole) setRole(defaultRole);
  }, [defaultRole]);

  const add = () => {
    create(
      { role, memories: [{ content }] },
      {
        onSuccess: () => {
          setContent("");
          displaySuccessToast(t(I18nKey.MEMORY$ADDED));
        },
        onError: (err) => displayErrorToast(t(centriErrorMessageKey(err))),
      },
    );
  };

  return (
    <div
      data-testid="engine-memory-add"
      className="flex flex-col gap-2 rounded-md border border-dashed border-base-secondary p-3"
    >
      <textarea
        data-testid="engine-memory-add-input"
        className="min-h-16 w-full rounded-md border border-base-secondary bg-base-primary p-2 text-sm"
        placeholder={t(I18nKey.MEMORY$ADD_PLACEHOLDER)}
        value={content}
        disabled={isPending}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-tertiary-light">
          {t(I18nKey.CENTRI_MEMORY$ROLE)}
          <select
            data-testid="engine-memory-add-role"
            className="rounded-md border border-base-secondary bg-base-primary px-2 py-1 text-sm"
            value={role}
            disabled={isPending}
            onChange={(e) => setRole(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <BrandButton
          testId="engine-memory-add-save"
          variant="primary"
          type="button"
          isDisabled={isPending || !role || content.trim().length === 0}
          onClick={add}
        >
          {t(isPending ? I18nKey.MEMORY$ADDING : I18nKey.MEMORY$ADD)}
        </BrandButton>
      </div>
    </div>
  );
}

/**
 * The editable engine-memory blocks (C8): the latest non-forgotten memory of
 * every version chain in the graph feed, with inline revise (a new engine
 * version), soft forget (excluded from recall), and a create box. Every
 * mutation is spine-first in `centrid` (SPEC §3.10) — the UI only ever talks
 * to the daemon, never to the engine.
 */
export function EngineMemoriesPanel({
  documents,
  user,
  roles,
  selectedRole,
  canMutate,
}: {
  documents: CentriGraphDocument[];
  user: string;
  roles: string[];
  selectedRole: string;
  canMutate: boolean;
}) {
  const { t } = useTranslation("openhands");
  const rows = React.useMemo(
    () => toEngineMemoryRows(documents, user),
    [documents, user],
  );

  return (
    <section
      data-testid="engine-memories-panel"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">
          {t(I18nKey.MEMORY$ENGINE_TITLE)}
        </h3>
        <p className="text-xs text-tertiary-light">
          {t(I18nKey.MEMORY$ENGINE_HELP)}
        </p>
      </div>

      {canMutate ? (
        <AddMemoryBox roles={roles} defaultRole={selectedRole} />
      ) : null}

      {rows.length === 0 ? (
        <p
          data-testid="engine-memories-empty"
          className="py-3 text-sm text-tertiary-light"
        >
          {t(I18nKey.MEMORY$ENGINE_EMPTY)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <MemoryRowView key={row.entry.id} row={row} canMutate={canMutate} />
          ))}
        </ul>
      )}
    </section>
  );
}
