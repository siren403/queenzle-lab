import type { CellMark, FeatureFlags } from '../types';

export function createEmptyCells(size: number): CellMark[] {
	return Array.from({ length: size * size }, () => 'empty');
}

export function cycleCellMark(cells: CellMark[], index: number, flags: FeatureFlags): CellMark[] {
	if (cells[index] === 'queen' || cells[index] === 'fixed-x') return cells;
	const next = cells.slice();
	const cycle = flags.hypothesisMarker ? ['empty', 'x', 'hypothesis'] : ['empty', 'x'];
	const current = next[index] === 'hypothesis' && !flags.hypothesisMarker ? 'empty' : next[index];
	const currentIndex = cycle.indexOf(current);
	next[index] = cycle[(currentIndex + 1) % cycle.length] as CellMark;
	return next;
}

export function stampQueenCell(cells: CellMark[], index: number): CellMark[] {
	const next = cells.slice();
	next[index] = 'queen';
	return next;
}

export function applyPaintCell(
	cells: CellMark[],
	index: number,
	mode: 'mark-x' | 'erase-x'
): CellMark[] {
	if (cells[index] === 'queen' || cells[index] === 'hypothesis' || cells[index] === 'fixed-x') {
		return cells;
	}

	const next = cells.slice();
	if (mode === 'mark-x' && next[index] === 'empty') {
		next[index] = 'x';
		return next;
	}
	if (mode === 'erase-x' && next[index] === 'x') {
		next[index] = 'empty';
		return next;
	}
	return cells;
}

export function stripFixedMarks(cells: CellMark[]): CellMark[] {
	return cells.map((mark) => (mark === 'fixed-x' ? 'empty' : mark));
}
