import { Application, Container, type FederatedPointerEvent } from 'pixi.js';
import type {
	AnimationPreset,
	BoardCellView,
	BoardViewModel,
	CellMark,
	DragPaintMode,
	FeatureFlags,
	RendererEvent
} from '$lib/core/types';
import { computeBoardLayout, type BoardLayout } from './layout';
import { BoardEffectController } from './effect-controller';
import { CellView } from './cell-view';

type FeedbackEffect =
	| 'queen-error'
	| 'queen-success'
	| 'board-solved'
	| 'snapshot-saved'
	| 'hypothesis-contradiction'
	| 'mark-x'
	| 'erase-x'
	| 'hypothesis';

interface GestureState {
	index: number;
	pointerId: number;
	pointerType: string;
	startMark: CellMark;
	paintMode: DragPaintMode | null;
	visited: Set<number>;
	longPressTriggered: boolean;
}

export class PixiBoardRenderer {
	private app: Application;
	private onEvent: (event: RendererEvent) => void;
	private host: HTMLElement;
	private rootLayer = new Container();
	private cellViews = new Map<number, CellView>();
	private effectController = new BoardEffectController();
	private viewModel: BoardViewModel | null = null;
	private previousViewModel: BoardViewModel | null = null;
	private flags: FeatureFlags | null = null;
	private layout: BoardLayout | null = null;
	private gesture: GestureState | null = null;
	private clickTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastMouseTap: { index: number; time: number } | null = null;
	private lastFeedbackId: string | null = null;

	constructor(app: Application, host: HTMLElement, onEvent: (event: RendererEvent) => void) {
		this.app = app;
		this.host = host;
		this.onEvent = onEvent;

		this.rootLayer.eventMode = 'passive';
		this.rootLayer.sortableChildren = true;
		this.app.stage.addChild(this.rootLayer);
		this.app.stage.eventMode = 'static';
		this.app.stage.hitArea = this.app.screen;
		this.app.stage.on('globalpointermove', this.handlePointerMove);
		this.app.stage.on('pointerup', this.handlePointerUp);
		this.app.stage.on('pointerupoutside', this.handlePointerUp);
	}

	update(viewModel: BoardViewModel, flags: FeatureFlags): void {
		if (this.shouldHardResetVisualState(this.viewModel, viewModel)) {
			this.resetVisualState();
		}

		this.previousViewModel = this.viewModel;
		this.viewModel = viewModel;
		this.flags = flags;
		this.layout = computeBoardLayout(
			Math.max(this.host.clientWidth, 1),
			Math.max(this.host.clientHeight, 1),
			viewModel.size
		);
		this.app.stage.hitArea = this.app.screen;

		this.syncCellViews();
		this.syncTransitions();
		this.syncFeedback();
	}

	destroy(): void {
		this.app.stage.off('globalpointermove', this.handlePointerMove);
		this.app.stage.off('pointerup', this.handlePointerUp);
		this.app.stage.off('pointerupoutside', this.handlePointerUp);
		this.clearPendingClick();
		this.effectController.destroy();
		for (const view of this.cellViews.values()) {
			view.destroy();
		}
		this.cellViews.clear();
	}

	private syncCellViews(): void {
		if (!this.viewModel || !this.layout) return;

		const validIndices = new Set<number>();
		for (const cell of this.viewModel.cells) {
			validIndices.add(cell.index);
			let view = this.cellViews.get(cell.index);
			if (!view) {
				view = new CellView(cell.index, {
					onPointerDown: this.handlePointerDown,
					onPointerUp: this.handlePointerUp
				});
				this.cellViews.set(cell.index, view);
				this.effectController.register(cell.index, view);
				this.rootLayer.addChild(view.root);
			}

			view.setPresentation({
				cell,
				layout: this.layout,
				basePriority: this.getBasePriority(cell),
				feedback: this.viewModel.selectionFeedback
			});
		}

		this.effectController.unregisterRemoved(validIndices);

		for (const [index, view] of this.cellViews) {
			if (validIndices.has(index)) continue;
			this.rootLayer.removeChild(view.root);
			view.destroy();
			this.cellViews.delete(index);
		}
	}

	private syncTransitions(): void {
		if (!this.viewModel) return;
		const previousCells = this.previousViewModel?.cells ?? [];
		const queens = this.viewModel.cells
			.filter((cell) => cell.mark === 'queen')
			.map((cell) => ({ row: cell.row, col: cell.col }));

		for (const cell of this.viewModel.cells) {
			const previous = previousCells[cell.index];
			if (!previous || previous.mark === cell.mark) continue;
			this.effectController.playTransition(cell.index, previous.mark, cell.mark, {
				delay: cell.mark === 'fixed-x' ? this.getFixedXDelay(cell, queens) / 1000 : 0
			});
		}
	}

	private syncFeedback(): void {
		if (!this.viewModel) return;
		const feedback = this.viewModel.selectionFeedback;
		if (!feedback) {
			this.lastFeedbackId = null;
			return;
		}
		if (feedback.id === this.lastFeedbackId || feedback.animationPreset === 'none') return;

		const targets =
			feedback.cells.length > 0 ? feedback.cells : this.viewModel.cells.map((cell) => cell.index);
		for (const index of targets) {
			this.effectController.playFeedback(index, this.mapFeedbackPreset(feedback.animationPreset));
		}

		this.lastFeedbackId = feedback.id;
	}

