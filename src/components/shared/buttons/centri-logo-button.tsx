import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export type CentriLogoButtonProps = {
  className?: string;
  /** Render the compact single-letter mark (collapsed sidebar rail). */
  compact?: boolean;
};

/**
 * Centri brand mark linking home. No Centri brand asset exists yet, so this
 * renders a text wordmark ("Centri", or a "C" monogram when compact) as a
 * deliberately swappable placeholder — replace the inner spans with an
 * imported SVG once a real asset lands.
 */
export function CentriLogoButton({
  className,
  compact = false,
}: CentriLogoButtonProps = {}) {
  const { t } = useTranslation("openhands");

  return (
    <NavigationLink
      to="/conversations"
      aria-label={t(I18nKey.BRANDING$CENTRI_LOGO)}
      className={cn("flex items-center overflow-visible", className)}
    >
      {compact ? (
        <span
          aria-hidden
          className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-white text-base font-bold leading-none text-black"
        >
          C
        </span>
      ) : (
        <span
          aria-hidden
          className="whitespace-nowrap text-[17px] font-semibold tracking-tight text-white"
        >
          Centri
        </span>
      )}
    </NavigationLink>
  );
}
