export type CellMark = 'empty' | 'x' | 'queen';
export type PuzzleSource = 'catalog' | 'generator';
export type PresetId = 'classic' | 'modern-minimal' | 'custom';

export interface FeatureFlags {
	dragMarking: boolean;
	antiPatternFilter: boolean;
	blockIllegalQueenPlacement: boolean;
}

export interface PuzzleSpec {
	id: string;
	seed: number;
	size: number;
	regions: number[];
	solution: number[];
	source: PuzzleSource;
	antiPatternReady: boolean;
}

export interface SnapshotSlot {
	cells: CellMark[];
	savedAt: string;
}

export interface HistoryState {
	past: CellMark[][];
	future: CellMark[][];
	limit: number;
}

export interface SelectionFeedback {
	cells: number[];
	rows: number[];
	cols: number[];
	regions: number[];
	reason: string;
	severity: 'warning' | 'success';
}

export interface SessionState {
	puzzle: PuzzleSpec;
	flags: FeatureFlags;
	cells: CellMark[];
	history: HistoryState;
	snapshotSlot: SnapshotSlot | null;
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
}

export type RendererEvent =
	| { type: 'clickCell'; index: number }
	| { type: 'doubleClickCell'; index: number }
	| { type: 'dragCells'; indices: number[] };

export type GameCommand =
	| { type: 'toggleX'; index: number }
	| { type: 'setQueen'; index: number }
	| { type: 'dragCells'; indices: number[] }
	| { type: 'resetBoard' }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'saveSnapshot' }
	| { type: 'restoreSnapshot' }
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
