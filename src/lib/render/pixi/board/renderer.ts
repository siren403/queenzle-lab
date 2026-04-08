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
	| 'hypothesis-contradiction'
	| 'queen-success'
	| 'queen-error'
	| 'fixed-x-wave'
	| 'board-solved'
	| 'snapshot-saved';

interface CellAnimation {
	key: string;
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

interface CellRenderState {
	cell: BoardCellView;
	animation: CellAnimation | null;
	chargeProgress: number;
	x: number;
	y: number;
	elevated: boolean;
}

export class PixiBoardRenderer {
	private app: Application;
	private onEvent: (event: RendererEvent) => void;
	private host: HTMLElement;
	private rootLayer = new Container();
	private cellLayer = new Container();
	private effectLayer = new Container();
	private markerLayer = new Container();
	private topEffectLayer = new Container();
	private topMarkerLayer = new Container();
	private viewModel: BoardViewModel | null = null;
	private previousViewModel: BoardViewModel | null = null;
	private flags: FeatureFlags | null = null;
	private layout: BoardLayout | null = null;
	private gesture: GestureState | null = null;
	private clickTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastMouseTap: { index: number; time: number } | null = null;
	private animations = new Map<string, CellAnimation>();
	private lastFeedbackId: string | null = null;

	constructor(app: Application, host: HTMLElement, onEvent: (event: RendererEvent) => void) {
		this.app = app;
		this.host = host;
		this.onEvent = onEvent;

		this.rootLayer.addChild(this.cellLayer);
		this.rootLayer.addChild(this.effectLayer);
		this.rootLayer.addChild(this.markerLayer);
		this.rootLayer.addChild(this.topEffectLayer);
		this.rootLayer.addChild(this.topMarkerLayer);

		this.app.stage.addChild(this.rootLayer);
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
		this.layout = computeBoardLayout(
			Math.max(this.host.clientWidth, 1),
			Math.max(this.host.clientHeight, 1),
			viewModel.size
		);
		this.app.stage.hitArea = this.app.screen;
		this.syncAnimations();
		this.draw();
	}

	destroy(): void {
		this.app.stage.off('globalpointermove', this.handlePointerMove);
		this.app.stage.off('pointerup', this.handlePointerUp);
		this.app.stage.off('pointerupoutside', this.handlePointerUp);
		this.app.ticker.remove(this.tick);
		this.clearPendingClick();
	}

	private tick = (): void => {
		if (!this.viewModel || !this.layout) return;
		const now = performance.now();

		for (const [key, animation] of this.animations) {
			if (now - animation.startedAt > (animation.delay ?? 0) + animation.duration) {
				this.animations.delete(key);
			}
		}

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

		if (this.animations.size > 0 || this.gesture) {
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
			this.queueAnimation(
				this.createTransitionAnimation(cell.index, previous.mark, cell.mark, now, queens)
			);
		}

		const feedback = this.viewModel.selectionFeedback;
		if (feedback && feedback.id !== this.lastFeedbackId && feedback.animationPreset !== 'none') {
			const targets =
				feedback.cells.length > 0 ? feedback.cells : this.viewModel.cells.map((cell) => cell.index);
			for (const index of targets) {
				this.queueAnimation({
					key: `feedback:${index}`,
					index,
					preset: this.mapFeedbackPreset(feedback.animationPreset),
					startedAt: now,
					duration: this.getFeedbackDuration(feedback.animationPreset)
				});
			}
			this.lastFeedbackId = feedback.id;
		}
	}

	private queueAnimation(animation: CellAnimation): void {
		this.animations.set(animation.key, animation);
	}

