/** User settings, remembered between sessions (best effort). */
export interface Settings {
  /** Freeze the game while an inventory screen is open (the original did not). */
  pauseInInventory: boolean;
  /** Dungeon look: a theme id from render/themes. */
  theme: string;
}

const KEY = 'crawler.settings';
const DEFAULTS: Settings = { pauseInInventory: false, theme: 'granite' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // storage unavailable: use defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
