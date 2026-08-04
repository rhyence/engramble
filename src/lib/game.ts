import type { Category, StudySet, Term } from '../types';

export const MISTAKE_MAX = 4;
export const POINTS_BY_CLUE = [100, 70, 40, 10];
export const REVEAL_WRONG_GUESS_PENALTY = 10;

export interface ConnectionTile extends Term {
  id: string;
  catIdx: number;
  catName: string;
  color: string;
}

export interface BlackoutRound extends Term {
  catName: string;
  answer: string;
  answers: string[];
  promptParts: string[];
}

export interface ArrangeRound {
  setId: string;
  categoryName: string;
  color: string;
  correctTerms: Term[];
  shuffledTerms: Array<Term & { id: string }>;
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let idx = shuffled.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [shuffled[idx], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[idx]];
  }
  return shuffled;
}

export function isConnectionsEligible(set: StudySet, categoryCount = 4): boolean {
  return set.categories.filter((category) => completeTerms(category).length >= 4).length >= categoryCount;
}

export function isRevealEligible(set: StudySet): boolean {
  return set.categories.some((category) => completeTerms(category).length >= 1);
}

export function isBlackoutEligible(set: StudySet): boolean {
  return getAllTerms(set).some((term) => buildBlackoutRound(term) !== null);
}

export function isArrangeEligible(set: StudySet): boolean {
  return set.categories.some((category) => completeTerms(category).length >= 3);
}

export function completeTerms(category: Category): Term[] {
  return category.terms.filter((term) => term.term.trim() && term.def.trim());
}

export function buildConnectionsTiles(set: StudySet, categoryCount = 4): ConnectionTile[] {
  const selectedCategories = shuffle(set.categories.filter((category) => completeTerms(category).length >= 4)).slice(0, categoryCount);
  const categoryTerms = selectedCategories.map((category, catIdx) =>
    shuffle(completeTerms(category))
      .slice(0, 4)
      .map((term, termIdx) => ({
        ...term,
        id: `${catIdx}:${termIdx}:${term.term.trim().toLowerCase()}`,
        catIdx,
        catName: category.name,
        color: category.color,
      })),
  );
  const orderedTiles = categoryTerms.flat();
  return arrangeRemainingConnectionsTiles(orderedTiles, []);
}

export function arrangeRemainingConnectionsTiles(tiles: ConnectionTile[], solvedCatIdxs: number[]): ConnectionTile[] {
  const solved = new Set(solvedCatIdxs);
  const remainingCatIdxs = [...new Set(tiles.map((tile) => tile.catIdx))].filter((catIdx) => !solved.has(catIdx));
  const termsByCat = new Map(
    remainingCatIdxs.map((catIdx) => [catIdx, shuffle(tiles.filter((tile) => tile.catIdx === catIdx))]),
  );
  const arranged: ConnectionTile[] = [];
  const layout = buildRandomCategoryLayout(remainingCatIdxs, 4);

  for (const catIdx of layout) {
    const terms = termsByCat.get(catIdx);
    const term = terms?.shift();
    if (term) arranged.push(term);
  }

  return arranged;
}

function buildRandomCategoryLayout(catIdxs: number[], termsPerCategory: number, columns = 4, avoidRowRepeats = catIdxs.length >= columns): number[] {
  const totalCells = catIdxs.length * termsPerCategory;
  const remaining = new Map(catIdxs.map((catIdx) => [catIdx, termsPerCategory]));
  const columnCats = Array.from({ length: columns }, () => new Set<number>());
  const rowCats = Array.from({ length: Math.ceil(totalCells / columns) }, () => new Set<number>());
  const layout: number[] = [];

  function fill(cellIndex: number): boolean {
    if (cellIndex >= totalCells) return true;

    const row = Math.floor(cellIndex / columns);
    const col = cellIndex % columns;
    const candidates = shuffle(catIdxs).filter((catIdx) => {
      const count = remaining.get(catIdx) ?? 0;
      if (count <= 0) return false;
      if (columnCats[col].has(catIdx)) return false;
      return !avoidRowRepeats || !rowCats[row].has(catIdx);
    });

    for (const catIdx of candidates) {
      remaining.set(catIdx, (remaining.get(catIdx) ?? 0) - 1);
      columnCats[col].add(catIdx);
      rowCats[row].add(catIdx);
      layout[cellIndex] = catIdx;

      if (fill(cellIndex + 1)) return true;

      remaining.set(catIdx, (remaining.get(catIdx) ?? 0) + 1);
      columnCats[col].delete(catIdx);
      rowCats[row].delete(catIdx);
      layout.pop();
    }

    return false;
  }

  if (fill(0)) return layout;
  if (avoidRowRepeats) return buildRandomCategoryLayout(catIdxs, termsPerCategory, columns, false);

  return shuffle(catIdxs).flatMap((catIdx) => Array.from({ length: termsPerCategory }, () => catIdx));
}

export function isCategorySafeGrid(tiles: ConnectionTile[], columns = 4): boolean {
  const rows = Math.ceil(tiles.length / columns);
  for (let col = 0; col < columns; col += 1) {
    const seen = new Set<number>();
    for (let row = 0; row < rows; row += 1) {
      const tile = tiles[row * columns + col];
      if (!tile) continue;
      if (seen.has(tile.catIdx)) return false;
      seen.add(tile.catIdx);
    }
  }
  return true;
}

export function connectionsPointsForCorrectGroup(mistakes: number): number {
  return Math.max(10, 100 - mistakes * 20);
}

export function revealPointsForCorrectGuess(cluesShown: number, wrongGuesses: number): number {
  const basePoints = POINTS_BY_CLUE[Math.max(0, cluesShown - 1)] ?? POINTS_BY_CLUE[POINTS_BY_CLUE.length - 1];
  return Math.max(0, basePoints - wrongGuesses * REVEAL_WRONG_GUESS_PENALTY);
}