	private createTransitionAnimation(
		index: number,
		previousMark: CellMark,
		nextMark: CellMark,
		startedAt: number,
		queens: Array<{ row: number; col: number }>
	): CellAnimation {
		if (previousMark === 'x' && nextMark === 'empty') {
			return {
				key: `transition:${index}`,
				index,
				preset: 'erase-x',
				startedAt,
				duration: 160,
				previousMark
			};
		}

		if (nextMark === 'hypothesis') {
			return {
				key: `transition:${index}`,
				index,
				preset: 'hypothesis',
				startedAt,
				duration: 180,
				previousMark
			};
		}

		if (nextMark === 'queen') {
			return {
				key: `transition:${index}`,
				index,
				preset: 'queen-success',
				startedAt,
				duration: 320,
				previousMark
			};
		}

		if (nextMark === 'fixed-x') {
			return {
				key: `transition:${index}`,
				index,
				preset: 'fixed-x-wave',
				startedAt,
				duration: 260,
				delay: this.getFixedXDelay(index, queens),
				previousMark
			};
		}

		return {
			key: `transition:${index}`,
			index,
			preset: 'mark-x',
			startedAt,
			duration: 140,
			previousMark
		};
	}

	private draw(): void {
		if (!this.viewModel || !this.layout) return;

		this.clearLayer(this.cellLayer);
		this.clearLayer(this.effectLayer);
		this.clearLayer(this.markerLayer);
		this.clearLayer(this.topEffectLayer);
		this.clearLayer(this.topMarkerLayer);

		const now = performance.now();
		const states = this.viewModel.cells.map((cell) => this.buildCellRenderState(cell, now));

		for (const state of states) {
			this.drawCellBase(state, now);
		}

		for (const state of states.filter((candidate) => !candidate.elevated)) {
			this.drawCellDecorations(state, now, this.effectLayer, this.markerLayer);
		}

		for (const state of states.filter((candidate) => candidate.elevated)) {
			this.drawCellDecorations(state, now, this.topEffectLayer, this.topMarkerLayer);
		}
	}

	private clearLayer(layer: Container): void {
		for (const child of layer.removeChildren()) {
			child.destroy();
		}
	}

	private buildCellRenderState(cell: BoardCellView, now: number): CellRenderState {
		const animations = this.getAnimations(cell.index, now);
		const animation = this.pickPrimaryAnimation(animations);
		const chargeProgress = this.getChargeProgressForCell(cell.index);
		const offsetX = animation?.preset === 'queen-error' ? this.getShakeOffset(animation, now) : 0;
		const offsetY =
			animation?.preset === 'queen-error' ? this.getShakeOffset(animation, now, true) : 0;
		const x = this.layout!.x + cell.col * this.layout!.cellSize + offsetX;
		const y = this.layout!.y + cell.row * this.layout!.cellSize + offsetY;

		return {
			cell,
			animation,
			chargeProgress,
			x,
			y,
			elevated:
				cell.isHighlighted ||
				chargeProgress > 0 ||
				animation?.preset === 'queen-error' ||
				animation?.preset === 'queen-success' ||
				animation?.preset === 'hypothesis-contradiction'
		};
	}

	private drawCellBase(state: CellRenderState, now: number): void {
		const { cell, animation, chargeProgress, x, y } = state;
		const baseColor =
			cell.mark === 'fixed-x' ? 0xe5e5ea : REGION_COLORS[cell.regionId % REGION_COLORS.length];
		const borderColor = this.getBorderColor(cell, animation);
		const cellOpacity = this.getCellAlpha(cell, animation, now);
		const scalePulse = this.getCellScale(animation, now);
		const transitionScale =
			animation &&
			(animation.preset === 'mark-x' ||
				animation.preset === 'hypothesis' ||
				animation.preset === 'queen-success')
				? 1 + 0.08 * (1 - this.getAnimationProgress(animation, now))
				: 1;
		const width =
			(this.layout!.cellSize - 2) * scalePulse * transitionScale * (1 + 0.04 * chargeProgress);
		const height =
			(this.layout!.cellSize - 2) * scalePulse * transitionScale * (1 + 0.04 * chargeProgress);

		const graphics = new Graphics();
		graphics
			.roundRect(
				x + (this.layout!.cellSize - width) / 2,
				y + (this.layout!.cellSize - height) / 2,
				width,
				height,
				14
			)
			.fill({ color: baseColor, alpha: cellOpacity })
			.stroke({
				color: borderColor,
				width:
					cell.isHighlighted ||
					animation?.preset === 'queen-error' ||
					animation?.preset === 'hypothesis-contradiction'
						? 4
						: 2
			});

		graphics.eventMode = 'static';
		graphics.cursor = 'pointer';
		graphics.on('pointerdown', (event) => this.handlePointerDown(cell, event));
		this.cellLayer.addChild(graphics);
	}

