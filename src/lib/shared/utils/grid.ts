export function toIndex(row: number, col: number, size: number): number {
	return row * size + col;
}

export function toRowCol(index: number, size: number): { row: number; col: number } {
	return {
		row: Math.floor(index / size),
		col: index % size
	};
}

export function range(count: number): number[] {
	return Array.from({ length: count }, (_, index) => index);
}

export function getOrthogonalNeighbors(index: number, size: number): number[] {
	const { row, col } = toRowCol(index, size);
	const neighbors: number[] = [];

	if (row > 0) neighbors.push(toIndex(row - 1, col, size));
	if (row < size - 1) neighbors.push(toIndex(row + 1, col, size));
	if (col > 0) neighbors.push(toIndex(row, col - 1, size));
	if (col < size - 1) neighbors.push(toIndex(row, col + 1, size));

	return neighbors;
}

export function getAdjacentNeighbors(index: number, size: number): number[] {
	const { row, col } = toRowCol(index, size);
	const neighbors: number[] = [];

	for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
		for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
			if (rowOffset === 0 && colOffset === 0) continue;

			const nextRow = row + rowOffset;
			const nextCol = col + colOffset;

			if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) continue;
			neighbors.push(toIndex(nextRow, nextCol, size));
		}
	}

	return neighbors;
}
