// Plain-text task search: case- and accent-insensitive, every word must match.

const MARKS = new RegExp("\\p{M}", "gu");

// Case- and accent-insensitive text for search: "Café" → "cafe".
export function fold(text: string) {
  return text.normalize("NFD").replace(MARKS, "").toLowerCase();
}

export function searchTerms(query: string) {
  return fold(query).split(/\s+/).filter(Boolean);
}

// Every term must appear in the title or the description.
export function matchesSearch(
  task: { title: string; description: string },
  terms: string[],
) {
  const text = fold(`${task.title}\n${task.description}`);
  return terms.every((term) => text.includes(term));
}

// Ranges [start, end) in the original text, merged, for highlighting.
export function matchRanges(text: string, terms: string[]): [number, number][] {
  if (!terms.length) return [];
  let folded = "";
  const map: number[] = []; // folded index → original index
  let index = 0;
  for (const char of text) {
    const part = fold(char);
    for (let i = 0; i < part.length; i++) map.push(index);
    folded += part;
    index += char.length;
  }
  map.push(index);
  const hits: [number, number][] = [];
  for (const term of terms)
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length))
      hits.push([map[at], map[at + term.length]]);
  hits.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of hits) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