	private drawCellDecorations(
		state: CellRenderState,
		now: number,
		effectContainer: Container,
		markerContainer: Container
	): void {
		const { animation, chargeProgress, x, y } = state;

		if (animation?.preset === 'queen-error') {
			this.drawErrorTwin(effectContainer, x, y, animation, now);
		}
		if (animation?.preset === 'queen-success') {
			this.drawSuccessHalo(effectContainer, x, y, animation, now);
		}
		if (animation?.preset === 'fixed-x-wave') {
			this.drawFixedXWave(effectContainer, x, y, animation, now);
		}
		if (animation?.preset === 'board-solved') {
			this.drawSolvedWash(effectContainer, x, y, animation, now);
		}
		if (animation?.preset === 'hypothesis-contradiction') {
			this.drawContradictionPulse(effectContainer, x, y, animation, now);
		}

		this.drawChargeRing(effectContainer, x, y, chargeProgress);
		this.drawMarker(markerContainer, state, now);
	}

	private drawMarker(container: Container, state: CellRenderState, now: number): void {
		const { cell, animation, x, y } = state;
		const ghostErase = animation?.preset === 'erase-x' ? animation.previousMark : null;
		const markerMark = cell.mark === 'empty' && ghostErase ? ghostErase : cell.mark;
		if (markerMark === 'empty') return;

		const progress = animation ? this.getAnimationProgress(animation, now) : 1;
		const eased = this.easeOutBack(progress);
		const alpha =
			animation?.preset === 'erase-x'
				? 1 - progress
				: animation?.preset === 'queen-error'
					? 0.95
					: animation?.preset === 'hypothesis-contradiction'
						? 0.88 + 0.12 * Math.sin(progress * Math.PI * 2)
						: 0.64 + 0.36 * progress;
		const scale =
			animation?.preset === 'hypothesis' ||
			animation?.preset === 'mark-x' ||
			animation?.preset === 'queen-success' ||
			animation?.preset === 'fixed-x-wave'
				? 0.78 + 0.22 * eased
				: animation?.preset === 'erase-x'
					? 1 - 0.28 * progress
					: 1;

		const marker = this.createMarkerDisplay(markerMark, animation);
		marker.alpha = alpha;
		marker.scale.set(scale);
		marker.x = x + this.layout!.cellSize / 2;
		marker.y = y + this.layout!.cellSize / 2;
		container.addChild(marker);
	}

	private createMarkerDisplay(mark: CellMark, animation: CellAnimation | null): Container {
		const container = new Container();

		if (mark === 'queen') {
			const marker = new Text({
				text: 'Q',
				style: {
					fontFamily: 'Inter, system-ui, sans-serif',
					fontSize: this.layout!.cellSize * 0.44,
					fontWeight: '700',
					fill: this.getMarkerColor(mark, animation)
				}
			});
			marker.anchor.set(0.5);
			container.addChild(marker);
			return container;
		}

		const graphics = new Graphics();
		const stroke = {
			color: this.getMarkerColor(mark, animation),
			width: Math.max(2.75, this.layout!.cellSize * 0.062),
			cap: 'round' as const,
			join: 'round' as const
		};

		if (mark === 'x' || mark === 'fixed-x') {
			const arm = this.layout!.cellSize * 0.2;
			graphics.moveTo(-arm, -arm);
			graphics.lineTo(arm, arm);
			graphics.moveTo(arm, -arm);
			graphics.lineTo(-arm, arm);
			graphics.stroke(stroke);
			container.addChild(graphics);
			return container;
		}

		if (mark === 'hypothesis') {
			const arm = this.layout!.cellSize * 0.22;
			graphics.moveTo(0, -arm);
			graphics.lineTo(arm, arm * 0.82);
			graphics.lineTo(-arm, arm * 0.82);
			graphics.lineTo(0, -arm);
			graphics.stroke(stroke);
			container.addChild(graphics);
		}

		return container;
	}

