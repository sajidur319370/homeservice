import { useState } from "react";
import { api, errorMessage } from "../api";
import { WEEKDAYS } from "../constants";
import { hhmmToMinutes, minutesToHHMM } from "../format";
import type { DayHours } from "../types";
import { useNotify } from "./Notify";
import { ErrorText } from "./small";

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
  const [error, setError] = useState<string | null>(null);
  const notify = useNotify();

  const change = (i: number, patch: Partial<Row>) =>
    setRows((all) => all.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function save() {
    setError(null);
    const days = rows.flatMap((row, weekday) =>
      row.on ? [{ weekday, startMin: hhmmToMinutes(row.start), endMin: hhmmToMinutes(row.end) }] : [],
    );
    try {
      await api("/providers/me/availability", { method: "PUT", body: { days } });
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
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-primary" onClick={() => void save()}>
        Save hours
      </button>
    </div>
  );
}
