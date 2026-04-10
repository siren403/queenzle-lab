import type { PuzzleSpec } from '../types';
import { generatePuzzle } from '../generator';

export interface CatalogEntry {
	id: string;
	seed: number;
	size: 5 | 6 | 7;
}

export const CATALOG_ENTRIES: CatalogEntry[] = [
	{ id: 'catalog-5-1', seed: 5103, size: 5 },
	{ id: 'catalog-5-2', seed: 18503, size: 5 },
	{ id: 'catalog-5-3', seed: 28657, size: 5 },
	{ id: 'catalog-6-1', seed: 12031, size: 6 },
	{ id: 'catalog-6-2', seed: 48291, size: 6 },
	{ id: 'catalog-6-3', seed: 73103, size: 6 },
	{ id: 'catalog-7-1', seed: 20711, size: 7 },
	{ id: 'catalog-7-2', seed: 65041, size: 7 },
	{ id: 'catalog-7-3', seed: 82159, size: 7 }
];

const cache = new Map<string, PuzzleSpec>();

export function listCatalogEntries(size?: number): CatalogEntry[] {
	return size ? CATALOG_ENTRIES.filter((entry) => entry.size === size) : CATALOG_ENTRIES;
}

export function getCatalogPuzzle(size: 5 | 6 | 7, seed?: number): PuzzleSpec {
	const entry =
		seed === undefined
			? CATALOG_ENTRIES.find((candidate) => candidate.size === size)
			: CATALOG_ENTRIES.find((candidate) => candidate.size === size && candidate.seed === seed);

	if (!entry) {
		throw new Error(`No catalog entry exists for size ${size}.`);
	}

	const cached = cache.get(entry.id);
	if (cached) return cached;

	const generated = generatePuzzle({
		seed: entry.seed,
		size: entry.size,
		antiPatternFilter: true,
		timeBudgetMs: 2_000,
		source: 'catalog'
	});

	if (!generated) {
		throw new Error(`Failed to realize catalog puzzle ${entry.id}.`);
	}

	const puzzle = {
		...generated,
		id: entry.id,
		seed: entry.seed,
		source: 'catalog' as const,
		antiPatternReady: true
	};

	cache.set(entry.id, puzzle);
	return puzzle;
}
