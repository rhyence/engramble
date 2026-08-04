import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS } from './sampleData';
import {
  arrangeRemainingConnectionsTiles,
  buildConnectionsTiles,
  connectionsPointsForCorrectGroup,
  generateRevealClues,
  isCategorySafeGrid,
  isConnectionsEligible,
  isRevealGuessCorrect,
  isRevealEligible,
  revealPointsForCorrectGuess,
  REVEAL_WRONG_GUESS_PENALTY,
  validateStudySetDraft,
} from './game';
import type { StudySet } from '../types';

const baseSet: StudySet = {
  id: 'set-1',
  ownerId: 'user-1',
  name: 'Biology',
  createdAt: '2026-05-25',
  isPublic: false,
  categories: [0, 1, 2, 3].map((idx) => ({
    name: `Category ${idx + 1}`,
    color: CATEGORY_COLORS[idx],
    terms: [0, 1, 2, 3].map((termIdx) => ({
      term: `Term ${idx + 1}-${termIdx + 1}`,
      def: `Definition ${idx + 1}-${termIdx + 1}`,
    })),
  })),
};

describe('Connections rules', () => {
  it('requires four categories with at least four terms each', () => {
    expect(isConnectionsEligible(baseSet)).toBe(true);
    expect(isConnectionsEligible({ ...baseSet, categories: baseSet.categories.slice(0, 3) })).toBe(false);
    expect(
      isConnectionsEligible({
        ...baseSet,
        categories: baseSet.categories.map((cat, idx) =>
          idx === 0 ? { ...cat, terms: cat.terms.slice(0, 3) } : cat,
        ),
      }),
    ).toBe(false);
  });

  it('builds sixteen tiles from four categories', () => {
    const tiles = buildConnectionsTiles(baseSet);

    expect(tiles).toHaveLength(16);
    expect(new Set(tiles.map((tile) => tile.catIdx))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('does not place two terms from the same category in one column', () => {
    const tiles = buildConnectionsTiles(baseSet);

    expect(isCategorySafeGrid(tiles)).toBe(true);
  });

  it('keeps premium-sized classify grids category-safe', () => {
    const largerSet: StudySet = {
      ...baseSet,
      categories: [0, 1, 2, 3, 4, 5].map((idx) => ({
        name: `Category ${idx + 1}`,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
        terms: [0, 1, 2, 3].map((termIdx) => ({
          term: `Term ${idx + 1}-${termIdx + 1}`,
          def: `Definition ${idx + 1}-${termIdx + 1}`,
        })),
      })),
    };

    const tiles = buildConnectionsTiles(largerSet, 6);

    expect(tiles).toHaveLength(24);
    expect(isCategorySafeGrid(tiles)).toBe(true);
  });

  it('keeps remaining columns category-safe after one group is solved', () => {
    const tiles = buildConnectionsTiles(baseSet);
    const arranged = arrangeRemainingConnectionsTiles(tiles, [0]);

    expect(arranged).toHaveLength(12);
    expect(isCategorySafeGrid(arranged)).toBe(true);
  });

  it('keeps remaining columns category-safe after multiple groups are solved', () => {
    const tiles = buildConnectionsTiles(baseSet);
    const arranged = arrangeRemainingConnectionsTiles(tiles, [0, 1]);

    expect(arranged).toHaveLength(8);
    expect(isCategorySafeGrid(arranged)).toBe(true);
  });

  it('detects unsafe grids with repeated categories in a column', () => {
    const unsafe = [0, 1, 2, 3].flatMap((termIdx) =>
      baseSet.categories.map((category, catIdx) => ({
        ...category.terms[termIdx],
        id: `${catIdx}:${termIdx}`,
        catIdx,
        catName: category.name,
        color: category.color,
      })),
    );
    const sameCategoryColumn = [0, 1, 2, 3].flatMap((catIdx) =>
      baseSet.categories[catIdx].terms.map((term) => ({
        ...term,
        id: `${catIdx}:${term.term}`,
        catIdx,
        catName: baseSet.categories[catIdx].name,
        color: baseSet.categories[catIdx].color,
      })),
    );

    expect(isCategorySafeGrid(unsafe)).toBe(false);
    expect(isCategorySafeGrid(sameCategoryColumn)).toBe(true);
  });

  it('scores each correct group based on mistakes already made', () => {
    expect(connectionsPointsForCorrectGroup(0)).toBe(100);
    expect(connectionsPointsForCorrectGroup(1)).toBe(80);
    expect(connectionsPointsForCorrectGroup(4)).toBe(20);
    expect(connectionsPointsForCorrectGroup(9)).toBe(10);
  });
});

describe('Reveal rules', () => {
  it('requires at least one term', () => {
    expect(isRevealEligible(baseSet)).toBe(true);
    expect(isRevealEligible({ ...baseSet, categories: [{ ...baseSet.categories[0], terms: [] }] })).toBe(false);
  });

  it('generates definition, letter-count, spelling, and full-definition clues', () => {
    const clues = generateRevealClues('Mitochondria', 'Double membrane organelle that produces ATP');

    expect(clues).toHaveLength(4);
    expect(clues[0]).toBe('Double membrane organelle that produces ATP');
    expect(clues[1]).toBe('This term has 12 letters.');
    expect(clues[2]).toBe('Starts with "M" and ends with "a".');
    expect(clues[3]).toBe('Double membrane organelle that produces ATP');
  });

  it('uses a readable word-aware preview for longer definitions', () => {
    const clues = generateRevealClues(
      'Mitochondria',
      'Double membrane organelle that produces ATP through cellular respiration and supports energy needs across the cell',
    );

    expect(clues[0]).toContain('Double membrane organelle');
    expect(clues[0]).not.toContain('resp...');
    expect(clues[1]).toBe('This term has 12 letters.');
    expect(clues[2]).toBe('Starts with "M" and ends with "a".');
    expect(clues[3]).toContain('supports energy needs across the cell');
  });

  it('accepts exact and substring guesses', () => {
    expect(isRevealGuessCorrect('action potential', 'Action Potential')).toBe(true);
    expect(isRevealGuessCorrect('potential', 'Action Potential')).toBe(true);
    expect(isRevealGuessCorrect('axon', 'Action Potential')).toBe(false);
  });

  it('deducts points for wrong guesses without going below zero', () => {
    expect(revealPointsForCorrectGuess(1, 0)).toBe(100);
    expect(revealPointsForCorrectGuess(1, 2)).toBe(100 - REVEAL_WRONG_GUESS_PENALTY * 2);
    expect(revealPointsForCorrectGuess(4, 9)).toBe(0);
  });
});

describe('study set validation', () => {
  it('requires a name, two categories, and four complete terms per category', () => {
    expect(validateStudySetDraft(baseSet.name, baseSet.categories).ok).toBe(true);
    expect(validateStudySetDraft('', baseSet.categories).ok).toBe(false);
    expect(validateStudySetDraft(baseSet.name, baseSet.categories.slice(0, 1)).ok).toBe(false);
    expect(
      validateStudySetDraft(baseSet.name, [
        { ...baseSet.categories[0], terms: baseSet.categories[0].terms.slice(0, 3) },
        baseSet.categories[1],
      ]).ok,
    ).toBe(false);
  });
});
