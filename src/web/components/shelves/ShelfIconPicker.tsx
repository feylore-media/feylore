import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SHELF_ICON_IDS } from "@shared/shelf-icons";
import { ShelfIcon } from "../icons/ShelfIcon";
import { CompactMenuAnchor } from "../ui/CompactMenuAnchor";
import styles from "./shelf-editor.module.css";

interface ShelfIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

interface PopoutLayout {
  top: number;
  left: number;
  portalContainer: HTMLElement | null;
}

function getDialogPortalContainer(anchor: HTMLElement): HTMLElement {
  return anchor.closest<HTMLElement>('[role="dialog"]') ?? document.body;
}

function useAnchoredPopout(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [layout, setLayout] = useState<PopoutLayout>({
    top: 0,
    left: 0,
    portalContainer: null,
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const portalContainer = getDialogPortalContainer(anchor);
    const anchorRect = anchor.getBoundingClientRect();

    if (portalContainer === document.body) {
      setLayout({
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
        portalContainer,
      });
      return;
    }

    const containerRect = portalContainer.getBoundingClientRect();
    setLayout({
      top: anchorRect.bottom - containerRect.top + 4,
      left: anchorRect.left - containerRect.left,
      portalContainer,
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return layout;
}

export function ShelfIconPicker({ value, onChange }: ShelfIconPickerProps) {
  const { t } = useTranslation("shelves");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const layout = useAnchoredPopout(open, anchorRef);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function selectIcon(iconId: string) {
    onChange(iconId);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <CompactMenuAnchor ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.iconTrigger}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("chooseIcon")}
        onClick={() => setOpen((o) => !o)}
      >
        <ShelfIcon iconId={value} identity size="md" />
      </button>
      {open &&
        layout.portalContainer &&
        createPortal(
          <div
            ref={panelRef}
            className={`${styles.iconPopout} ${
              layout.portalContainer.getAttribute("role") === "dialog"
                ? styles.iconPopoutInDialog
                : ""
            }`}
            style={{ top: layout.top, left: layout.left }}
            role="listbox"
            aria-label={t("icon")}
          >
            <div className={styles.iconPopoutGrid}>
              {SHELF_ICON_IDS.map((iconId) => (
                <button
                  key={iconId}
                  type="button"
                  role="option"
                  aria-selected={value === iconId}
                  aria-label={t(`iconLabels.${iconId}`)}
                  className={`${styles.iconPopoutOption} ${value === iconId ? styles.iconPopoutOptionSelected : ""}`}
                  onClick={() => selectIcon(iconId)}
                >
                  <ShelfIcon
                    iconId={iconId}
                    selected={value === iconId}
                    size="sm"
                  />
                </button>
              ))}
            </div>
          </div>,
          layout.portalContainer,
        )}
    </CompactMenuAnchor>
  );
}