export function generateRevealClues(term: string, def: string): string[] {
  const cleanDef = def.trim();
  const preview = cleanDef.length <= 80 ? cleanDef : `${sliceAtWord(cleanDef, Math.ceil(cleanDef.length * 0.6))}...`;

  if (cleanDef.length <= 80) {
    return [
      preview,
      `This term has ${countLetters(term)} letters.`,
      makeSpellingHint(term),
      cleanDef,
    ];
  }

  return [
    preview,
    `This term has ${countLetters(term)} letters.`,
    makeSpellingHint(term),
    cleanDef,
  ];
}

function countLetters(term: string): number {
  return [...term].filter((char) => /[a-z0-9]/i.test(char)).length;
}

function makeSpellingHint(term: string): string {
  const visibleChars = [...term].filter((char) => /[a-z0-9]/i.test(char));
  const first = visibleChars[0] ?? '?';
  const last = visibleChars[visibleChars.length - 1] ?? '?';
  return `Starts with "${first}" and ends with "${last}".`;
}

function sliceAtWord(text: string, targetLength: number): string {
  if (text.length <= targetLength) return text;
  const nextSpace = text.indexOf(' ', targetLength);
  const previousSpace = text.lastIndexOf(' ', targetLength);
  const cutPoint = nextSpace > -1 && nextSpace - targetLength < 12 ? nextSpace : previousSpace;
  return text.slice(0, cutPoint > 0 ? cutPoint : targetLength).trim();
}

export function isRevealGuessCorrect(guess: string, answer: string): boolean {
  const normalizedGuess = guess.trim().toLowerCase();
  const normalizedAnswer = answer.trim().toLowerCase();
  return normalizedGuess.length > 0 && (normalizedGuess === normalizedAnswer || normalizedAnswer.includes(normalizedGuess));
}

export function getAllTerms(set: StudySet): Array<Term & { catName: string }> {
  return set.categories.flatMap((category) => completeTerms(category).map((term) => ({ ...term, catName: category.name })));
}

export function buildBlackoutRound(term: Term & { catName: string }, blankCount?: number): BlackoutRound | null {
  const def = term.def.trim();
  if (!def) return null;
  const blackout = buildAutoBlackout(def, term.term, blankCount);
  if (!blackout) return null;
  return {
    ...term,
    answer: blackout.answers.join(', '),
    answers: blackout.answers,
    promptParts: blackout.promptParts,
  };
}

export function buildArrangeRound(set: StudySet, termCount = 6): ArrangeRound | null {
  const eligible = set.categories.filter((category) => completeTerms(category).length >= 3);
  if (!eligible.length) return null;
  const ordered = eligible.filter((category) => category.sequenceEnabled);
  const category = shuffle(ordered.length ? ordered : eligible)[0];
  const correctTerms = completeTerms(category).slice(0, termCount);
  return {
    setId: set.id,
    categoryName: category.name,
    color: category.color,
    correctTerms,
    shuffledTerms: shuffle(correctTerms).map((term, index) => ({ ...term, id: `${index}:${term.term.trim().toLowerCase()}` })),
  };
}

function buildAutoBlackout(def: string, term: string, blankCount?: number): { answers: string[]; promptParts: string[] } | null {
  const tokens = Array.from(def.matchAll(/\b[\p{L}\p{N}-]{3,}\b/gu)).map((match, index) => ({
    text: match[0],
    index,
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  if (!tokens.length) return null;

  const cleanTerm = term.trim();
  const termWords = new Set(cleanTerm.toLowerCase().split(/\s+/).filter(Boolean));
  const maxBlanks = Math.max(1, Math.min(3, blankCount ?? (def.length > 140 ? 3 : 2)));
  const candidates = tokens
    .map((token) => {
      const lower = token.text.toLowerCase();
      const isTerm = cleanTerm && (lower === cleanTerm.toLowerCase() || termWords.has(lower));
      const isTechnical = token.text.length >= 6 && !STOP_WORDS.has(lower);
      return { ...token, score: isTerm ? 1000 + token.text.length : isTechnical ? token.text.length : 0 };
    })
    .filter((token) => token.score > 0)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.length >= maxBlanks) break;
    if (selected.some((item) => Math.abs(item.index - candidate.index) <= 1)) continue;
    selected.push(candidate);
  }
  if (!selected.length) return null;

  const ordered = selected.sort((a, b) => a.start - b.start);
  const answers: string[] = [];
  const promptParts: string[] = [];
  let cursor = 0;
  for (const item of ordered) {
    promptParts.push(def.slice(cursor, item.start));
    answers.push(item.text);
    cursor = item.end;
  }
  promptParts.push(def.slice(cursor));
  return { answers, promptParts };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being', 'between', 'during',
  'from', 'into', 'other', 'over', 'such', 'than', 'that', 'their', 'then', 'there', 'these',
  'this', 'through', 'under', 'where', 'which', 'while', 'with', 'within', 'without',
]);

export function validateStudySetDraft(name: string, categories: Category[]): ValidationResult {
  if (!name.trim()) return { ok: false, message: 'Please give your set a name.' };
  if (categories.length < 2) return { ok: false, message: 'Add at least 2 categories.' };

  for (const category of categories) {
    if (!category.name.trim()) return { ok: false, message: 'All categories need a name.' };
    if (completeTerms(category).length < 4) {
      return { ok: false, message: `Category "${category.name || '?'}" needs at least 4 complete terms.` };
    }
  }

  return { ok: true };
}

export function makeShareSlug(): string {
  return Math.random().toString(36).slice(2, 8);
}
