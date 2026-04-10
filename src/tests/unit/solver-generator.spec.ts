import { describe, expect, it } from 'vitest';
import { getCatalogPuzzle } from '$lib/core/catalog';
import { generatePuzzle } from '$lib/core/generator';
import { resolvePuzzle } from '$lib/core/state';
import { countSolutions, passesAntiPatternFilter } from '$lib/core/solver';

describe('catalog and generator', () => {
	it('realizes a unique 5x5 catalog puzzle', () => {
		const puzzle = getCatalogPuzzle(5);
		const result = countSolutions(puzzle, { limit: 2 });

		expect(result.count).toBe(1);
		expect(passesAntiPatternFilter(puzzle)).toBe(true);
	});

	it('realizes a unique catalog puzzle', () => {
		const puzzle = getCatalogPuzzle(6);
		const result = countSolutions(puzzle, { limit: 2 });

		expect(result.count).toBe(1);
		expect(passesAntiPatternFilter(puzzle)).toBe(true);
	});

	it('generates a unique puzzle inside the time budget', () => {
		const puzzle = generatePuzzle({
			seed: 12031,
			size: 6,
			antiPatternFilter: false,
			timeBudgetMs: 500,
			source: 'generator'
		});

		expect(puzzle).not.toBeNull();
		expect(countSolutions(puzzle!, { limit: 2 }).count).toBe(1);
	});

	it('uses the generator for non-catalog seeds before falling back by size', () => {
		const puzzle = resolvePuzzle({
			size: 7,
			seed: 99999,
			antiPatternFilter: true
		});

		expect(puzzle.source).toBe('generator');
		expect(puzzle.seed).toBe(99999);
		expect(new Set(puzzle.regions).size).toBe(7);
	});
});
