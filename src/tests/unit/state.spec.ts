import { describe, expect, it } from 'vitest';
import { createSessionState, applyCommand } from '$lib/core/state';
import type { FeatureFlags, PuzzleSpec } from '$lib/core/types';

const flags: FeatureFlags = {
	dragMarking: true,
	antiPatternFilter: true,
	blockIllegalQueenPlacement: true,
	hypothesisMarker: true
};

const puzzle: PuzzleSpec = {
	id: 'state-fixture',
	seed: 1,
	size: 5,
	regions: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4],
	solution: [0, 7, 14, 16, 23],
	source: 'catalog',
	antiPatternReady: true
};

describe('session state', () => {
	it('tracks cycle rules, fixed-x, and snapshot restore', () => {
		let session = createSessionState(puzzle, flags);
		session = applyCommand(session, { type: 'cycleCell', index: 8 });
		session = applyCommand(session, { type: 'cycleCell', index: 8 });
		expect(session.cells[8]).toBe('hypothesis');
		expect(session.selectionFeedback).toBeNull();

		session = applyCommand(session, { type: 'cycleCell', index: 9 });
		session = applyCommand(session, { type: 'cycleCell', index: 9 });
		expect(session.cells[9]).toBe('hypothesis');
		expect(session.selectionFeedback?.reason).toBe('hypothesis-contradiction');
		expect(session.selectionFeedback?.kind).toBe('warning');

		session = applyCommand(session, { type: 'paintCell', index: 1, mode: 'mark-x' });
		session = applyCommand(session, { type: 'paintCell', index: 2, mode: 'mark-x' });
		expect(session.cells[1]).toBe('x');
		expect(session.cells[2]).toBe('x');
		expect(session.history.past.length).toBeGreaterThanOrEqual(4);

		session = applyCommand(session, { type: 'confirmQueen', index: 0 });
		expect(session.cells[0]).toBe('queen');
		expect(session.cells[1]).toBe('fixed-x');
		expect(session.cells[5]).toBe('fixed-x');

		session = applyCommand(session, { type: 'saveSnapshot' });
		expect(session.snapshotSlots).toHaveLength(1);
		session = applyCommand(session, { type: 'resetBoard' });
		expect(session.cells.every((mark) => mark === 'empty')).toBe(true);

		session = applyCommand(session, {
			type: 'restoreSnapshot',
			snapshotId: session.snapshotSlots[0].id
		});
		expect(session.cells[0]).toBe('queen');
		expect(session.cells[1]).toBe('fixed-x');

		session = applyCommand(session, { type: 'undo' });
		expect(session.cells.every((mark) => mark === 'empty')).toBe(true);
	});

	it('promotes solved hypothesis markers into queens', () => {
		let session = createSessionState(puzzle, flags);
		const solutionSet = new Set(puzzle.solution);

		for (let index = 0; index < puzzle.size * puzzle.size; index += 1) {
			if (solutionSet.has(index)) {
				session = applyCommand(session, { type: 'cycleCell', index });
				session = applyCommand(session, { type: 'cycleCell', index });
				continue;
			}

			session = applyCommand(session, { type: 'cycleCell', index });
		}

		expect(session.selectionFeedback?.reason).toBe('board-solved');
		for (const index of puzzle.solution) {
			expect(session.cells[index]).toBe('queen');
		}
	});

	it('removes a hypothesis marker on the next tap', () => {
		let session = createSessionState(puzzle, flags);
		session = applyCommand(session, { type: 'cycleCell', index: 8 });
		session = applyCommand(session, { type: 'cycleCell', index: 8 });
		expect(session.cells[8]).toBe('hypothesis');

		session = applyCommand(session, { type: 'cycleCell', index: 8 });
		expect(session.cells[8]).toBe('empty');
	});
});
