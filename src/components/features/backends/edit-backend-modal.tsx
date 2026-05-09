import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import type { Backend, BackendKind } from "#/api/backend-registry/types";

interface EditBackendModalProps {
  backend: Backend;
  onClose: () => void;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function EditBackendModal({ backend, onClose }: EditBackendModalProps) {
  const { t } = useTranslation("openhands");
  const { updateBackend } = useActiveBackendContext();

  const [name, setName] = React.useState(backend.name);
  const [host, setHost] = React.useState(backend.host);
  const [apiKey, setApiKey] = React.useState("");
  const [kind, setKind] = React.useState<BackendKind>(backend.kind);

  const hasExistingKey = backend.apiKey.length > 0;

  const canSubmit =
    name.trim().length > 0 &&
    host.trim().length > 0 &&
    (kind === "local" || hasExistingKey || apiKey.trim().length > 0);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const patch: Partial<Omit<Backend, "id">> = {
      name: name.trim(),
      host: normalizeHost(host),
      kind,
    };

    // Only update apiKey if user entered a new one
    if (apiKey.trim().length > 0) {
      patch.apiKey = apiKey.trim();
    }

    updateBackend(backend.id, patch);
    onClose();
  };

  return (
    <ModalBackdrop
      onClose={onClose}
      closeOnEscape={false}
      aria-label={t(I18nKey.BACKEND$EDIT_TITLE)}
    >
      <form
        data-testid="edit-backend-modal"
        onSubmit={onSubmit}
        className="bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-tertiary"
        style={{ width: "480px" }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold">{t(I18nKey.BACKEND$EDIT_TITLE)}</h3>
          <p className="text-xs text-gray-400">
            {t(I18nKey.BACKEND$EDIT_SUBTITLE)}
          </p>
        </div>

        <SettingsInput
          testId="edit-backend-name"
          name="edit-backend-name"
          type="text"
          label={t(I18nKey.BACKEND$NAME_LABEL)}
          value={name}
          onChange={setName}
          placeholder="Production"
          className="w-full"
        />

        <SettingsInput
          testId="edit-backend-host"
          name="edit-backend-host"
          type="text"
          label={t(I18nKey.BACKEND$HOST_LABEL)}
          value={host}
          onChange={setHost}
          placeholder="https://app.all-hands.dev"
          className="w-full"
        />

        <SettingsInput
          testId="edit-backend-api-key"
          name="edit-backend-api-key"
          type="password"
          label={t(I18nKey.BACKEND$KEY_LABEL)}
          value={apiKey}
          onChange={setApiKey}
          placeholder={
            hasExistingKey ? t(I18nKey.BACKEND$KEY_PLACEHOLDER_EXISTING) : ""
          }
          className="w-full"
        />

        <fieldset className="flex flex-col">
          <legend className="text-sm mb-3">
            {t(I18nKey.BACKEND$KIND_LABEL)}
          </legend>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="edit-backend-kind"
                checked={kind === "local"}
                onChange={() => setKind("local")}
                data-testid="edit-backend-kind-local"
              />
              {t(I18nKey.BACKEND$KIND_LOCAL)}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="edit-backend-kind"
                checked={kind === "cloud"}
                onChange={() => setKind("cloud")}
                data-testid="edit-backend-kind-cloud"
              />
              {t(I18nKey.BACKEND$KIND_CLOUD)}
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {kind === "cloud"
              ? t(I18nKey.BACKEND$KEY_HELPER_CLOUD)
              : t(I18nKey.BACKEND$KEY_HELPER_LOCAL)}
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-2 mt-2 w-full">
          <BrandButton
            type="submit"
            variant="primary"
            isDisabled={!canSubmit}
            testId="edit-backend-submit"
            className="w-full text-center"
          >
            {t(I18nKey.BACKEND$SAVE)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="edit-backend-cancel"
            className="w-full text-center"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
