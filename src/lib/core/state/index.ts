import { applyDragX, createEmptyCells, setQueenCell, toggleXCell } from '../commands';
import { getCatalogPuzzle } from '../catalog';
import { generatePuzzle } from '../generator';
import { getConflictsForQueenPlacement, isSolved } from '../rules';
import type { FeatureFlags, GameCommand, PuzzleSpec, SessionState } from '../types';

function cloneCells(cells: SessionState['cells']): SessionState['cells'] {
	return cells.slice();
}

function pushHistory(session: SessionState, nextCells: SessionState['cells']): SessionState {
	if (nextCells === session.cells) return session;
	if (nextCells.every((mark, index) => mark === session.cells[index])) return session;

	const past = [...session.history.past, cloneCells(session.cells)];
	while (past.length > session.history.limit) {
		past.shift();
	}

	return {
		...session,
		cells: nextCells,
		history: {
			...session.history,
			past,
			future: []
		},
		selectionFeedback: isSolved(session.puzzle, nextCells)
			? {
					cells: [],
					rows: [],
					cols: [],
					regions: [],
					reason: 'Puzzle solved.',
					severity: 'success'
				}
			: null
	};
}

export function createSessionState(puzzle: PuzzleSpec, flags: FeatureFlags): SessionState {
	return {
		puzzle,
		flags,
		cells: createEmptyCells(puzzle.size),
		history: {
			past: [],
			future: [],
			limit: 100
		},
		snapshotSlot: null,
		selectionFeedback: null
	};
}

export function applyCommand(session: SessionState, command: GameCommand): SessionState {
	switch (command.type) {
		case 'toggleX':
			return pushHistory(session, toggleXCell(session.cells, command.index));
		case 'setQueen': {
			if (session.cells[command.index] === 'queen') {
				return pushHistory(session, setQueenCell(session.cells, command.index));
			}

			if (session.flags.blockIllegalQueenPlacement) {
				const feedback = getConflictsForQueenPlacement(
					session.puzzle,
					session.cells,
					command.index
				);
				if (feedback) {
					return {
						...session,
						selectionFeedback: feedback
					};
				}
			}

			return pushHistory(session, setQueenCell(session.cells, command.index));
		}
		case 'dragCells':
			return session.flags.dragMarking
				? pushHistory(session, applyDragX(session.cells, command.indices))
				: session;
		case 'resetBoard':
			return pushHistory(session, createEmptyCells(session.puzzle.size));
		case 'undo': {
			const previous = session.history.past.at(-1);
			if (!previous) return session;
			return {
				...session,
				cells: previous.slice(),
				history: {
					...session.history,
					past: session.history.past.slice(0, -1),
					future: [cloneCells(session.cells), ...session.history.future]
				},
				selectionFeedback: null
			};
		}
		case 'redo': {
			const next = session.history.future[0];
			if (!next) return session;
			return {
				...session,
				cells: next.slice(),
				history: {
					...session.history,
					past: [...session.history.past, cloneCells(session.cells)],
					future: session.history.future.slice(1)
				},
				selectionFeedback: null
			};
		}
		case 'saveSnapshot':
			return {
				...session,
				snapshotSlot: {
					cells: cloneCells(session.cells),
					savedAt: new Date().toISOString()
				},
				selectionFeedback: null
			};
		case 'restoreSnapshot':
			return session.snapshotSlot
				? pushHistory(session, session.snapshotSlot.cells.slice())
				: session;
		case 'setFlags':
			return {
				...session,
				flags: command.flags,
				selectionFeedback: null
			};
	}
}

export function resolvePuzzle(options: {
	size: 6 | 7;
	seed: number;
	antiPatternFilter: boolean;
}): PuzzleSpec {
	const fromCatalog = (() => {
		try {
			return getCatalogPuzzle(options.size, options.seed);
		} catch {
			return null;
		}
	})();

	if (fromCatalog) return fromCatalog;

	const generated = generatePuzzle({
		seed: options.seed,
		size: options.size,
		antiPatternFilter: options.antiPatternFilter,
		timeBudgetMs: 150,
		source: 'generator'
	});

	if (generated) return generated;

	return getCatalogPuzzle(options.size);
}
