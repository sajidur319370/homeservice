import { useState } from "react";
import { api, errorMessage } from "../api";
import { WEEKDAYS } from "../constants";
import { hhmmToMinutes, minutesToHHMM } from "../format";
import type { DayHours } from "../types";
import { useNotify } from "./Notify";
import { ErrorText, FieldError } from "./small";

type Row = { on: boolean; start: string; end: string };

// 7 rows (Sunday … Saturday): a checkbox + two time inputs each.
export default function HoursEditor({ initial }: { initial: DayHours[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    WEEKDAYS.map((_, weekday) => {
      const day = initial.find((d) => d.weekday === weekday);
      return day
        ? { on: true, start: minutesToHHMM(day.startMin), end: minutesToHHMM(day.endMin) }
        : { on: false, start: "09:00", end: "18:00" };
    }),
  );
  // true while the rows on screen are what the server has. A new provider has nothing saved yet.
  const [saved, setSaved] = useState(initial.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({}); // weekday → red message
  const notify = useNotify();

  function change(i: number, patch: Partial<Row>) {
    setRows((all) => all.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setSaved(false);
    setRowErrors((all) => ({ ...all, [i]: "" }));
  }

  async function save() {
    setError(null);
    const problems: Record<number, string> = {};
    rows.forEach((row, weekday) => {
      if (!row.on) return;
      if (!row.start || !row.end) problems[weekday] = "Start and end time are required";
      else if (hhmmToMinutes(row.end) <= hhmmToMinutes(row.start)) problems[weekday] = "End time must be after start time";
    });
    setRowErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const days = rows.flatMap((row, weekday) =>
      row.on ? [{ weekday, startMin: hhmmToMinutes(row.start), endMin: hhmmToMinutes(row.end) }] : [],
    );
    try {
      await api("/providers/me/availability", { method: "PUT", body: { days } });
      setSaved(true);
      notify("Working hours saved");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="card stack">
      <h2>Working hours</h2>
      {rows.map((row, i) => (
        <div key={WEEKDAYS[i]} className="row hours-row">
          <label className="radio">
            <input type="checkbox" checked={row.on} onChange={(e) => change(i, { on: e.target.checked })} />
            {WEEKDAYS[i]}
          </label>
          <input type="time" step={1800} value={row.start} disabled={!row.on} onChange={(e) => change(i, { start: e.target.value })} />
          <span>to</span>
          <input type="time" step={1800} value={row.end} disabled={!row.on} onChange={(e) => change(i, { end: e.target.value })} />
          <FieldError>{rowErrors[i]}</FieldError>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <p className={`save-status ${saved ? "save-status-on" : ""}`}>
        <span className="save-icon" aria-hidden="true">
          {saved && "✓"}
        </span>
        Working hours saved
        {!saved && <span className="sr-only"> (not yet: press Save hours)</span>}
      </p>
      <button className="btn btn-primary" onClick={() => void save()}>
        Save hours
      </button>
    </div>
  );
}
