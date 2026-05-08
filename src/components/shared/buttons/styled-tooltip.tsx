import React, { ReactNode } from "react";
import { cn } from "#/utils/utils";

const TOOLTIP_POSITION_CLASSES = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
} as const;

const TOOLTIP_ARROW_CLASSES = {
  top: "left-1/2 top-full -translate-x-1/2 -translate-y-1/2",
  right: "right-full top-1/2 translate-x-1/2 -translate-y-1/2",
  bottom: "bottom-full left-1/2 -translate-x-1/2 translate-y-1/2",
  left: "left-full top-1/2 -translate-x-1/2 -translate-y-1/2",
} as const;

type TooltipPlacement = keyof typeof TOOLTIP_POSITION_CLASSES;

export interface StyledTooltipProps {
  children: ReactNode;
  content: string | ReactNode;
  tooltipClassName?: React.HTMLAttributes<HTMLDivElement>["className"];
  placement?: TooltipPlacement;
  showArrow?: boolean;
  closeDelay?: number;
}

export function StyledTooltip({
  children,
  content,
  tooltipClassName,
  placement = "right",
  showArrow = false,
  closeDelay = 100,
}: StyledTooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openTooltip = React.useCallback(() => {
    clearCloseTimeout();
    setIsOpen(true);
  }, [clearCloseTimeout]);

  const closeTooltip = React.useCallback(() => {
    clearCloseTimeout();

    if (closeDelay <= 0) {
      setIsOpen(false);
      return;
    }

    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, closeDelay);
  }, [clearCloseTimeout, closeDelay]);

  React.useEffect(
    () => () => {
      clearCloseTimeout();
    },
    [clearCloseTimeout],
  );

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
      onFocus={openTooltip}
      onBlur={closeTooltip}
    >
      <span className="inline-flex">{children}</span>
      {isOpen ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 max-w-64 rounded-md px-2 py-1 text-xs shadow-lg",
            "bg-white text-black",
            TOOLTIP_POSITION_CLASSES[placement],
            tooltipClassName,
          )}
        >
          {content}
          {showArrow ? (
            <span
              className={cn(
                "absolute h-2 w-2 rotate-45 bg-white",
                TOOLTIP_ARROW_CLASSES[placement],
              )}
            />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
