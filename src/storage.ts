import { normalize } from './logic.ts';
import type { GameState, SaveBlob } from './types.ts';

const KEY = 'piotrogrod-save-v1';
const SESSION = 'piotrogrod-session';

export interface SessionInfo {
  code: string;
  role: 'ogrodnik' | 'zielarka';
  host: boolean;
  token: string;
  at: number;
}

export function readSave(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveBlob;
    if (!data?.state || data.state.v !== 1) return null;
    data.state = normalize(data.state);
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): SaveBlob {
  const blob: SaveBlob = { savedAt: Date.now(), rev: state.rev, state };
  localStorage.setItem(KEY, JSON.stringify(blob));
  return blob;
}

export function writeBlob(blob: SaveBlob): void {
  if (!blob?.state) return;
  blob.state = normalize(blob.state);
  localStorage.setItem(KEY, JSON.stringify(blob));
}

export function exportSave(state: GameState): void {
  const blob = JSON.stringify({ savedAt: Date.now(), rev: state.rev, state }, null, 2);
  const file = new Blob([blob], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = 'piotrogrod-zapis.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseImport(text: string): SaveBlob | null {
  try {
    const data = JSON.parse(text) as SaveBlob;
    if (!data?.state || data.state.v !== 1 || !data.state.characters?.ogrodnik || !data.state.characters?.zielarka) {
      return null;
    }
    data.state = normalize(data.state);
    data.rev = data.state.rev;
    data.savedAt = data.savedAt || Date.now();
    return data;
  } catch {
    return null;
  }
}

export function readSession(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

export function writeSession(info: SessionInfo): void {
  sessionStorage.setItem(SESSION, JSON.stringify(info));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION);
}