	private drawChargeRing(container: Container, x: number, y: number, chargeProgress: number): void {
		if (!this.layout || chargeProgress <= 0) return;

		const ring = new Graphics();
		const radius = this.layout.cellSize * (0.34 + 0.08 * chargeProgress);
		ring.circle(x + this.layout.cellSize / 2, y + this.layout.cellSize / 2, radius);
		ring.stroke({
			color: PIXI_THEME.queen,
			width: 3 + 2 * chargeProgress,
			alpha: 0.28 + 0.72 * chargeProgress
		});
		ring.circle(x + this.layout.cellSize / 2, y + this.layout.cellSize / 2, radius * 0.72);
		ring.stroke({
			color: PIXI_THEME.accent ?? PIXI_THEME.queen,
			width: 2,
			alpha: 0.16 + 0.32 * chargeProgress
		});
		container.addChild(ring);

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
		container.addChild(preview);
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

	private getMarkerColor(mark: CellMark, animation: CellAnimation | null): number {
		if (animation?.preset === 'queen-error' || animation?.preset === 'hypothesis-contradiction') {
			return PIXI_THEME.feedback;
		}

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
		if (animation?.preset === 'queen-error' || animation?.preset === 'hypothesis-contradiction') {
			return PIXI_THEME.feedback;
		}
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
			return 0.84 + 0.16 * Math.sin(this.getAnimationProgress(animation, now) * Math.PI * 4);
		}
		if (animation?.preset === 'hypothesis-contradiction') {
			return 0.88 + 0.1 * Math.sin(this.getAnimationProgress(animation, now) * Math.PI * 2);
		}
		if (animation?.preset === 'fixed-x-wave') {
			return 0.88 + 0.12 * this.easeOutCubic(this.getAnimationProgress(animation, now));
		}
		if (animation?.preset === 'queen-success') {
			return 0.92 + 0.08 * this.easeOutCubic(this.getAnimationProgress(animation, now));
		}
		if (animation?.preset === 'board-solved') return 0.94;
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
			return 1 + 0.04 * (1 - progress);
		}
		if (animation.preset === 'board-solved') {
			return 1 + 0.02 * this.easeOutCubic(progress);
		}

		return 1;
	}

