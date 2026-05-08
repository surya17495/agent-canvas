import { XIcon } from "#/components/shared/icons";

interface ClearButtonProps {
  onClear: () => void;
}

export function ClearButton({ onClear }: ClearButtonProps) {
  return (
    <button
      type="button"
      data-testid="dropdown-clear"
      onClick={onClear}
      aria-label="Clear selection"
      className="text-white hover:text-gray-300"
    >
      <XIcon size={14} />
    </button>
  );
}
