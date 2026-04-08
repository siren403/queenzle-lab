import type { FeatureFlags, PresetId } from '$lib/core/types';

export const PRESETS: Record<PresetId, FeatureFlags> = {
	classic: {
		dragMarking: false,
		antiPatternFilter: false,
		blockIllegalQueenPlacement: true
	},
	'modern-minimal': {
		dragMarking: true,
		antiPatternFilter: true,
		blockIllegalQueenPlacement: true
	},
	custom: {
		dragMarking: true,
		antiPatternFilter: true,
		blockIllegalQueenPlacement: true
	}
};

export function getPresetFlags(preset: PresetId): FeatureFlags {
	return { ...PRESETS[preset] };
}
