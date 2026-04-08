import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
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
import { PIXI_THEME, REGION_COLORS } from '../theme/palette';

const LONG_PRESS_MS = 520;

interface CellAnimation {
	index: number;
	preset: AnimationPreset;
	startedAt: number;
	duration: number;
	previousMark?: CellMark;
}

interface GestureState {
	index: number;
	pointerId: number;
	pointerType: string;
	startedAt: number;
	startMark: CellMark;
	paintMode: DragPaintMode | null;
	visited: Set<number>;
	longPressTriggered: boolean;
}

export class PixiBoardRenderer {
	private app: Application;
	private onEvent: (event: RendererEvent) => void;
	private boardLayer = new Container();
	private host: HTMLElement;
	private viewModel: BoardViewModel | null = null;
	private previousViewModel: BoardViewModel | null = null;
	private flags: FeatureFlags | null = null;
	private layout: BoardLayout | null = null;
	private gesture: GestureState | null = null;
	private clickTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastMouseTap: { index: number; time: number } | null = null;
	private animations: CellAnimation[] = [];
	private lastFeedbackId: string | null = null;

	constructor(app: Application, host: HTMLElement, onEvent: (event: RendererEvent) => void) {
		this.app = app;
		this.host = host;
		this.onEvent = onEvent;
		this.app.stage.addChild(this.boardLayer);
		this.app.stage.eventMode = 'static';
		this.app.stage.hitArea = this.app.screen;
		this.app.stage.on('globalpointermove', this.handlePointerMove);
		this.app.stage.on('pointerup', this.handlePointerUp);
		this.app.stage.on('pointerupoutside', this.handlePointerUp);
		this.app.ticker.add(this.tick);
	}

	update(viewModel: BoardViewModel, flags: FeatureFlags): void {
		this.previousViewModel = this.viewModel;
		this.viewModel = viewModel;
		this.flags = flags;
		this.layout = computeBoardLayout(this.host.clientWidth, this.host.clientHeight, viewModel.size);
		this.syncAnimations();
		this.draw();
	}

	destroy(): void {
		this.app.stage.off('globalpointermove', this.handlePointerMove);
		this.app.stage.off('pointerup', this.handlePointerUp);
		this.app.stage.off('pointerupoutside', this.handlePointerUp);
		this.app.ticker.remove(this.tick);
		if (this.clickTimeout) clearTimeout(this.clickTimeout);
	}

	private tick = (): void => {
		if (!this.viewModel || !this.layout) return;
		const now = performance.now();
		this.animations = this.animations.filter(
			(animation) => now - animation.startedAt <= animation.duration
		);

		if (this.gesture && this.gesture.pointerType === 'touch' && !this.gesture.paintMode) {
			const progress = this.getLongPressProgress(now);
			if (
				progress >= 1 &&
				!this.gesture.longPressTriggered &&
				this.gesture.startMark !== 'fixed-x' &&
				this.gesture.startMark !== 'queen'
			) {
				this.gesture.longPressTriggered = true;
				this.clearPendingClick();
				this.onEvent({ type: 'confirmQueen', index: this.gesture.index });
			}
		}

		if (this.animations.length > 0 || this.gesture) {
			this.draw();
		}
	};

	private syncAnimations(): void {
		if (!this.viewModel) return;
		const now = performance.now();
		const previousCells = this.previousViewModel?.cells ?? [];

		for (const cell of this.viewModel.cells) {
			const previous = previousCells[cell.index];
			if (!previous || previous.mark === cell.mark) continue;
			this.animations.push(
				this.createTransitionAnimation(cell.index, previous.mark, cell.mark, now)
			);
		}

		const feedback = this.viewModel.selectionFeedback;
		if (feedback && feedback.id !== this.lastFeedbackId && feedback.animationPreset !== 'none') {
			const targets =
				feedback.cells.length > 0 ? feedback.cells : this.viewModel.cells.map((cell) => cell.index);
			for (const index of targets) {
				this.animations.push({
					index,
					preset: feedback.animationPreset,
					startedAt: now,
					duration: feedback.animationPreset === 'queen-error' ? 420 : 320
				});
			}
			this.lastFeedbackId = feedback.id;
		}
	}

