import type { CellMark, PuzzleSpec, SelectionFeedback } from '../types';
import { getAdjacentNeighbors, range, toIndex, toRowCol } from '$lib/shared/utils/grid';

export function getRegionMap(puzzle: PuzzleSpec): Map<number, number[]> {
	const map = new Map<number, number[]>();

	puzzle.regions.forEach((regionId, index) => {
		const existing = map.get(regionId) ?? [];
		existing.push(index);
		map.set(regionId, existing);
	});

	return map;
}

export function getQueenIndexes(cells: CellMark[]): number[] {
	return cells.flatMap((mark, index) => (mark === 'queen' ? [index] : []));
}

export function getHypothesisIndexes(cells: CellMark[]): number[] {
	return cells.flatMap((mark, index) => (mark === 'hypothesis' ? [index] : []));
}

export function getIndexesForRow(row: number, size: number): number[] {
	return range(size).map((col) => toIndex(row, col, size));
}

export function getIndexesForColumn(col: number, size: number): number[] {
	return range(size).map((row) => toIndex(row, col, size));
}

export function getConflictsForQueenPlacement(
	puzzle: PuzzleSpec,
	cells: CellMark[],
	index: number
): SelectionFeedback | null {
	const size = puzzle.size;
	const nextCells = cells.slice();
	nextCells[index] = 'queen';

	const { row, col } = toRowCol(index, size);
	const regionId = puzzle.regions[index];
	const queens = getQueenIndexes(nextCells).filter((queenIndex) => queenIndex !== index);
	const conflicts = new Set<number>();
	const rows = new Set<number>();
	const cols = new Set<number>();
	const regions = new Set<number>();

	for (const queenIndex of queens) {
		const coord = toRowCol(queenIndex, size);
		if (coord.row === row) {
			conflicts.add(queenIndex);
			rows.add(row);
		}
		if (coord.col === col) {
			conflicts.add(queenIndex);
			cols.add(col);
		}
		if (puzzle.regions[queenIndex] === regionId) {
			conflicts.add(queenIndex);
			regions.add(regionId);
		}
		if (getAdjacentNeighbors(index, size).includes(queenIndex)) {
			conflicts.add(queenIndex);
			rows.add(coord.row);
			cols.add(coord.col);
		}
	}

	if (conflicts.size === 0) {
		return null;
	}

	conflicts.add(index);
	rows.add(row);
	cols.add(col);
	regions.add(regionId);

	return {
		id: `feedback-${index}-${Date.now()}`,
		kind: 'error',
		cells: [...conflicts],
		message: '이 위치에는 퀸을 확정할 수 없어요.',
		animationPreset: 'queen-error'
	};
}

export function isLegalQueenPlacement(
	puzzle: PuzzleSpec,
	cells: CellMark[],
	index: number
): boolean {
	return getConflictsForQueenPlacement(puzzle, cells, index) === null;
}

export function isSolved(puzzle: PuzzleSpec, cells: CellMark[]): boolean {
	const solutionSet = new Set(puzzle.solution);

	for (let index = 0; index < cells.length; index += 1) {
		const mark = cells[index];
		if (solutionSet.has(index)) {
			if (mark !== 'queen' && mark !== 'hypothesis') return false;
			continue;
		}
		if (mark !== 'x' && mark !== 'fixed-x') return false;
	}

	return true;
}

export function isCorrectQueen(puzzle: PuzzleSpec, index: number): boolean {
	return puzzle.solution.includes(index);
}

export function getForcedXIndexes(puzzle: PuzzleSpec, queens: number[]): number[] {
	const indexes = new Set<number>();
	const regionMap = getRegionMap(puzzle);

	for (const queenIndex of queens) {
		const { row, col } = toRowCol(queenIndex, puzzle.size);
		for (const candidate of getIndexesForRow(row, puzzle.size)) {
			if (candidate !== queenIndex) indexes.add(candidate);
		}
		for (const candidate of getIndexesForColumn(col, puzzle.size)) {
			if (candidate !== queenIndex) indexes.add(candidate);
		}
		for (const candidate of getAdjacentNeighbors(queenIndex, puzzle.size)) {
			indexes.add(candidate);
		}
		const regionId = puzzle.regions[queenIndex];
		for (const candidate of regionMap.get(regionId) ?? []) {
			if (candidate !== queenIndex) indexes.add(candidate);
		}
	}

	return [...indexes];
}

export function applyFixedXFromQueens(puzzle: PuzzleSpec, cells: CellMark[]): CellMark[] {
	const next: CellMark[] = cells.map((mark) => (mark === 'fixed-x' ? 'empty' : mark));
	for (const index of getForcedXIndexes(puzzle, getQueenIndexes(next))) {
		if (next[index] === 'queen') continue;
		next[index] = 'fixed-x';
	}
	return next;
}
