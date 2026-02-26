export type ProfileTheme = {
  text: string;
  softText: string;
  chip: string;
  button: string;
  trainButton: string;
  softSurface: string;
};

export function getProfileTheme(profileId: string): ProfileTheme {
  if (profileId === 'gabriel') {
    return {
      text: 'text-blue-700',
      softText: 'text-blue-700',
      chip: 'border-blue-600 bg-blue-50 text-blue-700',
      button: 'bg-blue-600 text-white',
      trainButton: 'bg-blue-600 text-white',
      softSurface: 'bg-blue-50'
    };
  }

  // Cecilia / default
  return {
    text: 'text-accent',
    softText: 'text-accent',
    chip: 'border-accent bg-accent/10 text-accent',
    button: 'bg-accent text-white',
    trainButton: 'bg-[#9f5a44] text-white',
    softSurface: 'bg-accent/10'
  };
}
