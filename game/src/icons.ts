import type { Item } from './sim/items';

const wrap = (inner: string): string =>
  `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  fist: wrap('<path d="M9 14v-3a2 2 0 0 1 4 0v-2a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v1a2 2 0 0 1 3 2v6c0 4-3 7-7 7h-2c-3 0-5-2-7-5l-2-4a2 2 0 0 1 3-2l1 1"/>'),
  sword: wrap('<path d="M26 6l-2 8-11 11-3-3L21 11l5-5z"/><path d="M8 20l-3 3 4 4 3-3M9 25l-3-3"/>'),
  dagger: wrap('<path d="M24 7l-2 6-8 8-3-3 8-8 5-3z"/><path d="M10 18l-4 4 3 3 4-4M7 25l-2 2"/>'),
  club: wrap('<path d="M24 5c3 1 4 5 1 9l-4 4-5-5 4-4c2-3 3-4 4-4z"/><path d="M16 17L6 27"/>'),
  greatsword: wrap('<path d="M27 5l-2 9L11 28l-4-4L21 10l6-5z"/><path d="M5 22l5 5M4 28l3-3"/><path d="M12 20l4 4"/>'),
  shield: wrap('<path d="M16 4l9 3v8c0 6-4 10-9 13C11 25 7 21 7 15V7l9-3z"/><path d="M16 9v14M11 14h10"/>'),
  armour: wrap('<path d="M11 5l-6 4 3 5 3-1v14h10V13l3 1 3-5-6-4c-1 2-2.5 3-5 3s-4-1-5-3z"/>'),
  boots: wrap('<path d="M10 5h7v10l8 4v6H8V5h2z"/><path d="M8 21h17"/>'),
  item: wrap('<rect x="8" y="8" width="16" height="16" rx="3"/>'),
  helmet: wrap('<path d="M7 20v-5a9 9 0 0 1 18 0v5l-3 3H10l-3-3z"/><path d="M12 20v-4h8v4"/>'),
  legs: wrap('<path d="M9 5h14l-1 22h-5l-1-14-1 14h-5L9 5z"/>'),
  pendant: wrap('<path d="M8 5c0 8 4 10 8 10s8-2 8-10"/><circle cx="16" cy="21" r="4"/><path d="M16 15v2"/>'),
  bread: wrap('<path d="M5 18c0-5 5-8 11-8s11 3 11 8c0 3-2 4-4 4H9c-2 0-4-1-4-4z"/><path d="M12 13l2 4M17 12l2 4M22 14l1 3"/>'),
  apple: wrap('<path d="M16 10c-3-3-9-1-9 5 0 6 4 11 9 11s9-5 9-11c0-6-6-8-9-5z"/><path d="M16 10c0-3 1-5 3-6"/>'),
  cheese: wrap('<path d="M4 20l24-10v14H4v-4z"/><circle cx="12" cy="21" r="1.5"/><circle cx="20" cy="18" r="1.5"/>'),
  water: wrap('<path d="M13 4h6v5l4 4v13H9V13l4-4V4z"/><path d="M9 18h14"/>'),
  flask: wrap('<path d="M13 4h6v6l5 14a2 2 0 0 1-2 3H10a2 2 0 0 1-2-3l5-14V4z"/><path d="M12 4h8"/>'),
  orb: wrap('<circle cx="16" cy="16" r="9"/><path d="M12 12a6 6 0 0 1 6-2"/>'),
};

const POTION_COLORS: Record<string, string> = {
  strength: '#d85a3a', shield: '#5a8ad8', stamina: '#e0c43a', wisdom: '#a070d8', vitality: '#5ac86a',
  health: '#e0506a', cure: '#6adbc0', dexterity: '#e08a3a', mana: '#4a7ae8', poison: '#7ab030',
};

function potionIcon(type: string): string {
  const col = POTION_COLORS[type] ?? '#aaa';
  return wrap(`<path d="M13 4h6v6l5 14a2 2 0 0 1-2 3H10a2 2 0 0 1-2-3l5-14V4z"/><path d="M12 4h8"/><path d="M10 21h12l2 4a1 1 0 0 1-1 2H9a1 1 0 0 1-1-2l2-4z" fill="${col}" stroke="${col}"/>`);
}

/** SVG markup for what is held in a hand (null = bare hand). */
export function iconFor(item: Item | null): string {
  if (!item) return ICONS['fist']!;
  switch (item.id) {
    case 'shortSword': return ICONS['sword']!;
    case 'dagger': return ICONS['dagger']!;
    case 'club': return ICONS['club']!;
    case 'greatsword': return ICONS['greatsword']!;
    case 'woodenShield': return ICONS['shield']!;
    case 'leatherJerkin': return ICONS['armour']!;
    case 'leatherBoots': return ICONS['boots']!;
    case 'leatherCap': return ICONS['helmet']!;
    case 'leatherPants': return ICONS['legs']!;
    case 'pendant': return ICONS['pendant']!;
    case 'bread': return ICONS['bread']!;
    case 'apple': return ICONS['apple']!;
    case 'cheese': return ICONS['cheese']!;
    case 'waterFlask': return ICONS['water']!;
    case 'flask': return ICONS['flask']!;
    case 'zokathra': return ICONS['orb']!;
    default:
      if (item.potion) return potionIcon(item.potion.type);
      return ICONS['item']!;
  }
}

/** A data: URL for the item's icon in a fixed colour (for use as a 3D texture). */
export function iconDataUrl(item: Item, color = '#e8d9a8'): string {
  const svg = iconFor(item)
    .replace(/currentColor/g, color)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('width="100%" height="100%"', 'width="64" height="64"');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
