import type { Diagram } from '../domain/types';
import type { CommandRecord } from './commands';

export interface HistoryState { past: CommandRecord[]; future: CommandRecord[]; limit: number }
export function createHistory(limit = 100): HistoryState { return { past: [], future: [], limit }; }
export function pushHistory(history: HistoryState, record: CommandRecord): HistoryState { return { ...history, past: [...history.past, record].slice(-history.limit), future: [] }; }
export function undo(history: HistoryState, current: Diagram): { history: HistoryState; diagram: Diagram } | null {
  const record = history.past.at(-1); if (!record) return null;
  return { diagram: structuredClone(record.before), history: { ...history, past: history.past.slice(0, -1), future: [...history.future, { ...record, after: current }] } };
}
export function redo(history: HistoryState, current: Diagram): { history: HistoryState; diagram: Diagram } | null {
  const record = history.future.at(-1); if (!record) return null;
  return { diagram: structuredClone(record.after), history: { ...history, future: history.future.slice(0, -1), past: [...history.past, { ...record, before: current }].slice(-history.limit) } };
}
