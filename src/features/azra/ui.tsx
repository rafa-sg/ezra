"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ImageOff, X } from "lucide-react";
import { useLanguage } from "./i18n";
export function AssetPlaceholder({ logo = false }: { logo?: boolean }) {
  const { t } = useLanguage();
  return (
    <div
      className={logo ? "az-logo-placeholder" : "az-asset-placeholder"}
      role="img"
      aria-label={t(logo ? "logoPending" : "assetPending")}
      title={t(logo ? "logoPending" : "assetPending")}
    >
      <ImageOff size={logo ? 22 : 56} />
      {!logo && <span>{t("assetPending")}</span>}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  children,
  label,
  className = "",
  dismissOnBackdrop = false,
  hideClose = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  dismissOnBackdrop?: boolean;
  hideClose?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const { t } = useLanguage();
  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  // Only user-initiated closes (Escape, backdrop, buttons) notify the parent;
  // closing because `open` became false must not re-trigger it.
  const handleClose = () => {
    if (openRef.current) onClose();
  };
  const closeRef = useRef(handleClose);
  useEffect(() => {
    closeRef.current = handleClose;
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !dismissOnBackdrop) return;
    // Pointer equivalent of Escape: a click on the backdrop targets the dialog
    // element itself, outside its box.
    function onClick(event: MouseEvent) {
      if (!dialog || event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!inside) closeRef.current();
    }
    dialog.addEventListener("click", onClick);
    return () => dialog.removeEventListener("click", onClick);
  }, [dismissOnBackdrop]);
  return (
    <dialog
      className={`az-dialog ${className}`}
      ref={ref}
      aria-label={label}
      onCancel={handleClose}
      onClose={handleClose}
    >
      {!hideClose && (
        <button className="az-dialog-close az-icon" aria-label={t("close")} onClick={handleClose}>
          <X size={22} />
        </button>
      )}
      {children}
    </dialog>
  );
}
