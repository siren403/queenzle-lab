import type { CellMark } from '../types';

export function createEmptyCells(size: number): CellMark[] {
	return Array.from({ length: size * size }, () => 'empty');
}

export function toggleXCell(cells: CellMark[], index: number): CellMark[] {
	if (cells[index] === 'queen') return cells;

	const next = cells.slice();
	next[index] = next[index] === 'x' ? 'empty' : 'x';
	return next;
}

export function setQueenCell(cells: CellMark[], index: number): CellMark[] {
	const next = cells.slice();
	next[index] = next[index] === 'queen' ? 'empty' : 'queen';
	return next;
}

export function applyDragX(cells: CellMark[], indices: number[]): CellMark[] {
	let changed = false;
	const next = cells.slice();

	for (const index of indices) {
		if (next[index] === 'queen' || next[index] === 'x') continue;
		next[index] = 'x';
		changed = true;
	}

	return changed ? next : cells;
}
