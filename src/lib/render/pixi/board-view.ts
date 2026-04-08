import { isSolved } from '$lib/core/rules';
import type { BoardViewModel, SessionState } from '$lib/core/types';
import { toRowCol } from '$lib/shared/utils/grid';

export function buildBoardViewModel(session: SessionState): BoardViewModel {
	return {
		size: session.puzzle.size,
		regions: session.puzzle.regions,
		selectionFeedback: session.selectionFeedback,
		inputEnabled: true,
		solved: isSolved(session.puzzle, session.cells),
		message: session.selectionFeedback?.message ?? '탭으로 표시하고 길게 눌러 퀸을 확정하세요.',
		cells: session.cells.map((mark, index) => {
			const coord = toRowCol(index, session.puzzle.size);
			return {
				index,
				row: coord.row,
				col: coord.col,
				regionId: session.puzzle.regions[index],
				mark,
				isHighlighted: session.selectionFeedback?.cells.includes(index) ?? false
			};
		})
	};
}
