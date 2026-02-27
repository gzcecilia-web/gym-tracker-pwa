export type ProfileTheme = {
  text: string;
  softText: string;
  chip: string;
  button: string;
  trainButton: string;
  softSurface: string;
};

const PROFILE_ACCENT_RGB: Record<string, string> = {
  cecilia: '180 106 78',
  gabriel: '67 97 199'
};

export function resolveProfileAccentRgb(profileId: string): string {
  return PROFILE_ACCENT_RGB[profileId] ?? PROFILE_ACCENT_RGB.cecilia;
}

export function applyProfileAccent(profileId: string): void {
  if (typeof window === 'undefined') return;
  const rgb = resolveProfileAccentRgb(profileId);
  const root = window.document.documentElement;
  root.style.setProperty('--accent-rgb', rgb);
  root.style.setProperty('--accent', `rgb(${rgb})`);
}

export function getProfileTheme(profileId: string): ProfileTheme {
  const isGabriel = profileId === 'gabriel';
  return {
    text: isGabriel ? 'text-blue-600' : 'text-accent',
    softText: isGabriel ? 'text-blue-600' : 'text-accent',
    chip: isGabriel ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-accent bg-accent/10 text-accent',
    button: isGabriel ? 'bg-blue-600 text-white' : 'bg-accent text-white',
    trainButton: isGabriel ? 'bg-blue-600 text-white' : 'bg-accent text-white',
    softSurface: isGabriel ? 'bg-blue-50' : 'bg-accent/10'
  };
}
