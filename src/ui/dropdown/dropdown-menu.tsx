/* eslint-disable react/jsx-props-no-spreading */
import React from "react";
import { cn } from "#/utils/utils";
import { DropdownOption } from "./types";

interface DropdownMenuProps {
  isOpen: boolean;
  filteredOptions: DropdownOption[];
  selectedItem: DropdownOption | null;
  emptyMessage: string;
  getMenuProps: (props?: object) => object;
  getItemProps: (props: {
    item: DropdownOption;
    index: number;
    className?: string;
  }) => object;
  footer?: React.ReactNode;
  openUpward?: boolean;
}

export function DropdownMenu({
  isOpen,
  filteredOptions,
  selectedItem,
  emptyMessage,
  getMenuProps,
  getItemProps,
  footer,
  openUpward = false,
}: DropdownMenuProps) {
  return (
    <div
      className={cn(
        "absolute z-10 w-full",
        openUpward ? "bottom-full mb-1" : "mt-1",
        "bg-[#1F1F1F] border border-[#242424] rounded-lg",
        "max-h-60 overflow-auto",
        !isOpen && "hidden",
      )}
    >
      <ul {...getMenuProps({ className: "p-1" })}>
        {isOpen && filteredOptions.length === 0 && (
          <li className="px-2 py-2 text-sm text-gray-400 italic">
            {emptyMessage}
          </li>
        )}
        {isOpen &&
          filteredOptions.map((option, index) => {
            const isSelected = selectedItem?.value === option.value;
            return (
              <li
                key={option.value}
                {...getItemProps({
                  item: option,
                  index,
                  className: cn(
                    "px-2 py-2 cursor-pointer text-sm rounded-md",
                    "flex items-center gap-3 focus:outline-none font-normal",
                    isSelected
                      ? "bg-[#C9B974] text-black"
                      : "text-white hover:bg-[#5C5D62]",
                  ),
                })}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">{option.label}</span>
                  {option.description ? (
                    <span
                      className={cn(
                        "truncate text-xs",
                        isSelected ? "text-black/70" : "text-[#A3A3A3]",
                      )}
                    >
                      {option.description}
                    </span>
                  ) : null}
                </div>
                {option.rightLabel ? (
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      isSelected ? "text-black/70" : "text-[#A3A3A3]",
                    )}
                  >
                    {option.rightLabel}
                  </span>
                ) : null}
              </li>
            );
          })}
      </ul>
      {isOpen && footer ? (
        <div className="border-t border-[#242424] p-1">{footer}</div>
      ) : null}
    </div>
  );
}
