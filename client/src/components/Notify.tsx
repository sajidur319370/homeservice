// Notifications at the top of the screen: green "it worked", or red when something can't be done.
// They disappear after 3 seconds.
// Usage: const notify = useNotify();  notify("Booking cancelled");  notify("Can't remove …", "error");
import { createContext, useContext, useState, type ReactNode } from "react";

const SHOW_MS = 3000;

type Tone = "ok" | "error";
type Note = { id: number; text: string; tone: Tone };

const NotifyContext = createContext<((text: string, tone?: Tone) => void) | null>(null);

let nextId = 1;

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);

  const dismiss = (id: number) => setNotes((all) => all.filter((n) => n.id !== id));

  function notify(text: string, tone: Tone = "ok") {
    const id = nextId++;
    setNotes((all) => [...all, { id, text, tone }]);
    setTimeout(() => dismiss(id), SHOW_MS);
  }

  return (
    <NotifyContext value={notify}>
      {children}
      {/* aria-live: screen readers read each new note without moving the focus */}
      <div className="notify-stack" role="status" aria-live="polite">
        {notes.map((n) => (
          <button key={n.id} className={`notify notify-${n.tone}`} onClick={() => dismiss(n.id)} title="Dismiss">
            {n.tone === "ok" ? "✓" : "✕"} {n.text}
          </button>
        ))}
      </div>
    </NotifyContext>
  );
}

export function useNotify() {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error("useNotify must be used inside <NotifyProvider>");
  return notify;
}
