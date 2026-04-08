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
		cells: [...conflicts],
		rows: [...rows],
		cols: [...cols],
		regions: [...regions],
		reason: 'This queen breaks the row, column, region, or adjacency rules.',
		severity: 'warning'
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
	const queens = getQueenIndexes(cells);
	if (queens.length !== puzzle.size) return false;

	for (const queenIndex of queens) {
		if (
			!isLegalQueenPlacement(
				puzzle,
				cells.map((mark, index) => (index === queenIndex ? 'empty' : mark)),
				queenIndex
			)
		) {
			return false;
		}
	}

	const regionMap = getRegionMap(puzzle);

	for (let row = 0; row < puzzle.size; row += 1) {
		if (getIndexesForRow(row, puzzle.size).filter((index) => cells[index] === 'queen').length !== 1)
			return false;
	}
	for (let col = 0; col < puzzle.size; col += 1) {
		if (
			getIndexesForColumn(col, puzzle.size).filter((index) => cells[index] === 'queen').length !== 1
		)
			return false;
	}
	for (const indexes of regionMap.values()) {
		if (indexes.filter((index) => cells[index] === 'queen').length !== 1) return false;
	}

	return true;
}
