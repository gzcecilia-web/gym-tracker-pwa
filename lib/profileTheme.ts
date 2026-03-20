export type ProfileTheme = {
  text: string;
  softText: string;
  chip: string;
  button: string;
  trainButton: string;
  softSurface: string;
};

const PROFILE_ACCENT_RGB: Record<string, string> = {
  cecilia: '209 91 51',
  gabriel: '111 140 90'
};

export function resolveProfileAccentRgb(profileId: string): string {
  return PROFILE_ACCENT_RGB[profileId] ?? PROFILE_ACCENT_RGB.cecilia;
}

export function applyProfileAccent(profileId: string): void {
  if (typeof window === 'undefined') return;
  const rgb = resolveProfileAccentRgb(profileId);
  const root = window.document.documentElement;
  root.style.setProperty('--profile-accent-rgb', rgb);
  root.style.setProperty('--profile-accent', `rgb(${rgb})`);
}

export function getProfileTheme(profileId: string): ProfileTheme {
  const isGabriel = profileId === 'gabriel';
  return {
    text: isGabriel ? 'text-[#6F8A5A]' : 'text-[#D15B33]',
    softText: isGabriel ? 'text-[#6F8A5A]' : 'text-[#C76946]',
    chip: isGabriel
      ? 'border-[#9FBC83] bg-[#EEF5E6] text-[#6F8A5A]'
      : 'border-[#E2A088] bg-[#FBEEE8] text-[#D15B33]',
    button: isGabriel ? 'bg-[#7E9D67] text-white' : 'bg-[#D15B33] text-white',
    trainButton: isGabriel ? 'bg-[#7E9D67] text-white' : 'bg-[#D15B33] text-white',
    softSurface: isGabriel ? 'bg-[#EEF5E6]' : 'bg-[#FBEEE8]'
  };
}