	private createTransitionAnimation(
		index: number,
		previousMark: CellMark,
		nextMark: CellMark,
		startedAt: number
	): CellAnimation {
		if (previousMark === 'x' && nextMark === 'empty') {
			return { index, preset: 'erase-x', startedAt, duration: 220, previousMark };
		}
		if (nextMark === 'hypothesis') {
			return { index, preset: 'hypothesis', startedAt, duration: 260, previousMark };
		}
		if (nextMark === 'queen') {
			return { index, preset: 'queen-success', startedAt, duration: 320, previousMark };
		}
		return { index, preset: 'mark-x', startedAt, duration: 220, previousMark };
	}

	private draw(): void {
		if (!this.viewModel || !this.layout) return;
		for (const child of this.boardLayer.removeChildren()) {
			child.destroy();
		}

		for (const cell of this.viewModel.cells) {
			this.drawCell(cell);
		}
	}

	private drawCell(cell: BoardCellView): void {
		if (!this.layout || !this.viewModel) return;
		const animation = this.getAnimation(cell.index);
		const chargeProgress = this.getChargeProgressForCell(cell.index);
		const offsetX = animation?.preset === 'queen-error' ? this.getShakeOffset(animation) : 0;
		const x = this.layout.x + cell.col * this.layout.cellSize + offsetX;
		const y = this.layout.y + cell.row * this.layout.cellSize;
		const baseColor =
			cell.mark === 'fixed-x' ? 0xe5e5ea : REGION_COLORS[cell.regionId % REGION_COLORS.length];
		const borderColor = this.getBorderColor(cell, animation);
		const scaleBoost =
			(animation?.preset === 'mark-x' ||
				animation?.preset === 'hypothesis' ||
				animation?.preset === 'queen-success') &&
			animation
				? 1 + 0.1 * (1 - this.getAnimationProgress(animation))
				: chargeProgress > 0
					? 1 + 0.05 * chargeProgress
					: 1;
		const width = (this.layout.cellSize - 2) * scaleBoost;
		const height = (this.layout.cellSize - 2) * scaleBoost;
		const graphics = new Graphics();
		graphics
			.roundRect(
				x + (this.layout.cellSize - width) / 2,
				y + (this.layout.cellSize - height) / 2,
				width,
				height,
				14
			)
			.fill({ color: baseColor, alpha: this.getCellAlpha(cell, animation) })
			.stroke({
				color: borderColor,
				width: cell.isHighlighted || animation?.preset === 'queen-error' ? 4 : 2
			});

		graphics.eventMode = 'static';
		graphics.cursor = 'pointer';
		graphics.on('pointerdown', (event) => this.handlePointerDown(cell, event));
		this.boardLayer.addChild(graphics);

		this.drawChargeRing(cell, x, y, chargeProgress);
		this.drawMarker(cell, x, y, animation);
	}

	private drawMarker(
		cell: BoardCellView,
		x: number,
		y: number,
		animation: CellAnimation | null
	): void {
		if (!this.layout) return;

		const ghostErase = animation?.preset === 'erase-x' ? animation.previousMark : null;
		const markerMark = cell.mark === 'empty' && ghostErase ? ghostErase : cell.mark;
		if (markerMark === 'empty') return;

		const marker = new Text({
			text: this.getMarkerText(markerMark),
			style: {
				fontFamily: 'Inter, system-ui, sans-serif',
				fontSize: this.layout.cellSize * this.getMarkerSize(markerMark),
				fontWeight: '700',
				fill: this.getMarkerColor(markerMark, animation)
			}
		});

		const progress = animation ? this.getAnimationProgress(animation) : 1;
		const alpha = animation?.preset === 'erase-x' ? 1 - progress : 0.6 + 0.4 * progress;
		const scale =
			animation?.preset === 'hypothesis' ||
			animation?.preset === 'mark-x' ||
			animation?.preset === 'queen-success'
				? 0.82 + 0.18 * progress
				: animation?.preset === 'erase-x'
					? 1 - 0.25 * progress
					: 1;

		marker.anchor.set(0.5);
		marker.alpha = alpha;
		marker.scale.set(scale);
		marker.x = x + this.layout.cellSize / 2;
		marker.y = y + this.layout.cellSize / 2;
		this.boardLayer.addChild(marker);
	}

