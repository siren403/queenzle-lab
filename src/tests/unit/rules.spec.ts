import { describe, expect, it } from 'vitest';
import { getConflictsForQueenPlacement } from '$lib/core/rules';
import type { PuzzleSpec } from '$lib/core/types';

const puzzle: PuzzleSpec = {
	id: 'rules-fixture',
	seed: 1,
	size: 4,
	regions: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
	solution: [1, 7, 8, 14],
	source: 'catalog',
	antiPatternReady: true
};

describe('queen placement rules', () => {
	it('detects row and adjacency conflicts', () => {
		const cells = [
			'queen',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty',
			'empty'
		] as const;
		const feedback = getConflictsForQueenPlacement(puzzle, [...cells], 1);

		expect(feedback).not.toBeNull();
		expect(feedback?.cells).toContain(0);
		expect(feedback?.cells).toContain(1);
	});
});
