import {
	applyPaintCell,
	createEmptyCells,
	cycleCellMark,
	stampQueenCell,
	stripFixedMarks
} from '../commands';
import { getCatalogPuzzle } from '../catalog';
import { generatePuzzle } from '../generator';
import { countSolutions } from '../solver';
import {
	applyFixedXFromQueens,
	getBlockedIndexes,
	getConflictsForQueenPlacement,
	getForcedIndexes,
	getHypothesisIndexes,
	isCorrectQueen,
	isSolved
} from '../rules';
import type {
	FeatureFlags,
	GameCommand,
	PuzzleSize,
	PuzzleSpec,
	SelectionFeedback,
	SessionState,
	SnapshotItem
} from '../types';

function cloneCells(cells: SessionState['cells']): SessionState['cells'] {
	return cells.slice();
}

function buildSolvedFeedback(session: SessionState): SelectionFeedback | null {
	return {
		id: `solved-${Date.now()}`,
		kind: 'success',
		reason: 'board-solved',
		cells: session.puzzle.solution.slice(),
		message: '퍼즐을 해결했어요.',
		animationPreset: 'board-solved'
	};
}

function buildHypothesisContradictionFeedback(
	session: SessionState,
	nextCells: SessionState['cells']
): SelectionFeedback | null {
	const hypotheses = getHypothesisIndexes(nextCells);
	if (hypotheses.length === 0) return null;

	const forced = new Set(getForcedIndexes(nextCells));
	const blocked = new Set(getBlockedIndexes(nextCells));
	const result = countSolutions(session.puzzle, {
		forced,
		blocked,
		limit: 1
	});

	if (result.count > 0) return null;

	return {
		id: `hypothesis-contradiction-${Date.now()}`,
		kind: 'warning',
		reason: 'hypothesis-contradiction',
		cells: [...forced].sort((left, right) => left - right),
		message: '가설 배치가 현재 제약과 모순돼요.',
		animationPreset: 'hypothesis-contradiction'
	};
}

function deriveBoardFeedback(
	session: SessionState,
	nextCells: SessionState['cells']
): SelectionFeedback | null {
	const contradiction = buildHypothesisContradictionFeedback(session, nextCells);
	if (contradiction) return contradiction;
	if (isSolved(session.puzzle, nextCells)) return buildSolvedFeedback(session);
	return null;
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
		selectionFeedback: deriveBoardFeedback(session, nextCells)
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
		snapshotSlots: [],
		selectionFeedback: null
	};
}

function buildSnapshotItem(session: SessionState): SnapshotItem {
	const queens = session.cells.filter((mark) => mark === 'queen').length;
	const xs = session.cells.filter((mark) => mark === 'x' || mark === 'fixed-x').length;
	const hypotheses = session.cells.filter((mark) => mark === 'hypothesis').length;

	return {
		id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		cells: session.cells.slice(),
		previewCells: session.cells.slice(),
		savedAt: new Date().toISOString(),
		label: `퀸 ${queens} · 엑스 ${xs} · 가설 ${hypotheses}`,
		size: session.puzzle.size,
		seed: session.puzzle.seed
	};
}

function withFeedback(session: SessionState, feedback: SelectionFeedback | null): SessionState {
	return {
		...session,
		selectionFeedback: feedback
	};
}

export function applyCommand(session: SessionState, command: GameCommand): SessionState {
	switch (command.type) {
		case 'cycleCell': {
			const baseCells = stripFixedMarks(session.cells);
			const nextCells = cycleCellMark(baseCells, command.index, session.flags);
			return pushHistory(session, applyFixedXFromQueens(session.puzzle, nextCells));
		}
		case 'confirmQueen': {
			if (session.cells[command.index] === 'queen' || session.cells[command.index] === 'fixed-x') {
				return session;
			}
			if (
				session.flags.blockIllegalQueenPlacement &&
				!isCorrectQueen(session.puzzle, command.index)
			) {
				return withFeedback(session, {
					id: `queen-error-${command.index}-${Date.now()}`,
					kind: 'error',
					reason: 'queen-conflict',
					cells: [command.index],
					message: '이 칸은 정답 퀸 위치가 아니에요.',
					animationPreset: 'queen-error'
				});
			}
			const conflict = getConflictsForQueenPlacement(session.puzzle, session.cells, command.index);
			if (conflict) {
				return withFeedback(session, conflict);
			}

			const nextCells = applyFixedXFromQueens(
				session.puzzle,
				stampQueenCell(stripFixedMarks(session.cells), command.index)
			);
			const nextSession = pushHistory(session, nextCells);
			const contradiction = buildHypothesisContradictionFeedback(nextSession, nextSession.cells);
			return withFeedback(
				nextSession,
				contradiction ?? {
					id: `queen-success-${command.index}-${Date.now()}`,
					kind: 'success',
					reason: 'queen-success',
					cells: [command.index],
					message: '퀸을 확정했어요.',
					animationPreset: 'queen-success'
				}
			);
		}
		case 'paintCell':
			return session.flags.dragMarking
				? pushHistory(
						session,
						applyFixedXFromQueens(
							session.puzzle,
							applyPaintCell(stripFixedMarks(session.cells), command.index, command.mode)
						)
					)
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
		case 'saveSnapshot': {
			const snapshotSlots = [buildSnapshotItem(session), ...session.snapshotSlots].slice(0, 5);
			return withFeedback(
				{
					...session,
					snapshotSlots
				},
				{
					id: `snapshot-${Date.now()}`,
					kind: 'info',
					reason: 'snapshot-saved',
					cells: [],
					message: '스냅샷을 저장했어요.',
					animationPreset: 'snapshot-saved'
				}
			);
		}
		case 'restoreSnapshot': {
			const snapshot = session.snapshotSlots.find((item) => item.id === command.snapshotId);
			return snapshot ? pushHistory(session, snapshot.cells.slice()) : session;
		}
		case 'setFlags':
			return {
				...session,
				flags: command.flags,
				selectionFeedback: null
			};
	}
}

export function resolvePuzzle(options: {
	size: PuzzleSize;
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
