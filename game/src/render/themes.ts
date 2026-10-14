import type { TunnelOptions } from './organic';
import type { SurfaceStyle } from './organic';

/** A look for the dungeon: the shape of the tunnels and the surface they are made of. */
export interface Theme {
  id: string;
  name: string;
  tunnel: TunnelOptions;
  surface: SurfaceStyle;
  doorColor: number;
}

const BASE = { resolution: 10, seed: 7 };

export const THEMES: Theme[] = [
  {
    id: 'granite',
    name: 'Granite tunnels',
    tunnel: { ...BASE, roundness: 0.24, lump: 0.2, bump: 0.08, widen: 0.24 },
    surface: { surface: 'granite', roughness: 0.82, bump: 14, texScale: 0.9, heightScale: 0.55 },
    doorColor: 0x4a3a2a,
  },
  {
    id: 'blocks',
    name: 'Stone blocks (straight walls)',
    tunnel: { ...BASE, roundness: 0.05, lump: 0, bump: 0, widen: 0 },
    surface: { surface: 'blocks', roughness: 0.92, bump: 10, texScale: 0.5, heightScale: 0.5 },
    doorColor: 0x6b4a2b,
  },
  {
    id: 'earth',
    name: 'Earth tunnels',
    tunnel: { ...BASE, roundness: 0.3, lump: 0.26, bump: 0.1, widen: 0.26 },
    surface: { surface: 'earth', roughness: 1, bump: 9, texScale: 0.8, heightScale: 0.6 },
    doorColor: 0x5a4028,
  },
  {
    id: 'cave',
    name: 'Slate cave',
    tunnel: { ...BASE, roundness: 0.36, lump: 0.32, bump: 0.12, widen: 0.3 },
    surface: { surface: 'slate', roughness: 0.55, bump: 12, texScale: 0.7, heightScale: 0.5 },
    doorColor: 0x3a3a46,
  },
];

export const DEFAULT_THEME = 'granite';

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
