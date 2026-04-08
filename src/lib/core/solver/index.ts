import type { PuzzleSpec, SolveOptions, SolveResult } from '../types';
import { getAdjacentNeighbors, range, toRowCol } from '$lib/shared/utils/grid';
import { getRegionMap } from '../rules';

function canPlaceQueen(
	puzzle: PuzzleSpec,
	index: number,
	placed: number[],
	blocked: Set<number>,
	forced: Set<number>
): boolean {
	if (blocked.has(index)) return false;

	const { row, col } = toRowCol(index, puzzle.size);
	const regionId = puzzle.regions[index];

	for (const queenIndex of [...placed, ...forced]) {
		if (queenIndex === index) continue;
		const coord = toRowCol(queenIndex, puzzle.size);
		if (coord.row === row || coord.col === col) return false;
		if (puzzle.regions[queenIndex] === regionId) return false;
		if (getAdjacentNeighbors(index, puzzle.size).includes(queenIndex)) return false;
	}

	return true;
}

function getForcedRows(puzzle: PuzzleSpec, forced: Set<number>): Set<number> {
	return new Set([...forced].map((index) => toRowCol(index, puzzle.size).row));
}

export function countSolutions(puzzle: PuzzleSpec, options: SolveOptions = {}): SolveResult {
	const blocked = options.blocked ?? new Set<number>();
	const forced = options.forced ?? new Set<number>();
	const limit = options.limit ?? 2;
	const forcedRows = getForcedRows(puzzle, forced);
	const rowPool = range(puzzle.size).filter((row) => !forcedRows.has(row));
	const solutions: number[][] = [];
	const regionMap = getRegionMap(puzzle);

	for (const queenIndex of forced) {
		const otherForced = [...forced].filter((candidate) => candidate !== queenIndex);
		if (!canPlaceQueen(puzzle, queenIndex, otherForced, blocked, new Set<number>())) {
			return { count: 0, solutions: [] };
		}
	}

	function getCandidatesForRow(row: number, placed: number[]): number[] {
		return range(puzzle.size)
			.map((col) => row * puzzle.size + col)
			.filter((index) => canPlaceQueen(puzzle, index, placed, blocked, forced));
	}

	function hasGroupCandidate(rowCandidates: Map<number, number[]>, placed: number[]): boolean {
		for (let col = 0; col < puzzle.size; col += 1) {
			const available = [...rowCandidates.values()]
				.flat()
				.filter((index) => toRowCol(index, puzzle.size).col === col);
			if (
				available.length === 0 &&
				![...forced, ...placed].some((index) => toRowCol(index, puzzle.size).col === col)
			) {
				return false;
			}
		}

		for (const [regionId, indexes] of regionMap.entries()) {
			const available = indexes.filter((index) =>
				canPlaceQueen(puzzle, index, placed, blocked, forced)
			);
			if (
				available.length === 0 &&
				![...forced, ...placed].some((index) => puzzle.regions[index] === regionId)
			) {
				return false;
			}
		}

		return true;
	}

	function search(placed: number[]): void {
		if (solutions.length >= limit) return;
		if (placed.length + forced.size === puzzle.size) {
			solutions.push([...forced, ...placed].sort((left, right) => left - right));
			return;
		}

		const rowCandidates = new Map<number, number[]>();
		for (const row of rowPool) {
			const candidates = getCandidatesForRow(row, placed);
			if (candidates.length === 0) return;
			rowCandidates.set(row, candidates);
		}
		if (!hasGroupCandidate(rowCandidates, placed)) return;

		const [row, candidates] = [...rowCandidates.entries()].sort(
			(left, right) => left[1].length - right[1].length
		)[0];
		rowPool.splice(rowPool.indexOf(row), 1);
		for (const candidate of candidates) {
			placed.push(candidate);
			search(placed);
			placed.pop();
			if (solutions.length >= limit) break;
		}
		rowPool.push(row);
	}

	search([]);

	return {
		count: solutions.length,
		solutions
	};
}

export function isUniquelySolvable(puzzle: PuzzleSpec): boolean {
	return countSolutions(puzzle, { limit: 2 }).count === 1;
}

export function passesAntiPatternFilter(puzzle: PuzzleSpec): boolean {
	const forced = new Set<number>();
	const blocked = new Set<number>();
	const size = puzzle.size;
	const regionMap = getRegionMap(puzzle);
	let progress = true;

	function getCandidates(indexes: number[]): number[] {
		return indexes.filter((index) => canPlaceQueen(puzzle, index, [...forced], blocked, forced));
	}

	while (progress) {
		progress = false;
		for (let row = 0; row < size; row += 1) {
			const rowIndexes = range(size).map((col) => row * size + col);
			const candidates = getCandidates(rowIndexes);
			if (
				candidates.length === 0 &&
				![...forced].some((index) => toRowCol(index, size).row === row)
			)
				return false;
			if (candidates.length === 1 && !forced.has(candidates[0])) {
				forced.add(candidates[0]);
				progress = true;
			}
		}

		for (let col = 0; col < size; col += 1) {
			const colIndexes = range(size).map((row) => row * size + col);
			const candidates = getCandidates(colIndexes);
			if (
				candidates.length === 0 &&
				![...forced].some((index) => toRowCol(index, size).col === col)
			)
				return false;
			if (candidates.length === 1 && !forced.has(candidates[0])) {
				forced.add(candidates[0]);
				progress = true;
			}
		}

		for (const indexes of regionMap.values()) {
			const candidates = getCandidates(indexes);
			if (candidates.length === 0 && !indexes.some((index) => forced.has(index))) return false;
			if (candidates.length === 1 && !forced.has(candidates[0])) {
				forced.add(candidates[0]);
				progress = true;
			}
		}

		const openCandidates = range(size * size).filter(
			(index) =>
				!blocked.has(index) &&
				!forced.has(index) &&
				canPlaceQueen(puzzle, index, [...forced], blocked, forced)
		);

		for (const candidate of openCandidates) {
			const assumption = countSolutions(puzzle, {
				blocked,
				forced: new Set([...forced, candidate]),
				limit: 1
			});
			if (assumption.count === 0) {
				blocked.add(candidate);
				progress = true;
			}
		}
	}

	return countSolutions(puzzle, { forced, blocked, limit: 1 }).count === 1;
}
