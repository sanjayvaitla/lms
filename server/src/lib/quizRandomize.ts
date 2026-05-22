/** Fisher–Yates shuffle */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandomIds(pool: string[], count: number): string[] {
  if (count >= pool.length) return shuffle(pool);
  return shuffle(pool).slice(0, count);
}

export function shuffleMcqOptions(options: string[]): { shuffled: string[]; correctIndex: number; correctLabel: string } {
  const correctLabel = options[0];
  const shuffled = shuffle(options);
  const correctIndex = shuffled.indexOf(correctLabel);
  return { shuffled, correctIndex, correctLabel };
}
