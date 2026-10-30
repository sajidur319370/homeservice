// "Are you sure?" as a toast in the middle of the screen, instead of the browser's window.confirm.
// Usage: const confirm = useConfirm();  if (await confirm({ message, yes: "Yes, cancel" })) { … }
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Ask = { message: string; yes?: string; no?: string };
type Open = Ask & { answer: (ok: boolean) => void };

const ConfirmContext = createContext<((ask: Ask) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const noButton = useRef<HTMLButtonElement>(null);

  function confirm(ask: Ask) {
    return new Promise<boolean>((resolve) => setOpen({ ...ask, answer: resolve }));
  }

  function close(ok: boolean) {
    open?.answer(ok);
    setOpen(null);
  }

  // Esc = "No". The safe answer has the focus, so a stray Enter doesn't delete anything.
  useEffect(() => {
    if (!open) return;
    noButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <ConfirmContext value={confirm}>
      {children}
      {open && (
        <div className="toast-backdrop" onClick={() => close(false)}>
          <div className="toast" role="alertdialog" aria-modal="true" aria-labelledby="toast-message" onClick={(e) => e.stopPropagation()}>
            <p id="toast-message" className="toast-message">
              {open.message}
            </p>
            <div className="row center">
              <button ref={noButton} className="btn btn-ghost" onClick={() => close(false)}>
                {open.no ?? "No"}
              </button>
              <button className="btn btn-danger" onClick={() => close(true)}>
                {open.yes ?? "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
