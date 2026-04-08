export type CellMark = 'empty' | 'x' | 'hypothesis' | 'queen' | 'fixed-x';
export type PuzzleSource = 'catalog' | 'generator';
export type PuzzleSize = 5 | 6 | 7;
export type PresetId = 'classic' | 'modern-minimal' | 'custom';
export type DragPaintMode = 'mark-x' | 'erase-x';
export type AnimationPreset =
	| 'none'
	| 'mark-x'
	| 'erase-x'
	| 'hypothesis'
	| 'hypothesis-contradiction'
	| 'queen-success'
	| 'queen-error'
	| 'snapshot-saved'
	| 'board-solved';
export type SelectionFeedbackReason =
	| 'queen-conflict'
	| 'queen-success'
	| 'snapshot-saved'
	| 'board-solved'
	| 'hypothesis-contradiction';

export interface FeatureFlags {
	dragMarking: boolean;
	antiPatternFilter: boolean;
	blockIllegalQueenPlacement: boolean;
	hypothesisMarker: boolean;
}

export interface PuzzleSpec {
	id: string;
	seed: number;
	size: PuzzleSize;
	regions: number[];
	solution: number[];
	source: PuzzleSource;
	antiPatternReady: boolean;
}

export interface SnapshotItem {
	id: string;
	cells: CellMark[];
	previewCells: CellMark[];
	savedAt: string;
	label: string;
	size: PuzzleSize;
	seed: number;
}

export interface HistoryState {
	past: CellMark[][];
	future: CellMark[][];
	limit: number;
}

export interface SelectionFeedback {
	id: string;
	kind: 'error' | 'success' | 'info' | 'warning';
	reason: SelectionFeedbackReason;
	cells: number[];
	message: string;
	animationPreset: AnimationPreset;
}

export interface SessionState {
	puzzle: PuzzleSpec;
	flags: FeatureFlags;
	cells: CellMark[];
	history: HistoryState;
	snapshotSlots: SnapshotItem[];
	selectionFeedback: SelectionFeedback | null;
}

export interface BoardCellView {
	index: number;
	row: number;
	col: number;
	regionId: number;
	mark: CellMark;
	isHighlighted: boolean;
}

export interface BoardViewModel {
	size: number;
	cells: BoardCellView[];
	regions: number[];
	selectionFeedback: SelectionFeedback | null;
	inputEnabled: boolean;
	solved: boolean;
	message: string;
}

export type RendererEvent =
	| { type: 'cycleCell'; index: number }
	| { type: 'confirmQueen'; index: number }
	| { type: 'paintCell'; index: number; mode: DragPaintMode };

export type GameCommand =
	| { type: 'cycleCell'; index: number }
	| { type: 'confirmQueen'; index: number }
	| { type: 'paintCell'; index: number; mode: DragPaintMode }
	| { type: 'resetBoard' }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'saveSnapshot' }
	| { type: 'restoreSnapshot'; snapshotId: string }
	| { type: 'setFlags'; flags: FeatureFlags };

export interface SolveOptions {
	blocked?: Set<number>;
	forced?: Set<number>;
	limit?: number;
}

export interface SolveResult {
	count: number;
	solutions: number[][];
}
