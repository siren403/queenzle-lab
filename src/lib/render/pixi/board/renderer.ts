import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import type { BoardViewModel, FeatureFlags, RendererEvent } from '$lib/core/types';
import { computeBoardLayout, type BoardLayout } from './layout';
import { PIXI_THEME, REGION_COLORS } from '../theme/palette';

interface DragState {
	active: boolean;
	visited: Set<number>;
	lastIndex: number | null;
}

export class PixiBoardRenderer {
	private app: Application;
	private onEvent: (event: RendererEvent) => void;
	private boardLayer = new Container();
	private host: HTMLElement;
	private viewModel: BoardViewModel | null = null;
	private flags: FeatureFlags | null = null;
	private layout: BoardLayout | null = null;
	private dragState: DragState = { active: false, visited: new Set<number>(), lastIndex: null };
	private clickTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastTap: { index: number; time: number } | null = null;

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
	}

	update(viewModel: BoardViewModel, flags: FeatureFlags): void {
		this.viewModel = viewModel;
		this.flags = flags;
		this.layout = computeBoardLayout(this.host.clientWidth, this.host.clientHeight, viewModel.size);
		this.draw();
	}

	destroy(): void {
		this.app.stage.off('globalpointermove', this.handlePointerMove);
		this.app.stage.off('pointerup', this.handlePointerUp);
		this.app.stage.off('pointerupoutside', this.handlePointerUp);
		if (this.clickTimeout) clearTimeout(this.clickTimeout);
	}

	private draw(): void {
		if (!this.viewModel || !this.layout) return;
		this.boardLayer.removeChildren();

		for (const cell of this.viewModel.cells) {
			const graphics = new Graphics();
			const x = this.layout.x + cell.col * this.layout.cellSize;
			const y = this.layout.y + cell.row * this.layout.cellSize;
			const baseColor = REGION_COLORS[cell.regionId % REGION_COLORS.length];
			const borderColor = cell.isHighlighted
				? this.viewModel.selectionFeedback?.severity === 'success'
					? PIXI_THEME.solved
					: PIXI_THEME.feedback
				: PIXI_THEME.gridStroke;

			graphics
				.roundRect(x, y, this.layout.cellSize - 2, this.layout.cellSize - 2, 14)
				.fill({ color: baseColor, alpha: 0.9 })
				.stroke({ color: borderColor, width: cell.isHighlighted ? 4 : 2 });

			graphics.eventMode = 'static';
			graphics.cursor = 'pointer';
			graphics.on('pointerdown', () => this.handlePointerDown(cell.index));
			this.boardLayer.addChild(graphics);

			if (cell.mark === 'empty') continue;
			const marker = new Text({
				text: cell.mark === 'queen' ? 'Q' : '×',
				style: {
					fontFamily: 'Inter, system-ui, sans-serif',
					fontSize: this.layout.cellSize * (cell.mark === 'queen' ? 0.46 : 0.56),
					fontWeight: '700',
					fill: cell.mark === 'queen' ? PIXI_THEME.queen : PIXI_THEME.x
				}
			});

			marker.anchor.set(0.5);
			marker.x = x + this.layout.cellSize / 2;
			marker.y = y + this.layout.cellSize / 2;
			this.boardLayer.addChild(marker);
		}
	}

	private handlePointerDown(index: number): void {
		this.dragState = {
			active: true,
			visited: new Set([index]),
			lastIndex: index
		};
	}

	private handlePointerMove = (event: FederatedPointerEvent): void => {
		if (!this.dragState.active || !this.layout || !this.viewModel || !this.flags?.dragMarking)
			return;
		const index = this.resolveCellIndex(event.global.x, event.global.y);
		if (index === null || this.dragState.visited.has(index)) return;
		this.dragState.visited.add(index);
		this.dragState.lastIndex = index;
	};

	private handlePointerUp = (): void => {
		if (!this.dragState.active) return;
		const visited = [...this.dragState.visited];
		this.dragState = { active: false, visited: new Set<number>(), lastIndex: null };

		if (visited.length > 1 && this.flags?.dragMarking) {
			this.clearPendingClick();
			this.onEvent({ type: 'dragCells', indices: visited });
			return;
		}

		const index = visited[0];
		if (index === undefined) return;
		const now = Date.now();

		if (this.lastTap && this.lastTap.index === index && now - this.lastTap.time < 260) {
			this.clearPendingClick();
			this.lastTap = null;
			this.onEvent({ type: 'doubleClickCell', index });
			return;
		}

		this.lastTap = { index, time: now };
		this.clickTimeout = setTimeout(() => {
			this.onEvent({ type: 'clickCell', index });
		}, 200);
	};

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
}
