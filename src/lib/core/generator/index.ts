import type { PuzzleSpec } from '../types';
import { isUniquelySolvable, passesAntiPatternFilter } from '../solver';
import { getOrthogonalNeighbors, range } from '$lib/shared/utils/grid';

export interface GeneratorConfig {
	seed: number;
	size: number;
	antiPatternFilter: boolean;
	timeBudgetMs: number;
	source?: 'catalog' | 'generator';
}

function createRng(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state += 0x6d2b79f5;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffle<T>(items: T[], random: () => number): T[] {
	const copy = items.slice();

	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
	}

	return copy;
}

function isAdjacent(index: number, others: number[], size: number): boolean {
	const row = Math.floor(index / size);
	const col = index % size;

	return others.some((other) => {
		const otherRow = Math.floor(other / size);
		const otherCol = other % size;
		return Math.abs(otherRow - row) <= 1 && Math.abs(otherCol - col) <= 1;
	});
}

function generateSolution(size: number, random: () => number): number[] | null {
	const rows = range(size);
	const usedCols = new Set<number>();
	const placed: number[] = [];

	function search(rowIndex: number): boolean {
		if (rowIndex === rows.length) return true;
		const row = rows[rowIndex];
		const candidates = shuffle(range(size), random).filter((col) => {
			if (usedCols.has(col)) return false;
			const index = row * size + col;
			return !isAdjacent(index, placed, size);
		});

		for (const col of candidates) {
			const index = row * size + col;
			usedCols.add(col);
			placed.push(index);
			if (search(rowIndex + 1)) return true;
			placed.pop();
			usedCols.delete(col);
		}

		return false;
	}

	return search(0) ? placed.slice() : null;
}

function growRegions(size: number, solution: number[], random: () => number): number[] {
	const regions = Array<number>(size * size).fill(-1);
	const regionCells = new Map<number, Set<number>>();

	solution.forEach((index, regionId) => {
		regions[index] = regionId;
		regionCells.set(regionId, new Set([index]));
	});

	let assigned = solution.length;

	while (assigned < size * size) {
		const frontiers: Array<{ regionId: number; index: number }> = [];
		for (const [regionId, indexes] of regionCells.entries()) {
			for (const index of indexes) {
				for (const neighbor of getOrthogonalNeighbors(index, size)) {
					if (regions[neighbor] === -1) {
						frontiers.push({ regionId, index: neighbor });
					}
				}
			}
		}

		if (frontiers.length === 0) break;
		const choice = frontiers[Math.floor(random() * frontiers.length)];
		if (regions[choice.index] !== -1) continue;
		regions[choice.index] = choice.regionId;
		regionCells.get(choice.regionId)?.add(choice.index);
		assigned += 1;
	}

	for (let index = 0; index < regions.length; index += 1) {
		if (regions[index] !== -1) continue;
		const neighbors = getOrthogonalNeighbors(index, size).filter(
			(neighbor) => regions[neighbor] !== -1
		);
		if (neighbors.length === 0) {
			regions[index] = Math.floor(random() * size);
			continue;
		}
		const picked = neighbors[Math.floor(random() * neighbors.length)];
		regions[index] = regions[picked];
	}

	return regions;
}

export function generatePuzzle(config: GeneratorConfig): PuzzleSpec | null {
	const startedAt = performance.now();
	const random = createRng(config.seed);
	let attempt = 0;

	while (performance.now() - startedAt <= config.timeBudgetMs) {
		attempt += 1;
		const solution = generateSolution(config.size, random);
		if (!solution) continue;

		const regions = growRegions(config.size, solution, random);
		const puzzle: PuzzleSpec = {
			id: `${config.source ?? 'generator'}-${config.size}-${config.seed}-${attempt}`,
			seed: config.seed,
			size: config.size,
			regions,
			solution: solution.slice().sort((left, right) => left - right),
			source: config.source ?? 'generator',
			antiPatternReady: false
		};

		if (!isUniquelySolvable(puzzle)) continue;
		if (config.antiPatternFilter && !passesAntiPatternFilter(puzzle)) continue;

		return {
			...puzzle,
			antiPatternReady: config.antiPatternFilter
		};
	}

	return null;
}
