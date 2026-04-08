import { BOARD_PADDING } from '$lib/shared/config/pixi';

export interface BoardLayout {
	x: number;
	y: number;
	boardSize: number;
	cellSize: number;
}

export function computeBoardLayout(width: number, height: number, size: number): BoardLayout {
	const boardSize = Math.max(120, Math.min(width, height) - BOARD_PADDING * 2);
	const cellSize = boardSize / size;

	return {
		x: (width - boardSize) / 2,
		y: (height - boardSize) / 2,
		boardSize,
		cellSize
	};
}
