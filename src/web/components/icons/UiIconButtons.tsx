import { Icon } from "../icons/Icon";
import { UiCloseIcon, UiDragHandleIcon } from "../icons/ui-icons";

export function CloseIconButton({
  className,
  "aria-label": ariaLabel = "Close",
  onClick,
}: {
  className?: string;
  "aria-label"?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <Icon icon={UiCloseIcon} size="sm" />
    </button>
  );
}

export function DragHandleIcon({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <Icon icon={UiDragHandleIcon} size="sm" />
    </span>
  );
}