	private getAnimations(index: number, now: number): CellAnimation[] {
		return [...this.animations.values()].filter(
			(animation) => animation.index === index && this.isAnimationActive(animation, now)
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
				return 8;
			case 'queen-success':
				return 7;
			case 'hypothesis-contradiction':
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
		if (!this.gesture || this.gesture.index !== index || this.gesture.pointerType !== 'touch') {
			return 0;
		}
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
		const spread = vertical ? 4 : 6;
		return Math.sin(progress * Math.PI * 10 + phase) * damped * spread;
	}

	private drawErrorTwin(
		container: Container,
		x: number,
		y: number,
		animation: CellAnimation,
		now: number
	): void {
		const progress = this.getAnimationProgress(animation, now);
		const wobble = 1 + 0.05 * Math.sin(progress * Math.PI * 6);

		for (const direction of [-1, 1]) {
			const twin = new Graphics();
			const offset = direction * (6 - 3 * progress);
			twin
				.roundRect(
					x + offset + 4,
					y - offset * 0.45 + 4,
					this.layout!.cellSize - 8,
					this.layout!.cellSize - 8,
					12
				)
				.fill({ color: PIXI_THEME.feedback, alpha: 0.12 * (1 - progress) })
				.stroke({ color: PIXI_THEME.feedback, width: 2, alpha: 0.45 * (1 - progress) });
			twin.scale.set(wobble);
			container.addChild(twin);
		}
	}

	private drawSuccessHalo(
		container: Container,
		x: number,
		y: number,
		animation: CellAnimation,
		now: number
	): void {
		const progress = this.easeOutBack(this.getAnimationProgress(animation, now));
		const halo = new Graphics();
		halo.circle(
			x + this.layout!.cellSize / 2,
			y + this.layout!.cellSize / 2,
			this.layout!.cellSize * (0.24 + 0.2 * progress)
		);
		halo.stroke({
			color: PIXI_THEME.queen,
			width: 2 + 3 * progress,
			alpha: 0.34 * (1 - progress * 0.35)
		});
		container.addChild(halo);
	}

	private drawFixedXWave(
		container: Container,
		x: number,
		y: number,
		animation: CellAnimation,
		now: number
	): void {
		const progress = this.easeOutCubic(this.getAnimationProgress(animation, now));
		const wave = new Graphics();
		wave
			.roundRect(
				x + 5 + (1 - progress) * 4,
				y + 5 + (1 - progress) * 4,
				this.layout!.cellSize - 10 - (1 - progress) * 8,
				this.layout!.cellSize - 10 - (1 - progress) * 8,
				12
			)
			.fill({ color: 0xdedee6, alpha: 0.12 * (1 - progress) })
			.stroke({ color: 0x9f9fab, width: 2, alpha: 0.32 * (1 - progress) });
		container.addChild(wave);
	}

	private drawSolvedWash(
		container: Container,
		x: number,
		y: number,
		animation: CellAnimation,
		now: number
	): void {
		const progress = this.easeOutCubic(this.getAnimationProgress(animation, now));
		const wash = new Graphics();
		wash
			.roundRect(x + 3, y + 3, this.layout!.cellSize - 6, this.layout!.cellSize - 6, 12)
			.fill({ color: PIXI_THEME.solved, alpha: 0.08 * (1 - progress * 0.55) })
			.stroke({ color: PIXI_THEME.solved, width: 1.5, alpha: 0.25 * (1 - progress) });
		container.addChild(wash);
	}

	private drawContradictionPulse(
		container: Container,
		x: number,
		y: number,
		animation: CellAnimation,
		now: number
	): void {
		const progress = this.getAnimationProgress(animation, now);
		const pulse = 1 + 0.04 * Math.sin(progress * Math.PI * 4);
		const overlay = new Graphics();
		overlay
			.roundRect(
				x + 4,
				y + 4,
				(this.layout!.cellSize - 8) * pulse,
				(this.layout!.cellSize - 8) * pulse,
				12
			)
			.fill({ color: PIXI_THEME.feedback, alpha: 0.06 * (1 - progress * 0.35) })
			.stroke({ color: PIXI_THEME.feedback, width: 2, alpha: 0.45 * (1 - progress * 0.15) });
		overlay.x -= ((this.layout!.cellSize - 8) * pulse - (this.layout!.cellSize - 8)) / 2;
		overlay.y -= ((this.layout!.cellSize - 8) * pulse - (this.layout!.cellSize - 8)) / 2;
		container.addChild(overlay);
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
			case 'hypothesis':
				return 'hypothesis';
			case 'hypothesis-contradiction':
				return 'hypothesis-contradiction';
			case 'mark-x':
				return 'mark-x';
			case 'erase-x':
				return 'erase-x';
			default:
				return 'mark-x';
		}
	}

	private getFeedbackDuration(preset: AnimationPreset): number {
		switch (preset) {
			case 'queen-error':
				return 420;
			case 'queen-success':
				return 320;
			case 'board-solved':
				return 460;
			case 'snapshot-saved':
				return 220;
			case 'hypothesis':
				return 180;
			case 'hypothesis-contradiction':
				return 420;
			case 'mark-x':
			case 'erase-x':
				return 150;
			default:
				return 220;
		}
	}

	private getFixedXDelay(index: number, queens: Array<{ row: number; col: number }>): number {
		if (!this.viewModel || queens.length === 0) return 0;
		const cell = this.viewModel.cells[index];
		const distance = queens.reduce((closest, queen) => {
			const current = Math.abs(queen.row - cell.row) + Math.abs(queen.col - cell.col);
			return Math.min(closest, current);
		}, Number.POSITIVE_INFINITY);
		return Math.max(0, distance * 14);
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
