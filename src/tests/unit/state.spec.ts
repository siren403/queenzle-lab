import { describe, expect, it } from 'vitest';
import { createSessionState, applyCommand } from '$lib/core/state';
import type { FeatureFlags, PuzzleSpec } from '$lib/core/types';

const flags: FeatureFlags = {
	dragMarking: true,
	antiPatternFilter: true,
	blockIllegalQueenPlacement: true
};

const puzzle: PuzzleSpec = {
	id: 'state-fixture',
	seed: 1,
	size: 4,
	regions: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
	solution: [1, 7, 8, 14],
	source: 'catalog',
	antiPatternReady: true
};

describe('session state', () => {
	it('tracks history, reset, and snapshot restore', () => {
		let session = createSessionState(puzzle, flags);
		session = applyCommand(session, { type: 'toggleX', index: 0 });
		session = applyCommand(session, { type: 'dragCells', indices: [1, 2] });

		expect(session.cells[0]).toBe('x');
		expect(session.cells[2]).toBe('x');
		expect(session.history.past.length).toBe(2);

		session = applyCommand(session, { type: 'saveSnapshot' });
		session = applyCommand(session, { type: 'resetBoard' });
		expect(session.cells.every((mark) => mark === 'empty')).toBe(true);

		session = applyCommand(session, { type: 'restoreSnapshot' });
		expect(session.cells[0]).toBe('x');
		expect(session.cells[2]).toBe('x');

		session = applyCommand(session, { type: 'undo' });
		expect(session.cells.every((mark) => mark === 'empty')).toBe(true);
	});
});