	private shouldHardResetVisualState(
		previous: BoardViewModel | null,
		next: BoardViewModel
	): boolean {
		if (!previous) return false;
		if (previous.size !== next.size) return true;
		const previousHasMarks = previous.cells.some((cell) => cell.mark !== 'empty');
		const nextHasMarks = next.cells.some((cell) => cell.mark !== 'empty');
		return previousHasMarks && !nextHasMarks;
	}

	private resetVisualState(): void {
		this.effectController.resetAll();
		this.gesture = null;
		this.clearPendingClick();
		this.lastMouseTap = null;
		this.lastFeedbackId = null;
	}

	private handlePointerDown = (cell: BoardCellView, event: FederatedPointerEvent): void => {
		this.gesture = {
			index: cell.index,
			pointerId: event.pointerId,
			pointerType: event.pointerType,
			startMark: cell.mark,
			paintMode: null,
			visited: new Set([cell.index]),
			longPressTriggered: false
		};

		if (event.pointerType === 'touch' && (cell.mark === 'empty' || cell.mark === 'hypothesis')) {
			this.effectController.startCharge(cell.index, () => {
				if (!this.gesture || this.gesture.index !== cell.index || this.gesture.paintMode) return;
				this.gesture.longPressTriggered = true;
				this.clearPendingClick();
				this.onEvent({ type: 'confirmQueen', index: cell.index });
			});
		}
	};

	private handlePointerMove = (event: FederatedPointerEvent): void => {
		if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;
		if (!this.layout || !this.viewModel || !this.flags?.dragMarking) return;

		const index = this.resolveCellIndex(event.global.x, event.global.y);
		if (index === null || this.gesture.visited.has(index)) return;

		const canPaint = this.gesture.startMark === 'empty' || this.gesture.startMark === 'x';
		if (!canPaint) {
			this.gesture.visited.add(index);
			return;
		}

		this.effectController.cancelCharge(this.gesture.index, true);

		if (!this.gesture.paintMode) {
			this.clearPendingClick();
			this.gesture.paintMode = this.gesture.startMark === 'x' ? 'erase-x' : 'mark-x';
			this.emitPaint(this.gesture.index, this.gesture.paintMode);
		}

		this.gesture.visited.add(index);
		this.emitPaint(index, this.gesture.paintMode);
	};

	private handlePointerUp = (event: FederatedPointerEvent): void => {
		if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;

		const gesture = this.gesture;
		this.gesture = null;
		this.effectController.cancelCharge(gesture.index);

		if (gesture.paintMode || gesture.longPressTriggered) return;

		if (gesture.pointerType === 'touch') {
			this.onEvent({ type: 'cycleCell', index: gesture.index });
			return;
		}

		if (gesture.startMark === 'x' || gesture.startMark === 'hypothesis') {
			this.clearPendingClick();
			this.lastMouseTap = null;
			this.onEvent({ type: 'cycleCell', index: gesture.index });
			return;
		}

		const now = Date.now();
		if (
			this.lastMouseTap &&
			this.lastMouseTap.index === gesture.index &&
			now - this.lastMouseTap.time < 250
		) {
			this.clearPendingClick();
			this.lastMouseTap = null;
			this.onEvent({ type: 'confirmQueen', index: gesture.index });
			return;
		}

		this.lastMouseTap = { index: gesture.index, time: now };
		this.clickTimeout = setTimeout(() => {
			this.clickTimeout = null;
			this.onEvent({ type: 'cycleCell', index: gesture.index });
		}, 155);
	};

	private emitPaint(index: number, mode: DragPaintMode): void {
		this.onEvent({ type: 'paintCell', index, mode });
	}

	private clearPendingClick(): void {
		if (!this.clickTimeout) return;
		clearTimeout(this.clickTimeout);
		this.clickTimeout = null;
	}

	private resolveCellIndex(x: number, y: number): number | null {
		if (!this.layout || !this.viewModel) return null;
		const relativeX = x - this.layout.x;
		const relativeY = y - this.layout.y;
		if (relativeX < 0 || relativeY < 0) return null;
		if (relativeX > this.layout.boardSize || relativeY > this.layout.boardSize) return null;

		const col = Math.floor(relativeX / this.layout.cellSize);
		const row = Math.floor(relativeY / this.layout.cellSize);
		const index = row * this.viewModel.size + col;
		return index >= 0 && index < this.viewModel.cells.length ? index : null;
	}

	private getBasePriority(cell: BoardCellView): number {
		let priority = 0;
		if (cell.mark === 'fixed-x') priority += 1;
		if (cell.mark === 'x') priority += 2;
		if (cell.mark === 'hypothesis') priority += 4;
		if (cell.mark === 'queen') priority += 6;
		if (cell.isHighlighted) priority += 20;
		return priority;
	}

	private getFixedXDelay(cell: BoardCellView, queens: Array<{ row: number; col: number }>): number {
		if (queens.length === 0) return 0;
		const distance = queens.reduce((closest, queen) => {
			const current = Math.abs(queen.row - cell.row) + Math.abs(queen.col - cell.col);
			return Math.min(closest, current);
		}, Number.POSITIVE_INFINITY);
		return Math.max(0, distance * 14);
	}

	private mapFeedbackPreset(preset: AnimationPreset): FeedbackEffect {
		switch (preset) {
			case 'queen-error':
				return 'queen-error';
			case 'queen-success':
				return 'queen-success';
			case 'board-solved':
				return 'board-solved';
			case 'snapshot-saved':
				return 'snapshot-saved';
			case 'hypothesis-contradiction':
				return 'hypothesis-contradiction';
			case 'hypothesis':
				return 'hypothesis';
			case 'erase-x':
				return 'erase-x';
			case 'mark-x':
			default:
				return 'mark-x';
		}
	}
}
