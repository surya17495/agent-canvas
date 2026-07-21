import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useCentriMemoryStores } from "#/hooks/query/use-centri-memory-stores";
import { useCentriMemoryStore } from "#/hooks/query/use-centri-memory-store";
import { useCentriMemoryEdit } from "#/hooks/mutation/use-centri-memory-edit";
import { useCentriMemoryForget } from "#/hooks/mutation/use-centri-memory-forget";
import { hasCentriMutationPath } from "#/api/centri/centri-config";
import type {
  CentriEngineSection,
  CentriMemoryKind,
  CentriMemoryRole,
  CentriMemoryStore,
} from "#/api/centri/centri.types";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { centriErrorMessageKey } from "../centri-settings/centri-error-message";

/** The store the user has opened in the editor. */
interface Selected {
  role: string;
  kind: CentriMemoryKind;
}

const KIND_LABEL: Record<CentriMemoryKind, I18nKey> = {
  rules: I18nKey.CENTRI_MEMORY$KIND_RULES,
  identity: I18nKey.CENTRI_MEMORY$KIND_IDENTITY,
  working_notes: I18nKey.CENTRI_MEMORY$KIND_WORKING_NOTES,
};

function StoreRow({
  store,
  isActive,
  onOpen,
}: {
  store: CentriMemoryStore;
  isActive: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation("openhands");
  return (
    <li
      data-testid={`centri-memory-store-${store.role}-${store.kind}`}
      className={cn(
        "flex items-center justify-between gap-4 rounded-md px-3 py-2 text-sm",
        isActive ? "bg-base-secondary" : "hover:bg-base-secondary/60",
      )}
    >
      <div className="flex flex-col">
        <span className="font-medium">{t(KIND_LABEL[store.kind])}</span>
        <span className="text-tertiary-light text-xs">
          {store.present
            ? t(I18nKey.CENTRI_MEMORY$SIZE, {
                chars: store.chars,
                lines: store.lines,
              })
            : t(I18nKey.CENTRI_MEMORY$ABSENT)}
        </span>
      </div>
      <BrandButton
        testId={`centri-memory-open-${store.role}-${store.kind}`}
        variant="secondary"
        type="button"
        onClick={onOpen}
      >
        {store.present
          ? t(I18nKey.CENTRI_MEMORY$EDIT)
          : t(I18nKey.CENTRI_MEMORY$CREATE)}
      </BrandButton>
    </li>
  );
}

function RoleCard({
  role,
  selected,
  onOpen,
}: {
  role: CentriMemoryRole;
  selected: Selected | null;
  onOpen: (kind: CentriMemoryKind) => void;
}) {
  const { t } = useTranslation("openhands");
  return (
    <section
      data-testid={`centri-memory-role-${role.role}`}
      className="border-t border-[var(--oh-border)] pt-4"
    >
      <Typography.H3 className="mb-2">
        {t(I18nKey.CENTRI_MEMORY$ROLE)}:{" "}
        <span className="font-mono">{role.role}</span>
      </Typography.H3>
      <ul className="flex flex-col gap-1">
        {role.stores.map((store) => (
          <StoreRow
            key={store.kind}
            store={store}
            isActive={
              selected?.role === role.role && selected?.kind === store.kind
            }
            onOpen={() => onOpen(store.kind)}
          />
        ))}
      </ul>
    </section>
  );
}

function EngineSectionsNote({ sections }: { sections: CentriEngineSection[] }) {
  const { t } = useTranslation("openhands");
  if (sections.length === 0) return null;
  return (
    <section
      data-testid="centri-memory-engine-sections"
      className="border-t border-[var(--oh-border)] pt-4"
    >
      <Typography.H3 className="mb-1">
        {t(I18nKey.CENTRI_MEMORY$ENGINE_SECTIONS_TITLE)}
      </Typography.H3>
      <p className="text-tertiary-light text-sm mb-2">
        {t(I18nKey.CENTRI_MEMORY$ENGINE_SECTIONS_HELP)}
      </p>
      <ul className="flex flex-col gap-1">
        {sections.map((section) => (
          <li
            key={section.name}
            className="text-sm flex flex-col sm:flex-row sm:justify-between sm:gap-4"
          >
            <span className="font-medium">{section.name}</span>
            <span className="text-tertiary-light break-all">
              {section.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ForgetConfirm({
  onConfirm,
  onCancel,
  isForgetting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isForgetting: boolean;
}) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="centri-memory-forget-confirm"
      role="alertdialog"
      aria-live="polite"
      className="mt-2 flex flex-col gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm"
    >
      <span>{t(I18nKey.CENTRI_MEMORY$FORGET_CONFIRM)}</span>
      <div className="flex gap-2">
        <BrandButton
          testId="centri-memory-forget-yes"
          variant="danger"
          type="button"
          isDisabled={isForgetting}
          aria-busy={isForgetting}
          onClick={onConfirm}
        >
          {isForgetting
            ? t(I18nKey.CENTRI_MEMORY$FORGETTING)
            : t(I18nKey.BUTTON$CONFIRM)}
        </BrandButton>
        <BrandButton
          testId="centri-memory-forget-no"
          variant="secondary"
          type="button"
          isDisabled={isForgetting}
          onClick={onCancel}
        >
          {t(I18nKey.BUTTON$CANCEL)}
        </BrandButton>
      </div>
    </div>
  );
}

function StoreEditor({
  selected,
  onClose,
}: {
  selected: Selected;
  onClose: () => void;
}) {
  const { t } = useTranslation("openhands");
  const tokenPresent = hasCentriMutationPath();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useCentriMemoryStore(selected.role, selected.kind);
  const { mutate: edit, isPending: isSaving } = useCentriMemoryEdit();
  const { mutate: forget, isPending: isForgetting } = useCentriMemoryForget();

  const [draft, setDraft] = React.useState<string | null>(null);
  const [confirmingForget, setConfirmingForget] = React.useState(false);

  // Reset the local draft whenever a different store's content loads, so the
  // editor always starts from the server's current content (never stale).
  React.useEffect(() => {
    setDraft(null);
    setConfirmingForget(false);
  }, [selected.role, selected.kind]);

  const serverContent = data?.content ?? "";
  const value = draft ?? serverContent;
  const dirty = draft !== null && draft !== serverContent;
  const present = data?.store.present ?? false;

  const onSave = () => {
    edit(
      { role: selected.role, kind: selected.kind, content: value },
      {
        onSuccess: () => {
          setDraft(null);
          displaySuccessToast(t(I18nKey.CENTRI_MEMORY$SAVED));
        },
        onError: (err) => displayErrorToast(t(centriErrorMessageKey(err))),
      },
    );
  };

  const onForget = () => {
    forget(
      { role: selected.role, kind: selected.kind },
      {
        onSuccess: () => {
          setDraft(null);
          setConfirmingForget(false);
          displaySuccessToast(t(I18nKey.CENTRI_MEMORY$FORGOTTEN));
        },
        onError: (err) => {
          setConfirmingForget(false);
          displayErrorToast(t(centriErrorMessageKey(err)));
        },
      },
    );
  };

  return (
    <div
      data-testid="centri-memory-editor"
      className="flex flex-col gap-3 rounded-md border border-[var(--oh-border)] p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <Typography.H3>
          {t(I18nKey.CENTRI_MEMORY$EDITOR_TITLE)}:{" "}
          <span className="font-mono">
            {selected.role} / {t(KIND_LABEL[selected.kind])}
          </span>
        </Typography.H3>
        <BrandButton
          testId="centri-memory-editor-close"
          variant="secondary"
          type="button"
          onClick={onClose}
        >
          {t(I18nKey.CENTRI_MEMORY$CLOSE)}
        </BrandButton>
      </div>

      {isLoading ? (
        <div
          data-testid="centri-memory-editor-loading"
          className="flex items-center gap-3 py-4"
          role="status"
          aria-live="polite"
        >
          <LoadingSpinner size="small" />
          <span className="text-sm text-tertiary-light">
            {t(I18nKey.CENTRI_MEMORY$LOADING)}
          </span>
        </div>
      ) : isError || !data ? (
        <div
          data-testid="centri-memory-editor-error"
          className="flex flex-col items-start gap-3 py-4"
          role="alert"
        >
          <p className="text-sm text-danger">
            {t(centriErrorMessageKey(error))}
          </p>
          <BrandButton
            testId="centri-memory-editor-retry"
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
          {!present ? (
            <p
              data-testid="centri-memory-editor-empty-hint"
              className="text-sm text-tertiary-light"
            >
              {t(I18nKey.CENTRI_MEMORY$EDITOR_EMPTY_HINT)}
            </p>
          ) : null}

          <label htmlFor="centri-memory-content" className="sr-only">
            {t(I18nKey.CENTRI_MEMORY$EDITOR_TITLE)}
          </label>
          <textarea
            id="centri-memory-content"
            data-testid="centri-memory-content"
            className="min-h-[16rem] w-full resize-y rounded-md border border-[var(--oh-border)] bg-base-secondary p-3 font-mono text-sm"
            value={value}
            placeholder={t(I18nKey.CENTRI_MEMORY$EDITOR_PLACEHOLDER)}
            disabled={!tokenPresent}
            onChange={(e) => setDraft(e.target.value)}
          />

          {!tokenPresent ? (
            <p
              data-testid="centri-memory-token-missing"
              className="text-sm text-warning"
            >
              {t(I18nKey.CENTRI_MEMORY$TOKEN_MISSING)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <BrandButton
              testId="centri-memory-save"
              variant="primary"
              type="button"
              isDisabled={!tokenPresent || !dirty || isSaving || isForgetting}
              aria-busy={isSaving}
              onClick={onSave}
            >
              {isSaving
                ? t(I18nKey.CENTRI_MEMORY$SAVING)
                : t(I18nKey.CENTRI_MEMORY$SAVE)}
            </BrandButton>
            <BrandButton
              testId="centri-memory-forget"
              variant="danger"
              type="button"
              isDisabled={
                !tokenPresent || !present || confirmingForget || isForgetting
              }
              onClick={() => setConfirmingForget(true)}
            >
              {t(I18nKey.CENTRI_MEMORY$FORGET)}
            </BrandButton>
          </div>

          {confirmingForget ? (
            <ForgetConfirm
              onConfirm={onForget}
              onCancel={() => setConfirmingForget(false)}
              isForgetting={isForgetting}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export function CentriMemoryScreen() {
  const { t } = useTranslation("openhands");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useCentriMemoryStores();
  const [selected, setSelected] = React.useState<Selected | null>(null);
  const tokenPresent = hasCentriMutationPath();

  if (isLoading) {
    return (
      <div
        data-testid="centri-memory-loading"
        className="flex items-center gap-3 py-6"
        role="status"
        aria-live="polite"
      >
        <LoadingSpinner size="small" />
        <span className="text-sm text-tertiary-light">
          {t(I18nKey.CENTRI_MEMORY$LOADING)}
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        data-testid="centri-memory-error"
        className="flex flex-col items-start gap-3 py-6"
        role="alert"
      >
        <p className="text-sm text-danger">{t(centriErrorMessageKey(error))}</p>
        <BrandButton
          testId="centri-memory-retry"
          variant="secondary"
          type="button"
          isDisabled={isFetching}
          onClick={() => refetch()}
        >
          {t(I18nKey.CENTRI$RETRY)}
        </BrandButton>
      </div>
    );
  }

  return (
    <div data-testid="centri-memory-screen" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-tertiary-light break-all">
          {t(I18nKey.CENTRI_MEMORY$FRAMES_DIR)}:{" "}
          <span className="font-mono">{data.frames_dir}</span>
        </p>
        <BrandButton
          testId="centri-memory-refresh"
          variant="secondary"
          type="button"
          isDisabled={isFetching}
          aria-busy={isFetching}
          onClick={() => refetch()}
        >
          {t(I18nKey.CENTRI$REFRESH)}
        </BrandButton>
      </div>

      {!tokenPresent ? (
        <p
          data-testid="centri-memory-token-missing-banner"
          className="text-sm text-warning"
        >
          {t(I18nKey.CENTRI_MEMORY$TOKEN_MISSING)}
        </p>
      ) : null}

      {data.roles.length === 0 ? (
        <p
          data-testid="centri-memory-empty"
          className="text-sm text-tertiary-light py-4"
        >
          {t(I18nKey.CENTRI_MEMORY$EMPTY)}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.roles.map((role) => (
            <RoleCard
              key={role.role}
              role={role}
              selected={selected}
              onOpen={(kind) => setSelected({ role: role.role, kind })}
            />
          ))}
        </div>
      )}

      {selected ? (
        <StoreEditor selected={selected} onClose={() => setSelected(null)} />
      ) : null}

      <EngineSectionsNote sections={data.engine_sections} />
    </div>
  );
}

export default CentriMemoryScreen;
