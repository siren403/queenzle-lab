import type { FeatureFlags, PresetId } from '$lib/core/types';

export const PRESETS: Record<PresetId, FeatureFlags> = {
	classic: {
		dragMarking: false,
		antiPatternFilter: false,
		blockIllegalQueenPlacement: true,
		hypothesisMarker: false
	},
	'modern-minimal': {
		dragMarking: true,
		antiPatternFilter: true,
		blockIllegalQueenPlacement: true,
		hypothesisMarker: true
	},
	custom: {
		dragMarking: true,
		antiPatternFilter: true,
		blockIllegalQueenPlacement: true,
		hypothesisMarker: true
	}
};

export const PRESET_LABELS: Record<PresetId, string> = {
	classic: '기본 모드',
	'modern-minimal': '모던 미니멀',
	custom: '사용자 설정'
};

export const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
	dragMarking: '드래그 마킹',
	antiPatternFilter: '안티패턴 방지',
	blockIllegalQueenPlacement: '오답 퀸 차단',
	hypothesisMarker: '가설 마커'
};

export function getPresetFlags(preset: PresetId): FeatureFlags {
	return { ...PRESETS[preset] };
}
