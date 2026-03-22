export type ProfileColorId = 'orange' | 'green' | 'teal' | 'gold';

export type ProfileTheme = {
  colorId: ProfileColorId;
  text: string;
  softText: string;
  chip: string;
  button: string;
  trainButton: string;
  softSurface: string;
  rgb: string;
};

const STORAGE_KEY = 'gym:profile-colors';

const PROFILE_DEFAULTS: Record<string, ProfileColorId> = {
  cecilia: 'orange',
  gabriel: 'green'
};

const PROFILE_PRESETS: Record<ProfileColorId, Omit<ProfileTheme, 'colorId'>> = {
  orange: {
    text: 'text-[#D15B33]',
    softText: 'text-[#C96B46]',
    chip: 'border-[#E2A088] bg-[#FBEEE8] text-[#D15B33]',
    button: 'bg-[#D15B33] text-white',
    trainButton: 'bg-[#D15B33] text-white',
    softSurface: 'bg-[#FBEEE8]',
    rgb: '209 91 51'
  },
  green: {
    text: 'text-[#6F8A5A]',
    softText: 'text-[#6F8A5A]',
    chip: 'border-[#9FBC83] bg-[#EEF5E6] text-[#6F8A5A]',
    button: 'bg-[#7E9D67] text-white',
    trainButton: 'bg-[#7E9D67] text-white',
    softSurface: 'bg-[#EEF5E6]',
    rgb: '111 140 90'
  },
  teal: {
    text: 'text-[#5C8E86]',
    softText: 'text-[#5C8E86]',
    chip: 'border-[#93BDB6] bg-[#E8F1EF] text-[#5C8E86]',
    button: 'bg-[#7EB6AE] text-white',
    trainButton: 'bg-[#7EB6AE] text-white',
    softSurface: 'bg-[#E8F1EF]',
    rgb: '126 182 174'
  },
  gold: {
    text: 'text-[#B4822E]',
    softText: 'text-[#B4822E]',
    chip: 'border-[#E4C36A] bg-[#FAF2D8] text-[#B4822E]',
    button: 'bg-[#E6BA62] text-[#4F4426]',
    trainButton: 'bg-[#E6BA62] text-[#4F4426]',
    softSurface: 'bg-[#FAF2D8]',
    rgb: '230 186 98'
  }
};

function readStoredProfileColors(): Record<string, ProfileColorId> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProfileColorId>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeStoredProfileColors(map: Record<string, ProfileColorId>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getProfileColorOptions(): Array<{ id: ProfileColorId; label: string; hex: string }> {
  return [
    { id: 'orange', label: 'Terracota', hex: '#D15B33' },
    { id: 'green', label: 'Salvia', hex: '#7E9D67' },
    { id: 'teal', label: 'Verde agua', hex: '#7EB6AE' },
    { id: 'gold', label: 'Miel', hex: '#E6BA62' }
  ];
}

export function resolveProfileColorId(profileId: string): ProfileColorId {
  const stored = readStoredProfileColors();
  return stored[profileId] ?? PROFILE_DEFAULTS[profileId] ?? 'orange';
}

export function saveProfileColor(profileId: string, colorId: ProfileColorId): void {
  const stored = readStoredProfileColors();
  stored[profileId] = colorId;
  writeStoredProfileColors(stored);
}

export function removeProfileColor(profileId: string): void {
  const stored = readStoredProfileColors();
  if (!(profileId in stored)) return;
  delete stored[profileId];
  writeStoredProfileColors(stored);
}

export function resolveProfileAccentRgb(profileId: string): string {
  const colorId = resolveProfileColorId(profileId);
  return PROFILE_PRESETS[colorId].rgb;
}

export function applyProfileAccent(profileId: string): void {
  if (typeof window === 'undefined') return;
  const rgb = resolveProfileAccentRgb(profileId);
  const root = window.document.documentElement;
  root.style.setProperty('--profile-accent-rgb', rgb);
  root.style.setProperty('--profile-accent', `rgb(${rgb})`);
}

export function getProfileTheme(profileId: string): ProfileTheme {
  const colorId = resolveProfileColorId(profileId);
  return {
    colorId,
    ...PROFILE_PRESETS[colorId]
  };
}
