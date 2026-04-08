import { Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import type { BoardCellView, CellMark, SelectionFeedback } from '$lib/core/types';
import type { BoardLayout } from './layout';
import { PIXI_THEME, REGION_COLORS } from '../theme/palette';

export interface CellPresentation {
	cell: BoardCellView;
	layout: BoardLayout;
	basePriority: number;
	feedback: SelectionFeedback | null;
}

export interface CellMotionState {
	baseScale: number;
	baseAlpha: number;
	markerScale: number;
	markerAlpha: number;
	shakeX: number;
	shakeY: number;
	chargeProgress: number;
	successProgress: number;
	successAlpha: number;
	errorProgress: number;
	errorAlpha: number;
	waveProgress: number;
	waveAlpha: number;
	pulseProgress: number;
	pulseAlpha: number;
	washProgress: number;
	washAlpha: number;
	zBoost: number;
	borderWidthBoost: number;
}

export const DEFAULT_CELL_MOTION: CellMotionState = {
	baseScale: 1,
	baseAlpha: 1,
	markerScale: 1,
	markerAlpha: 1,
	shakeX: 0,
	shakeY: 0,
	chargeProgress: 0,
	successProgress: 0,
	successAlpha: 0,
	errorProgress: 0,
	errorAlpha: 0,
	waveProgress: 0,
	waveAlpha: 0,
	pulseProgress: 0,
	pulseAlpha: 0,
	washProgress: 0,
	washAlpha: 0,
	zBoost: 0,
	borderWidthBoost: 0
};

interface CellCallbacks {
	onPointerDown: (cell: BoardCellView, event: FederatedPointerEvent) => void;
	onPointerUp: (event: FederatedPointerEvent) => void;
}

export class CellView {
	readonly index: number;
	readonly root = new Container();
	readonly motion: CellMotionState = { ...DEFAULT_CELL_MOTION };

	private callbacks: CellCallbacks;
	private presentation: CellPresentation | null = null;
	private background = new Graphics();
	private errorTwin = new Graphics();
	private successHalo = new Graphics();
	private fixedWave = new Graphics();
	private contradictionPulse = new Graphics();
	private washOverlay = new Graphics();
	private chargeRing = new Graphics();
	private markerContainer = new Container();
	private markerGraphic = new Graphics();
	private queenLabel = new Text({
		text: 'Q',
		style: {
			fontFamily: 'Inter, system-ui, sans-serif',
			fontWeight: '700',
			fill: PIXI_THEME.queen,
			fontSize: 24
		}
	});
	private markerColorOverride: number | null = null;
	private borderColorOverride: number | null = null;
	private washColor = PIXI_THEME.solved;

	constructor(index: number, callbacks: CellCallbacks) {
		this.index = index;
		this.callbacks = callbacks;
		this.root.sortableChildren = false;
		this.root.eventMode = 'passive';

		this.background.eventMode = 'static';
		this.background.cursor = 'pointer';
		this.background.on('pointerdown', (event) => {
			if (!this.presentation) return;
			this.callbacks.onPointerDown(this.presentation.cell, event);
		});
		this.background.on('pointerup', this.callbacks.onPointerUp);
		this.background.on('pointerupoutside', this.callbacks.onPointerUp);

		this.errorTwin.eventMode = 'none';
		this.successHalo.eventMode = 'none';
		this.fixedWave.eventMode = 'none';
		this.contradictionPulse.eventMode = 'none';
		this.washOverlay.eventMode = 'none';
		this.chargeRing.eventMode = 'none';
		this.markerContainer.eventMode = 'none';
		this.markerGraphic.eventMode = 'none';
		this.queenLabel.eventMode = 'none';
		this.queenLabel.anchor.set(0.5);

		this.markerContainer.addChild(this.markerGraphic);
		this.markerContainer.addChild(this.queenLabel);
		this.root.addChild(this.background);
		this.root.addChild(this.washOverlay);
		this.root.addChild(this.fixedWave);
		this.root.addChild(this.contradictionPulse);
		this.root.addChild(this.errorTwin);
		this.root.addChild(this.successHalo);
		this.root.addChild(this.chargeRing);
		this.root.addChild(this.markerContainer);
	}

	setPresentation(presentation: CellPresentation): void {
		this.presentation = presentation;
		this.refresh();
	}

	setMarkerColorOverride(color: number | null): void {
		this.markerColorOverride = color;
		this.refresh();
	}

	setBorderColorOverride(color: number | null): void {
		this.borderColorOverride = color;
		this.refresh();
	}

	setWashColor(color: number): void {
		this.washColor = color;
		this.refresh();
	}

	resetTransitionMotion(): void {
		this.motion.baseScale = 1;
		this.motion.baseAlpha = 1;
		this.motion.markerScale = 1;
		this.motion.markerAlpha = 1;
		this.motion.zBoost = 0;
	}

	resetFeedbackMotion(): void {
		this.motion.successProgress = 0;
		this.motion.successAlpha = 0;
		this.motion.errorProgress = 0;
		this.motion.errorAlpha = 0;
		this.motion.waveProgress = 0;
		this.motion.waveAlpha = 0;
		this.motion.pulseProgress = 0;
		this.motion.pulseAlpha = 0;
		this.motion.washProgress = 0;
		this.motion.washAlpha = 0;
		this.motion.shakeX = 0;
		this.motion.shakeY = 0;
		this.motion.borderWidthBoost = 0;
		this.motion.zBoost = 0;
		this.markerColorOverride = null;
		this.borderColorOverride = null;
		this.washColor = PIXI_THEME.solved;
	}

	resetChargeMotion(): void {
		this.motion.chargeProgress = 0;
	}

	resetAllMotion(): void {
		Object.assign(this.motion, DEFAULT_CELL_MOTION);
		this.markerColorOverride = null;
		this.borderColorOverride = null;
		this.washColor = PIXI_THEME.solved;
		this.refresh();
	}

	refresh(): void {
		if (!this.presentation) return;

		const { cell, layout, basePriority, feedback } = this.presentation;
		const cellSize = layout.cellSize;
		const baseColor =
			cell.mark === 'fixed-x' ? 0xe5e5ea : REGION_COLORS[cell.regionId % REGION_COLORS.length];
		const borderColor = this.resolveBorderColor(cell, feedback);
		const borderWidth = (cell.isHighlighted ? 4 : 2) + this.motion.borderWidthBoost;
		const baseScale = this.motion.baseScale * (1 + 0.04 * this.motion.chargeProgress);
		const baseWidth = (cellSize - 2) * baseScale;
		const baseHeight = (cellSize - 2) * baseScale;
		const alpha = this.resolveBaseAlpha(cell);

		this.root.x = layout.x + cell.col * cellSize + this.motion.shakeX;
		this.root.y = layout.y + cell.row * cellSize + this.motion.shakeY;
		this.root.zIndex = basePriority + this.motion.zBoost;

		this.background
			.clear()
			.roundRect((cellSize - baseWidth) / 2, (cellSize - baseHeight) / 2, baseWidth, baseHeight, 14)
			.fill({ color: baseColor, alpha })
			.stroke({ color: borderColor, width: borderWidth });

		this.drawWashOverlay(cellSize);
		this.drawFixedWave(cellSize);
		this.drawContradiction(cellSize);
		this.drawErrorTwin(cellSize);
		this.drawSuccessHalo(cellSize);
		this.drawChargeRing(cellSize);
		this.drawMarker(cellSize, cell);
	}

	destroy(): void {
		this.root.destroy({ children: true });
	}

	private resolveBaseAlpha(cell: BoardCellView): number {
		if (cell.mark === 'fixed-x') {
			return 0.98 * this.motion.baseAlpha;
		}
		return 0.9 * this.motion.baseAlpha;
	}

	private resolveBorderColor(cell: BoardCellView, feedback: SelectionFeedback | null): number {
		if (this.borderColorOverride !== null) return this.borderColorOverride;
		if (cell.isHighlighted && feedback) {
			return feedback.kind === 'success' ? PIXI_THEME.solved : PIXI_THEME.feedback;
		}
		return PIXI_THEME.gridStroke;
	}

	private resolveMarkerColor(mark: CellMark): number {
		if (this.markerColorOverride !== null) return this.markerColorOverride;

		switch (mark) {
			case 'queen':
				return PIXI_THEME.queen;
			case 'hypothesis':
				return PIXI_THEME.accent;
			case 'fixed-x':
				return 0x8a8a93;
			default:
				return PIXI_THEME.x;
		}
	}

	private drawMarker(cellSize: number, cell: BoardCellView): void {
		const mark = cell.mark;
		const isVisible = mark !== 'empty';
		this.markerContainer.visible = isVisible;
		if (!isVisible) return;

		const color = this.resolveMarkerColor(mark);
		this.markerContainer.x = cellSize / 2;
		this.markerContainer.y = cellSize / 2;
		this.markerContainer.alpha = this.motion.markerAlpha;
		this.markerContainer.scale.set(this.motion.markerScale);

		this.markerGraphic.clear();
		this.queenLabel.visible = mark === 'queen';
		this.queenLabel.style.fill = color;
		this.queenLabel.style.fontSize = cellSize * 0.44;
		this.queenLabel.alpha = 1;

		if (mark === 'queen') {
			return;
		}

		const stroke = {
			color,
			width: Math.max(2.75, cellSize * 0.062),
			cap: 'round' as const,
			join: 'round' as const
		};

		if (mark === 'x' || mark === 'fixed-x') {
			const arm = cellSize * 0.2;
			this.markerGraphic.moveTo(-arm, -arm);
			this.markerGraphic.lineTo(arm, arm);
			this.markerGraphic.moveTo(arm, -arm);
			this.markerGraphic.lineTo(-arm, arm);
			this.markerGraphic.stroke(stroke);
			return;
		}

		if (mark === 'hypothesis') {
			const arm = cellSize * 0.22;
			this.markerGraphic.moveTo(0, -arm);
			this.markerGraphic.lineTo(arm, arm * 0.82);
			this.markerGraphic.lineTo(-arm, arm * 0.82);
			this.markerGraphic.lineTo(0, -arm);
			this.markerGraphic.stroke(stroke);
		}
	}

	private drawChargeRing(cellSize: number): void {
		const progress = this.motion.chargeProgress;
		this.chargeRing.clear();
		if (progress <= 0) return;

		const center = cellSize / 2;
		const radius = cellSize * (0.34 + 0.08 * progress);
		this.chargeRing.circle(center, center, radius);
		this.chargeRing.stroke({
			color: PIXI_THEME.queen,
			width: 3 + 2 * progress,
			alpha: 0.28 + 0.72 * progress
		});
		this.chargeRing.circle(center, center, radius * 0.72);
		this.chargeRing.stroke({
			color: PIXI_THEME.accent,
			width: 2,
			alpha: 0.16 + 0.32 * progress
		});

		this.queenLabel.visible ||= false;
	}

	private drawSuccessHalo(cellSize: number): void {
		const alpha = this.motion.successAlpha;
		this.successHalo.clear();
		if (alpha <= 0) return;

		this.successHalo.circle(
			cellSize / 2,
			cellSize / 2,
			cellSize * (0.24 + 0.2 * this.motion.successProgress)
		);
		this.successHalo.stroke({
			color: PIXI_THEME.queen,
			width: 2 + 3 * this.motion.successProgress,
			alpha
		});
	}

	private drawErrorTwin(cellSize: number): void {
		const alpha = this.motion.errorAlpha;
		this.errorTwin.clear();
		if (alpha <= 0) return;

		for (const direction of [-1, 1]) {
			const offset = direction * (6 - 3 * this.motion.errorProgress);
			this.errorTwin
				.roundRect(offset + 4, -offset * 0.45 + 4, cellSize - 8, cellSize - 8, 12)
				.fill({ color: PIXI_THEME.feedback, alpha: 0.12 * alpha })
				.stroke({ color: PIXI_THEME.feedback, width: 2, alpha: 0.45 * alpha });
		}
	}

	private drawFixedWave(cellSize: number): void {
		const alpha = this.motion.waveAlpha;
		this.fixedWave.clear();
		if (alpha <= 0) return;

		const inset = 5 + (1 - this.motion.waveProgress) * 4;
		this.fixedWave
			.roundRect(
				inset,
				inset,
				Math.max(0, cellSize - inset * 2),
				Math.max(0, cellSize - inset * 2),
				12
			)
			.fill({ color: 0xdedee6, alpha: 0.12 * alpha })
			.stroke({ color: 0x9f9fab, width: 2, alpha: 0.32 * alpha });
	}

	private drawContradiction(cellSize: number): void {
		const alpha = this.motion.pulseAlpha;
		this.contradictionPulse.clear();
		if (alpha <= 0) return;

		const pulse = 1 + 0.04 * this.motion.pulseProgress;
		const side = cellSize - 8;
		const scaledSide = side * pulse;
		const offset = (scaledSide - side) / 2;
		this.contradictionPulse
			.roundRect(4 - offset, 4 - offset, scaledSide, scaledSide, 12)
			.fill({ color: PIXI_THEME.feedback, alpha: 0.06 * alpha })
			.stroke({ color: PIXI_THEME.feedback, width: 2, alpha: 0.45 * alpha });
	}

	private drawWashOverlay(cellSize: number): void {
		const alpha = this.motion.washAlpha;
		this.washOverlay.clear();
		if (alpha <= 0) return;

		this.washOverlay
			.roundRect(3, 3, cellSize - 6, cellSize - 6, 12)
			.fill({ color: this.washColor, alpha: 0.08 * alpha })
			.stroke({ color: this.washColor, width: 1.5, alpha: 0.25 * alpha });
	}
}
