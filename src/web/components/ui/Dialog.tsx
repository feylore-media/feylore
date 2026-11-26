import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Icon } from "../icons/Icon";
import { UiCloseIcon } from "../icons/ui-icons";
import styles from "./dialog.module.css";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  children,
  size = "default",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  size?: "default" | "wide";
  "aria-label"?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        className={size === "wide" ? styles.contentWide : styles.content}
        aria-label={ariaLabel}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.headerMain}>
        {icon && <span className={styles.headerIcon} aria-hidden>{icon}</span>}
        <div className={styles.headerText}>{children}</div>
      </div>
      <DialogPrimitive.Close
        type="button"
        className={styles.close}
        aria-label="Close"
      >
        <Icon icon={UiCloseIcon} size="sm" />
      </DialogPrimitive.Close>
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Title className={styles.title}>
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Description className={styles.description}>
      {children}
    </DialogPrimitive.Description>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}
