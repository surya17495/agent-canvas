import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  extensionModuleCardPillClassName,
  extensionModuleCardSurfaceClassName,
} from "#/utils/extension-module-card-classes";
import type { InstalledExtension } from "#/extensions/installed-store";
import { capabilityLabelKey } from "./capability-labels";

interface InstalledExtensionCardProps {
  extension: InstalledExtension;
  onUninstall: () => void;
}

export function InstalledExtensionCard({
  extension,
  onUninstall,
}: InstalledExtensionCardProps) {
  const { t } = useTranslation("openhands");
  const isDev = extension.origin === "dev";

  return (
    <div
      data-testid={`installed-extension-card-${extension.id}`}
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden p-4",
        extensionModuleCardSurfaceClassName,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            data-testid={`installed-extension-name-${extension.id}`}
            className="truncate text-sm font-semibold text-white"
          >
            {extension.name}
          </h3>
          {extension.publisher ? (
            <p className="mt-0.5 truncate text-xs text-tertiary-alt">
              {t(I18nKey.EXTENSIONS$PUBLISHED_BY, {
                publisher: extension.publisher,
              })}
            </p>
          ) : null}
        </div>
        {isDev ? (
          <span
            className={cn(extensionModuleCardPillClassName, "flex-shrink-0")}
            title={extension.sourceUrl}
          >
            {t(I18nKey.EXTENSIONS$DEV_BADGE)}
          </span>
        ) : (
          <BrandButton
            type="button"
            variant="danger"
            testId={`uninstall-extension-${extension.id}`}
            className="flex-shrink-0 whitespace-nowrap"
            onClick={onUninstall}
          >
            {t(I18nKey.EXTENSIONS$UNINSTALL_BUTTON)}
          </BrandButton>
        )}
      </header>

      <span
        className={cn(extensionModuleCardPillClassName, "self-start")}
        data-testid={`installed-extension-version-${extension.id}`}
      >
        {t(I18nKey.SETTINGS$SKILLS_VERSION, { version: extension.version })}
      </span>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-tertiary-light">
          {t(I18nKey.EXTENSIONS$PERMISSIONS_TITLE)}
        </span>
        {extension.capabilities.length === 0 ? (
          <span className="text-xs text-tertiary-alt">
            {t(I18nKey.EXTENSIONS$NO_PERMISSIONS)}
          </span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {extension.capabilities.map((capability) => (
              <li
                key={capability}
                className={extensionModuleCardPillClassName}
                title={capability}
              >
                {t(capabilityLabelKey(capability))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
