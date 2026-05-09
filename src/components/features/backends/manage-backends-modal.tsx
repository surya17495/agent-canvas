import React from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import type { Backend } from "#/api/backend-registry/types";

interface ManageBackendsModalProps {
  onClose: () => void;
  onEditBackend: (backend: Backend) => void;
}

export function ManageBackendsModal({
  onClose,
  onEditBackend,
}: ManageBackendsModalProps) {
  const { t } = useTranslation("openhands");
  const { backends, removeBackend } = useActiveBackendContext();
  const [confirmingRemove, setConfirmingRemove] = React.useState<string | null>(
    null,
  );

  const handleRemove = (backend: Backend) => {
    if (confirmingRemove === backend.id) {
      removeBackend(backend.id);
      setConfirmingRemove(null);
    } else {
      setConfirmingRemove(backend.id);
    }
  };

  const handleEdit = (backend: Backend) => {
    onEditBackend(backend);
  };

  return (
    <ModalBackdrop
      onClose={onClose}
      closeOnEscape
      aria-label={t(I18nKey.BACKEND$MANAGE)}
    >
      <div
        data-testid="manage-backends-modal"
        className="bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-tertiary"
        style={{ width: "480px", maxHeight: "80vh" }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold">{t(I18nKey.BACKEND$MANAGE)}</h3>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {backends.length === 0 ? (
            <p
              className="text-sm text-gray-400 text-center py-4"
              data-testid="no-backends-message"
            >
              {t(I18nKey.BACKEND$NO_BACKENDS)}
            </p>
          ) : (
            backends.map((backend) => (
              <div
                key={backend.id}
                data-testid={`backend-item-${backend.id}`}
                className="flex items-center justify-between p-3 bg-tertiary rounded-lg"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {backend.name}
                  </span>
                  <span className="text-xs text-gray-400 truncate">
                    {backend.host}
                  </span>
                  <span className="text-xs text-gray-500">
                    {backend.kind === "cloud"
                      ? t(I18nKey.BACKEND$KIND_CLOUD)
                      : t(I18nKey.BACKEND$KIND_LOCAL)}
                    {backend.apiKey ? " • API key set" : ""}
                  </span>
                </div>

                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {confirmingRemove === backend.id ? (
                    <>
                      <BrandButton
                        type="button"
                        variant="danger"
                        onClick={() => handleRemove(backend)}
                        testId={`confirm-remove-${backend.id}`}
                        className="text-xs px-3 py-1"
                      >
                        {t(I18nKey.BACKEND$REMOVE)}
                      </BrandButton>
                      <BrandButton
                        type="button"
                        variant="secondary"
                        onClick={() => setConfirmingRemove(null)}
                        testId={`cancel-remove-${backend.id}`}
                        className="text-xs px-3 py-1"
                      >
                        {t(I18nKey.BUTTON$CANCEL)}
                      </BrandButton>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEdit(backend)}
                        data-testid={`edit-backend-${backend.id}`}
                        className="p-2 hover:bg-white/10 rounded transition-colors"
                        aria-label={t(I18nKey.BACKEND$EDIT)}
                      >
                        <Pencil width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(backend)}
                        data-testid={`remove-backend-${backend.id}`}
                        className="p-2 hover:bg-white/10 rounded transition-colors text-red-400"
                        aria-label={t(I18nKey.BACKEND$REMOVE)}
                      >
                        <Trash2 width={16} height={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end mt-2">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="manage-backends-close"
          >
            {t(I18nKey.BUTTON$CLOSE)}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}