	private drawChargeRing(cell: BoardCellView, x: number, y: number, chargeProgress: number): void {
		if (!this.layout || chargeProgress <= 0) return;
		const ring = new Graphics();
		ring.circle(
			x + this.layout.cellSize / 2,
			y + this.layout.cellSize / 2,
			this.layout.cellSize * 0.42
		);
		ring.stroke({
			color: PIXI_THEME.queen,
			width: 4,
			alpha: 0.4 + 0.6 * chargeProgress
		});
		ring.alpha = chargeProgress;
		this.boardLayer.addChild(ring);

		const preview = new Text({
			text: 'Q',
			style: {
				fontFamily: 'Inter, system-ui, sans-serif',
				fontSize: this.layout.cellSize * 0.26,
				fontWeight: '700',
				fill: PIXI_THEME.queen
			}
		});
		preview.anchor.set(0.5);
		preview.alpha = 0.25 + 0.5 * chargeProgress;
		preview.scale.set(0.75 + chargeProgress * 0.35);
		preview.x = x + this.layout.cellSize / 2;
		preview.y = y + this.layout.cellSize / 2;
		this.boardLayer.addChild(preview);
	}

	private handlePointerDown(cell: BoardCellView, event: FederatedPointerEvent): void {
		this.gesture = {
			index: cell.index,
			pointerId: event.pointerId,
			pointerType: event.pointerType,
			startedAt: performance.now(),
			startMark: cell.mark,
			paintMode: null,
			visited: new Set([cell.index]),
			longPressTriggered: false
		};
	}

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

		if (gesture.paintMode) return;
		if (gesture.longPressTriggered) return;
		if (gesture.pointerType === 'touch') {
			this.onEvent({ type: 'cycleCell', index: gesture.index });
			return;
		}

		const now = Date.now();
		if (
			this.lastMouseTap &&
			this.lastMouseTap.index === gesture.index &&
			now - this.lastMouseTap.time < 260
		) {
			this.clearPendingClick();
			this.lastMouseTap = null;
			this.onEvent({ type: 'confirmQueen', index: gesture.index });
			return;
		}

		this.lastMouseTap = { index: gesture.index, time: now };
		this.clickTimeout = setTimeout(() => {
			this.onEvent({ type: 'cycleCell', index: gesture.index });
		}, 180);
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

	private getMarkerText(mark: CellMark): string {
		switch (mark) {
			case 'x':
			case 'fixed-x':
				return '×';
			case 'hypothesis':
				return '△';
			case 'queen':
				return 'Q';
			default:
				return '';
		}
	}

	private getMarkerSize(mark: CellMark): number {
		switch (mark) {
			case 'queen':
				return 0.46;
			case 'hypothesis':
				return 0.44;
			default:
				return 0.56;
		}
	}

	private getMarkerColor(mark: CellMark, animation: CellAnimation | null): number {
		if (animation?.preset === 'queen-error') return PIXI_THEME.feedback;
		switch (mark) {
			case 'queen':
				return PIXI_THEME.queen;
			case 'hypothesis':
				return PIXI_THEME.accent ?? PIXI_THEME.text;
			case 'fixed-x':
				return 0x8a8a93;
			default:
				return PIXI_THEME.x;
		}
	}

	private getBorderColor(cell: BoardCellView, animation: CellAnimation | null): number {
		if (animation?.preset === 'queen-error') return PIXI_THEME.feedback;
		if (animation?.preset === 'queen-success') return PIXI_THEME.queen;
		if (cell.isHighlighted) {
			return this.viewModel?.selectionFeedback?.kind === 'success'
				? PIXI_THEME.solved
				: PIXI_THEME.feedback;
		}
		return PIXI_THEME.gridStroke;
	}

	private getCellAlpha(cell: BoardCellView, animation: CellAnimation | null): number {
		if (animation?.preset === 'queen-error') {
			return 0.9 + 0.1 * Math.sin(this.getAnimationProgress(animation) * Math.PI * 4);
		}
		if (cell.mark === 'fixed-x') return 0.96;
		return 0.9;
	}

	private getAnimation(index: number): CellAnimation | null {
		return this.animations.find((animation) => animation.index === index) ?? null;
	}

	private getAnimationProgress(animation: CellAnimation): number {
		return Math.min(1, (performance.now() - animation.startedAt) / animation.duration);
	}

	private getChargeProgressForCell(index: number): number {
		if (!this.gesture || this.gesture.index !== index || this.gesture.pointerType !== 'touch')
			return 0;
		if (this.gesture.paintMode || this.gesture.longPressTriggered) return 0;
		return this.getLongPressProgress(performance.now());
	}

	private getLongPressProgress(now: number): number {
		if (!this.gesture) return 0;
		return Math.min(1, (now - this.gesture.startedAt) / LONG_PRESS_MS);
	}

	private getShakeOffset(animation: CellAnimation): number {
		const progress = this.getAnimationProgress(animation);
		return Math.sin(progress * Math.PI * 8) * (1 - progress) * 7;
	}
}
