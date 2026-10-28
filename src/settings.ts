import { getLang, setLang, type Lang } from './i18n.ts';

export type Quality = 'niska' | 'srednia' | 'wysoka';
export type JoySide = 'lewa' | 'prawa';
export type JoySize = 'mala' | 'srednia' | 'duza';

export interface Settings {
  music: number;
  sfx: number;
  vibration: boolean;
  quality: Quality;
  joystickSide: JoySide;
  joystickSize: JoySize;
  lang: Lang;
}

const KEY = 'piotrogrod-settings';

export const DEFAULT_SETTINGS: Settings = {
  music: 0.35,
  sfx: 0.75,
  vibration: true,
  quality: 'srednia',
  joystickSide: 'lewa',
  joystickSize: 'srednia',
  lang: 'pl',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...parsed, lang: 'pl' as Lang };
    setLang(s.lang);
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  s.lang = 'pl';
  setLang('pl');
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function joyRadius(size: JoySize): number {
  if (size === 'mala') return 52;
  if (size === 'duza') return 78;
  return 64;
}

export function currentLang(): Lang {
  return getLang();
}
