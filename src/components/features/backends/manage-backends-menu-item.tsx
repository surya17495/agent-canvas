import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";

interface ManageBackendsMenuItemProps {
  onOpen: () => void;
}

export function ManageBackendsMenuItem({ onOpen }: ManageBackendsMenuItemProps) {
  const { t } = useTranslation("openhands");

  return (
    <button
      type="button"
      data-testid="manage-backends-menu-item"
      onClick={onOpen}
      className="flex w-full items-center gap-2 p-2 rounded text-xs cursor-pointer hover:bg-white/10 hover:text-white"
    >
      <Settings width={16} height={16} className="text-white shrink-0" />
      {t(I18nKey.BACKEND$MANAGE)}
    </button>
  );
}
