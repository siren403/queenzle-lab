import type { PresetId } from '$lib/core/types';

export interface LabQueryState {
	size: 6 | 7;
	seed: number;
	preset: PresetId;
}

const DEFAULT_SEED = 12031;

export function parseLabQuery(url: URL): LabQueryState {
	const rawSize = Number(url.searchParams.get('size'));
	const size = rawSize === 7 ? 7 : 6;
	const rawSeed = Number(url.searchParams.get('seed'));
	const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? rawSeed : DEFAULT_SEED;
	const rawPreset = url.searchParams.get('preset');
	const preset: PresetId =
		rawPreset === 'classic' || rawPreset === 'custom' || rawPreset === 'modern-minimal'
			? rawPreset
			: 'modern-minimal';

	return { size, seed, preset };
}

export function buildLabQuery(state: LabQueryState): URLSearchParams {
	const params = new URLSearchParams();
	params.set('seed', String(state.seed));
	params.set('size', String(state.size));
	params.set('preset', state.preset);
	return params;
}

export function getRandomSeed(): number {
	return Math.floor(Date.now() % 100_000_000);
}
