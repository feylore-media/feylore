import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../primitives";
import { CompactMenuAnchor } from "./CompactMenuAnchor";
import { CompactMenuPanel } from "./CompactMenuPanel";

export function OverflowMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <CompactMenuAnchor ref={anchorRef}>
      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
      </Button>
      {open && <CompactMenuPanel ref={panelRef}>{children}</CompactMenuPanel>}
    </CompactMenuAnchor>
  );
}

export { CompactMenuDivider } from "./CompactMenuDivider";
export { CompactMenuItem } from "./CompactMenuItem";
