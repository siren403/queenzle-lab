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

type RenderEffect =
	| 'mark-x'
	| 'erase-x'
	| 'hypothesis'
	| 'queen-success'
	| 'queen-error'
	| 'fixed-x-wave'
	| 'board-solved'
	| 'snapshot-saved';

interface CellAnimation {
	index: number;
	preset: RenderEffect;
	startedAt: number;
	duration: number;
	delay?: number;
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
			(animation) => now - animation.startedAt <= (animation.delay ?? 0) + animation.duration
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
		const queens = this.viewModel.cells
			.filter((cell) => cell.mark === 'queen')
			.map((cell) => ({ row: cell.row, col: cell.col }));

		for (const cell of this.viewModel.cells) {
			const previous = previousCells[cell.index];
			if (!previous || previous.mark === cell.mark) continue;
			this.animations.push(
				this.createTransitionAnimation(cell.index, previous.mark, cell.mark, now, queens)
			);
		}

		const feedback = this.viewModel.selectionFeedback;
		if (feedback && feedback.id !== this.lastFeedbackId && feedback.animationPreset !== 'none') {
			const targets =
				feedback.cells.length > 0 ? feedback.cells : this.viewModel.cells.map((cell) => cell.index);
			for (const index of targets) {
				this.animations.push({
					index,
					preset: this.mapFeedbackPreset(feedback.animationPreset),
					startedAt: now,
					duration: this.getFeedbackDuration(feedback.animationPreset)
				});
			}
			this.lastFeedbackId = feedback.id;
		}
	}

	private createTransitionAnimation(
		index: number,
		previousMark: CellMark,
		nextMark: CellMark,
		startedAt: number,
		queens: Array<{ row: number; col: number }>
	): CellAnimation {
		if (previousMark === 'x' && nextMark === 'empty') {
			return { index, preset: 'erase-x', startedAt, duration: 220, previousMark };
		}
		if (nextMark === 'hypothesis') {
			return { index, preset: 'hypothesis', startedAt, duration: 260, previousMark };
		}
		if (nextMark === 'queen') {
			return { index, preset: 'queen-success', startedAt, duration: 420, previousMark };
		}
		if (nextMark === 'fixed-x') {
			return {
				index,
				preset: 'fixed-x-wave',
				startedAt,
				duration: 320,
				delay: this.getFixedXDelay(index, queens),
				previousMark
			};
		}
		return { index, preset: 'mark-x', startedAt, duration: 220, previousMark };
	}

	private draw(): void {
		if (!this.viewModel || !this.layout) return;
		const now = performance.now();
		for (const child of this.boardLayer.removeChildren()) {
			child.destroy();
		}

		for (const cell of this.viewModel.cells) {
			this.drawCell(cell, now);
		}
	}

	private drawCell(cell: BoardCellView, now: number): void {
		if (!this.layout || !this.viewModel) return;
		const animations = this.getAnimations(cell.index, now);
		const primaryAnimation = this.pickPrimaryAnimation(animations);
		const chargeProgress = this.getChargeProgressForCell(cell.index);
		const offsetX =
			primaryAnimation?.preset === 'queen-error' ? this.getShakeOffset(primaryAnimation, now) : 0;
		const offsetY =
			primaryAnimation?.preset === 'queen-error'
				? this.getShakeOffset(primaryAnimation, now, true)
				: 0;
		const x = this.layout.x + cell.col * this.layout.cellSize + offsetX;
		const y = this.layout.y + cell.row * this.layout.cellSize + offsetY;
		const baseColor =
			cell.mark === 'fixed-x' ? 0xe5e5ea : REGION_COLORS[cell.regionId % REGION_COLORS.length];
		const borderColor = this.getBorderColor(cell, primaryAnimation);
		const cellOpacity = this.getCellAlpha(cell, primaryAnimation, now);
		const scalePulse = this.getCellScale(primaryAnimation, now);
		const scaleBoost =
			(primaryAnimation?.preset === 'mark-x' ||
				primaryAnimation?.preset === 'hypothesis' ||
				primaryAnimation?.preset === 'queen-success') &&
			primaryAnimation
				? (1 + 0.1 * (1 - this.getAnimationProgress(primaryAnimation, now))) * scalePulse
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
			.fill({ color: baseColor, alpha: cellOpacity })
			.stroke({
				color: borderColor,
				width: cell.isHighlighted || primaryAnimation?.preset === 'queen-error' ? 4 : 2
			});

		graphics.eventMode = 'static';
		graphics.cursor = 'pointer';
		graphics.on('pointerdown', (event) => this.handlePointerDown(cell, event));
		this.boardLayer.addChild(graphics);

		if (primaryAnimation?.preset === 'queen-error') {
			this.drawErrorTwin(x, y, primaryAnimation, now);
		}
		if (primaryAnimation?.preset === 'queen-success') {
			this.drawSuccessHalo(x, y, primaryAnimation, now);
		}
		if (primaryAnimation?.preset === 'fixed-x-wave') {
			this.drawFixedXWave(x, y, primaryAnimation, now);
		}
		if (primaryAnimation?.preset === 'board-solved') {
			this.drawSolvedWash(x, y, primaryAnimation, now);
		}

		this.drawChargeRing(x, y, chargeProgress);
		this.drawMarker(cell, x, y, primaryAnimation, now);
	}

	private drawMarker(
		cell: BoardCellView,
		x: number,
		y: number,
		animation: CellAnimation | null,
		now: number
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

		const progress = animation ? this.getAnimationProgress(animation, now) : 1;
		const eased = this.easeOutBack(progress);
		const alpha =
			animation?.preset === 'erase-x'
				? 1 - progress
				: animation?.preset === 'queen-error'
					? 0.9
					: 0.6 + 0.4 * progress;
		const scale =
			animation?.preset === 'hypothesis' ||
			animation?.preset === 'mark-x' ||
			animation?.preset === 'queen-success' ||
			animation?.preset === 'fixed-x-wave'
				? 0.76 + 0.24 * eased
				: animation?.preset === 'erase-x'
					? 1 - 0.25 * progress
					: animation?.preset === 'queen-error'
						? 1 + 0.03 * Math.sin(progress * Math.PI * 4)
						: 1;

		marker.anchor.set(0.5);
		marker.alpha = alpha;
		marker.scale.set(scale);
		marker.x = x + this.layout.cellSize / 2;
		marker.y =
			y +
			this.layout.cellSize / 2 +
			(animation?.preset === 'queen-error' ? this.getShakeOffset(animation, now, true) * 0.35 : 0);
		this.boardLayer.addChild(marker);
	}

	private drawChargeRing(x: number, y: number, chargeProgress: number): void {
		if (!this.layout || chargeProgress <= 0) return;
		const ring = new Graphics();
		const radius = this.layout.cellSize * (0.34 + 0.08 * chargeProgress);
		ring.circle(x + this.layout.cellSize / 2, y + this.layout.cellSize / 2, radius);
		ring.stroke({
			color: PIXI_THEME.queen,
			width: 3 + 2 * chargeProgress,
			alpha: 0.3 + 0.7 * chargeProgress
		});
		ring.circle(x + this.layout.cellSize / 2, y + this.layout.cellSize / 2, radius * 0.72);
		ring.stroke({
			color: PIXI_THEME.accent ?? PIXI_THEME.queen,
			width: 2,
			alpha: 0.18 + 0.32 * chargeProgress
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
		preview.alpha = 0.2 + 0.6 * chargeProgress;
		preview.scale.set(0.7 + chargeProgress * 0.42);
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

	private getCellAlpha(cell: BoardCellView, animation: CellAnimation | null, now: number): number {
		if (animation?.preset === 'queen-error') {
			return 0.86 + 0.14 * Math.sin(this.getAnimationProgress(animation, now) * Math.PI * 4);
		}
		if (animation?.preset === 'fixed-x-wave') {
			return 0.88 + 0.12 * this.easeOutCubic(this.getAnimationProgress(animation, now));
		}
		if (animation?.preset === 'queen-success') {
			return 0.92 + 0.08 * this.easeOutCubic(this.getAnimationProgress(animation, now));
		}
		if (animation?.preset === 'board-solved') {
			return 0.94;
		}
		if (cell.mark === 'fixed-x') return 0.98;
		return 0.9;
	}

	private getCellScale(animation: CellAnimation | null, now: number): number {
		if (!animation) return 1;
		const progress = this.getAnimationProgress(animation, now);
		if (animation.preset === 'queen-error') {
			return 1 + 0.02 * Math.sin(progress * Math.PI * 6);
		}
		if (animation.preset === 'fixed-x-wave') {
			return 1 + 0.06 * this.easeOutBack(progress);
		}
		if (animation.preset === 'board-solved') {
			return 1 + 0.03 * this.easeOutCubic(progress);
		}
		return 1;
	}

	private getAnimations(index: number, now: number): CellAnimation[] {
		return this.animations.filter(
			(animation) => this.isAnimationActive(animation, now) && animation.index === index
		);
	}

	private pickPrimaryAnimation(animations: CellAnimation[]): CellAnimation | null {
		if (animations.length === 0) return null;
		return (
			[...animations].sort(
				(left, right) =>
					this.getAnimationPriority(right.preset) - this.getAnimationPriority(left.preset)
			)[0] ?? null
		);
	}

	private getAnimationPriority(effect: RenderEffect): number {
		switch (effect) {
			case 'queen-error':
				return 7;
			case 'queen-success':
				return 6;
			case 'fixed-x-wave':
				return 5;
			case 'board-solved':
				return 4;
			case 'snapshot-saved':
				return 3;
			case 'hypothesis':
				return 2;
			case 'mark-x':
				return 1;
			case 'erase-x':
				return 1;
			default:
				return 0;
		}
	}

	private isAnimationActive(animation: CellAnimation, now: number): boolean {
		return (
			now - animation.startedAt >= (animation.delay ?? 0) &&
			now - animation.startedAt <= (animation.delay ?? 0) + animation.duration
		);
	}

	private getAnimationProgress(animation: CellAnimation, now: number): number {
		const elapsed = now - animation.startedAt - (animation.delay ?? 0);
		return this.clamp01(elapsed / animation.duration);
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

	private getShakeOffset(animation: CellAnimation, now: number, vertical = false): number {
		const progress = this.getAnimationProgress(animation, now);
		const damped = (1 - progress) * (1 - progress);
		const phase = vertical ? Math.PI / 2 : 0;
		const spread = vertical ? 5 : 7;
		return Math.sin(progress * Math.PI * 10 + phase) * damped * spread;
	}

	private drawErrorTwin(x: number, y: number, animation: CellAnimation, now: number): void {
		if (!this.layout) return;
		const progress = this.getAnimationProgress(animation, now);
		const wobble = 1 + 0.08 * Math.sin(progress * Math.PI * 6);
		for (const direction of [-1, 1]) {
			const twin = new Graphics();
			const offset = direction * (6 - 3 * progress);
			twin
				.roundRect(
					x + offset + 4,
					y - offset * 0.45 + 4,
					this.layout.cellSize - 8,
					this.layout.cellSize - 8,
					12
				)
				.fill({ color: PIXI_THEME.feedback, alpha: 0.12 * (1 - progress) })
				.stroke({ color: PIXI_THEME.feedback, width: 2, alpha: 0.5 * (1 - progress) });
			twin.scale.set(wobble);
			this.boardLayer.addChild(twin);
		}
	}

	private drawSuccessHalo(x: number, y: number, animation: CellAnimation, now: number): void {
		if (!this.layout) return;
		const progress = this.easeOutBack(this.getAnimationProgress(animation, now));
		const halo = new Graphics();
		halo.circle(
			x + this.layout.cellSize / 2,
			y + this.layout.cellSize / 2,
			this.layout.cellSize * (0.24 + 0.22 * progress)
		);
		halo.stroke({
			color: PIXI_THEME.queen,
			width: 2 + 3 * progress,
			alpha: 0.35 * (1 - progress * 0.35)
		});
		halo.alpha = 0.7 * (1 - progress * 0.25);
		this.boardLayer.addChild(halo);
	}

	private drawFixedXWave(x: number, y: number, animation: CellAnimation, now: number): void {
		if (!this.layout) return;
		const progress = this.easeOutCubic(this.getAnimationProgress(animation, now));
		const wave = new Graphics();
		wave
			.roundRect(
				x + 5 + (1 - progress) * 4,
				y + 5 + (1 - progress) * 4,
				this.layout.cellSize - 10 - (1 - progress) * 8,
				this.layout.cellSize - 10 - (1 - progress) * 8,
				12
			)
			.fill({ color: 0xdedee6, alpha: 0.12 * (1 - progress) })
			.stroke({ color: 0x9f9fab, width: 2, alpha: 0.35 * (1 - progress) });
		this.boardLayer.addChild(wave);
	}

	private drawSolvedWash(x: number, y: number, animation: CellAnimation, now: number): void {
		if (!this.layout) return;
		const progress = this.easeOutCubic(this.getAnimationProgress(animation, now));
		const wash = new Graphics();
		wash
			.roundRect(x + 3, y + 3, this.layout.cellSize - 6, this.layout.cellSize - 6, 12)
			.fill({ color: PIXI_THEME.solved, alpha: 0.08 * (1 - progress * 0.55) })
			.stroke({ color: PIXI_THEME.solved, width: 1.5, alpha: 0.25 * (1 - progress) });
		this.boardLayer.addChild(wash);
	}

	private mapFeedbackPreset(preset: AnimationPreset): RenderEffect {
		switch (preset) {
			case 'queen-error':
				return 'queen-error';
			case 'queen-success':
				return 'queen-success';
			case 'board-solved':
				return 'board-solved';
			case 'snapshot-saved':
				return 'snapshot-saved';
			case 'mark-x':
				return 'mark-x';
			case 'erase-x':
				return 'erase-x';
			case 'hypothesis':
				return 'hypothesis';
			default:
				return 'mark-x';
		}
	}

	private getFeedbackDuration(preset: AnimationPreset): number {
		switch (preset) {
			case 'queen-error':
				return 480;
			case 'queen-success':
				return 420;
			case 'board-solved':
				return 540;
			case 'snapshot-saved':
				return 260;
			case 'hypothesis':
				return 260;
			case 'mark-x':
			case 'erase-x':
				return 220;
			default:
				return 240;
		}
	}

	private getFixedXDelay(index: number, queens: Array<{ row: number; col: number }>): number {
		if (!this.viewModel || queens.length === 0) return 0;
		const cell = this.viewModel.cells[index];
		const distance = queens.reduce((closest, queen) => {
			const current = Math.abs(queen.row - cell.row) + Math.abs(queen.col - cell.col);
			return Math.min(closest, current);
		}, Number.POSITIVE_INFINITY);
		return Math.max(0, distance * 18);
	}

	private easeOutCubic(value: number): number {
		return 1 - Math.pow(1 - this.clamp01(value), 3);
	}

	private easeOutBack(value: number): number {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		const t = this.clamp01(value) - 1;
		return 1 + c3 * t * t * t + c1 * t * t;
	}

	private clamp01(value: number): number {
		return Math.max(0, Math.min(1, value));
	}
}
