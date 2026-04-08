<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { applyCommand, createSessionState, resolvePuzzle } from '$lib/core/state';
	import { loadSession, saveSession } from '$lib/core/persistence';
	import type {
		FeatureFlags,
		PresetId,
		PuzzleSize,
		RendererEvent,
		SessionState
	} from '$lib/core/types';
	import { buildBoardViewModel } from '$lib/render/pixi/board-view';
	import PixiBoard from '$lib/ui/components/PixiBoard.svelte';
	import { FEATURE_LABELS, getPresetFlags, PRESET_LABELS, PRESETS } from '$lib/ui/presets';
	import { buildLabQuery, getRandomSeed, parseLabQuery } from '$lib/ui/stores/lab-query';

	let selectedSize = $state<PuzzleSize>(5);
	let selectedSeed = $state(5103);
	let seedInput = $state('5103');
	let selectedPreset = $state<PresetId>('modern-minimal');
	let session = $state<SessionState | null>(null);
	let panelOpen = $state(false);

	const viewModel = $derived(session ? buildBoardViewModel(session) : null);
	const canUndo = $derived((session?.history.past.length ?? 0) > 0);
	const canRedo = $derived((session?.history.future.length ?? 0) > 0);
	const sourceLabel = $derived(session?.puzzle.source === 'catalog' ? '검증된 시드' : '생성 시도');
	const statusLabel = $derived(viewModel?.solved ? '해결 완료' : '진행 중');
	const boardHint = $derived(
		session?.flags.hypothesisMarker
			? '탭: 없음 → X → 가설 · 길게 누르기: 퀸 확정'
			: '탭: 없음 → X · 길게 누르기: 퀸 확정'
	);

	function formatSavedAt(savedAt: string): string {
		return new Intl.DateTimeFormat('ko-KR', {
			month: 'numeric',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(savedAt));
	}

	function syncUrl(): void {
		const query = buildLabQuery({
			size: selectedSize,
			seed: selectedSeed,
			preset: selectedPreset
		}).toString();

		void goto(resolve(`/lab?${query}`), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function applySession(next: SessionState): void {
		session = next;
		if (browser) {
			saveSession(next);
		}
	}

	function loadPuzzle(
		size: PuzzleSize,
		seed: number,
		preset: PresetId,
		preferStored = false
	): void {
		selectedSize = size;
		selectedSeed = seed;
		seedInput = String(seed);
		selectedPreset = preset;

		if (preferStored) {
			const stored = loadSession();
			if (stored && stored.puzzle.size === size && stored.puzzle.seed === seed) {
				applySession({
					...stored,
					flags: preset === 'custom' ? stored.flags : getPresetFlags(preset)
				});
				return;
			}
		}

		const flags =
			preset === 'custom'
				? (session?.flags ?? getPresetFlags('modern-minimal'))
				: getPresetFlags(preset);
		const puzzle = resolvePuzzle({
			size,
			seed,
			antiPatternFilter: flags.antiPatternFilter
		});

		applySession(createSessionState(puzzle, flags));
	}

	function handleRendererEvent(event: RendererEvent): void {
		if (!session) return;

		switch (event.type) {
			case 'cycleCell':
				applySession(applyCommand(session, { type: 'cycleCell', index: event.index }));
				return;
			case 'confirmQueen':
				applySession(applyCommand(session, { type: 'confirmQueen', index: event.index }));
				return;
			case 'paintCell':
				applySession(
					applyCommand(session, {
						type: 'paintCell',
						index: event.index,
						mode: event.mode
					})
				);
		}
	}

	function setPreset(preset: PresetId): void {
		selectedPreset = preset;
		if (!session) {
			loadPuzzle(selectedSize, selectedSeed, preset);
			syncUrl();
			return;
		}

		const flags = preset === 'custom' ? session.flags : getPresetFlags(preset);
		applySession(applyCommand(session, { type: 'setFlags', flags }));
		syncUrl();
	}

	function toggleFlag(flag: keyof FeatureFlags): void {
		if (!session) return;
		selectedPreset = 'custom';
		applySession(
			applyCommand(session, {
				type: 'setFlags',
				flags: {
					...session.flags,
					[flag]: !session.flags[flag]
				}
			})
		);
		syncUrl();
	}

	function dispatch(command: Parameters<typeof applyCommand>[1]): void {
		if (!session) return;
		applySession(applyCommand(session, command));
	}

	function applySeedInput(): void {
		const parsed = Number(seedInput);
		if (!Number.isFinite(parsed) || parsed <= 0) return;
		loadPuzzle(selectedSize, parsed, selectedPreset);
		syncUrl();
	}

	function regenerate(): void {
		const nextSeed = getRandomSeed();
		loadPuzzle(selectedSize, nextSeed, selectedPreset);
		syncUrl();
	}

	function changeSize(size: PuzzleSize): void {
		loadPuzzle(size, selectedSeed, selectedPreset);
		syncUrl();
	}

	onMount(() => {
		const currentUrl = new URL(window.location.href);
		const stored = loadSession();

		if (stored && currentUrl.searchParams.size === 0) {
			selectedSize = stored.puzzle.size;
			selectedSeed = stored.puzzle.seed;
			seedInput = String(stored.puzzle.seed);
			selectedPreset = 'custom';
			applySession(stored);
			syncUrl();
			return;
		}

		const query = parseLabQuery(currentUrl);
		loadPuzzle(query.size, query.seed, query.preset, true);
		syncUrl();
	});
</script>

<svelte:head>
	<title>모던 퀸즐 연구실</title>
</svelte:head>

<div class="page-shell">
	<div class="lab-grid">
		<section class="glass-panel board-stack">
			<div class="board-head">
				<div style="display:grid; gap:10px;">
					<span class="eyebrow">플레이 가능한 연구 페이지</span>
					<h1 style="margin:0;">모던 퀸즐 연구실</h1>
					<p class="subtle">
						같은 퍼즐 위에서 기본 모드와 모던 미니멀 규칙을 비교하고, 가설 마커와 즉시 드래그 마킹이
						체감에 어떤 차이를 만드는지 검증합니다.
					</p>
				</div>
				<div class="status-badges">
					<span class="metric-chip">{statusLabel}</span>
					<span class="metric-chip">{sourceLabel}</span>
					<span class="metric-chip">{selectedSize}x{selectedSize}</span>
				</div>
			</div>

			{#if session && viewModel}
				<PixiBoard {viewModel} flags={session.flags} onRendererEvent={handleRendererEvent} />
			{/if}

			<div class="glass-strip">
				<strong>입력 안내</strong>
				<span>{boardHint}</span>
				<span>{viewModel?.message}</span>
			</div>

			<div class="snapshot-section">
				<div class="snapshot-header">
					<div>
						<strong>스냅샷</strong>
						<p class="subtle" style="margin:6px 0 0;">
							최대 5개까지 저장하고 바로 복원할 수 있어요.
						</p>
					</div>
					<button class="btn" type="button" onclick={() => dispatch({ type: 'saveSnapshot' })}>
						현재 상태 저장
					</button>
				</div>

				<div class="snapshot-tray" aria-label="저장된 스냅샷 목록">
					{#if session && session.snapshotSlots.length > 0}
						{#each session.snapshotSlots as snapshot (snapshot.id)}
							<button
								class="snapshot-card"
								type="button"
								onclick={() => dispatch({ type: 'restoreSnapshot', snapshotId: snapshot.id })}
								aria-label={`${formatSavedAt(snapshot.savedAt)} 스냅샷 복원`}
							>
								<div
									class="snapshot-preview"
									style={`grid-template-columns: repeat(${snapshot.size}, 1fr);`}
								>
									{#each snapshot.previewCells as mark, index (index)}
										<div class={`preview-cell ${mark}`} aria-hidden="true">
											{#if mark === 'x' || mark === 'fixed-x'}
												×
											{:else if mark === 'hypothesis'}
												△
											{:else if mark === 'queen'}
												Q
											{/if}
										</div>
									{/each}
								</div>
								<div class="snapshot-meta">
									<strong>{formatSavedAt(snapshot.savedAt)}</strong>
									<span>{snapshot.label}</span>
									<span>시드 {snapshot.seed}</span>
								</div>
							</button>
						{/each}
					{:else}
						<div class="snapshot-empty">아직 저장된 스냅샷이 없어요.</div>
					{/if}
				</div>
			</div>
		</section>

		<section class="glass-panel control-panel" class:open={panelOpen}>
			<div class="control-header">
				<div>
					<span class="eyebrow">제어 패널</span>
					<h2 style="margin:10px 0 0;">비교 설정</h2>
				</div>
				<button
					class="btn ghost mobile-only"
					type="button"
					onclick={() => (panelOpen = !panelOpen)}
				>
					{panelOpen ? '접기' : '펼치기'}
				</button>
			</div>

			<div class="panel-body">
				<div class="field">
					<label for="seed-input">퍼즐 시드</label>
					<div class="button-row">
						<input
							id="seed-input"
							bind:value={seedInput}
							inputmode="numeric"
							aria-label="퍼즐 시드 입력"
						/>
						<button class="btn" type="button" onclick={applySeedInput}>불러오기</button>
						<button class="btn ghost" type="button" onclick={regenerate}>새 퍼즐</button>
					</div>
				</div>

				<div class="field">
					<label for="size-select">보드 크기</label>
					<select
						id="size-select"
						bind:value={selectedSize}
						aria-label="보드 크기 선택"
						onchange={() => changeSize(selectedSize)}
					>
						<option value={5}>5x5</option>
						<option value={6}>6x6</option>
						<option value={7}>7x7</option>
					</select>
				</div>

				<div class="field">
					<strong>모드</strong>
					<div class="button-row">
						{#each Object.keys(PRESETS) as preset (preset)}
							<button
								class={`btn ${selectedPreset === preset ? 'primary' : ''}`}
								type="button"
								onclick={() => setPreset(preset as PresetId)}
							>
								{PRESET_LABELS[preset as PresetId]}
							</button>
						{/each}
					</div>
				</div>

				{#if session}
					<div class="field">
						<strong>세부 기능</strong>
						<div class="toggle-list">
							{#each Object.keys(session.flags) as flag (flag)}
								<label class="toggle-row">
									<input
										type="checkbox"
										checked={session.flags[flag as keyof FeatureFlags]}
										aria-label={FEATURE_LABELS[flag as keyof FeatureFlags]}
										onchange={() => toggleFlag(flag as keyof FeatureFlags)}
									/>
									<span>{FEATURE_LABELS[flag as keyof FeatureFlags]}</span>
								</label>
							{/each}
						</div>
					</div>

					<div class="field">
						<strong>빠른 조작</strong>
						<div class="button-row">
							<button
								class="btn"
								type="button"
								disabled={!canUndo}
								onclick={() => dispatch({ type: 'undo' })}
							>
								되돌리기
							</button>
							<button
								class="btn"
								type="button"
								disabled={!canRedo}
								onclick={() => dispatch({ type: 'redo' })}
							>
								다시 하기
							</button>
							<button
								class="btn ghost"
								type="button"
								onclick={() => dispatch({ type: 'resetBoard' })}
							>
								초기화
							</button>
						</div>
					</div>

					<div class="metrics-grid">
						<div class="metric">
							<strong>{session.puzzle.source === 'catalog' ? '카탈로그 퍼즐' : '생성 퍼즐'}</strong>
							<span class="subtle">현재 시드 {session.puzzle.seed}</span>
						</div>
						<div class="metric">
							<strong>{session.history.past.length}회</strong>
							<span class="subtle">되돌리기 가능</span>
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>

	<div class="mobile-bar glass-panel">
		<button
			class="btn"
			type="button"
			disabled={!canUndo}
			onclick={() => dispatch({ type: 'undo' })}
		>
			되돌리기
		</button>
		<button
			class="btn"
			type="button"
			disabled={!canRedo}
			onclick={() => dispatch({ type: 'redo' })}
		>
			다시 하기
		</button>
		<button class="btn" type="button" onclick={() => dispatch({ type: 'resetBoard' })}>
			초기화
		</button>
		<button class="btn" type="button" onclick={() => dispatch({ type: 'saveSnapshot' })}>
			스냅샷 저장
		</button>
		<button class="btn ghost" type="button" onclick={() => (panelOpen = !panelOpen)}> 설정 </button>
	</div>
</div>

<style>
	.lab-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
		gap: 20px;
		align-items: start;
	}

	.board-stack,
	.control-panel {
		padding: 20px;
		display: grid;
		gap: 18px;
	}

	.board-head {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: start;
	}

	.status-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: flex-end;
	}

	.metric-chip {
		padding: 8px 12px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.76);
		border: 1px solid rgba(128, 117, 169, 0.14);
		font-size: 0.9rem;
		font-weight: 700;
	}

	.subtle {
		color: var(--muted);
		line-height: 1.6;
	}

	.glass-strip {
		display: grid;
		gap: 6px;
		padding: 14px 16px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.72);
		border: 1px solid rgba(128, 117, 169, 0.12);
	}

	.snapshot-section {
		display: grid;
		gap: 12px;
	}

	.snapshot-header {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: center;
	}

	.snapshot-tray {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		padding-bottom: 4px;
		scroll-snap-type: x proximity;
		overscroll-behavior-x: contain;
	}

	.snapshot-card {
		min-width: 184px;
		display: grid;
		gap: 10px;
		padding: 12px;
		border-radius: 18px;
		border: 1px solid rgba(128, 117, 169, 0.14);
		background: rgba(255, 255, 255, 0.84);
		cursor: pointer;
		text-align: left;
		scroll-snap-align: start;
	}

	.snapshot-preview {
		display: grid;
		gap: 2px;
		padding: 4px;
		border-radius: 14px;
		background: rgba(239, 236, 255, 0.65);
	}

	.preview-cell {
		aspect-ratio: 1;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.62rem;
		font-weight: 700;
		background: rgba(255, 255, 255, 0.9);
		color: var(--x-color);
	}

	.preview-cell.hypothesis {
		color: var(--accent-strong);
	}

	.preview-cell.queen {
		color: var(--queen-strong);
	}

	.preview-cell.fixed-x {
		background: #dadce4;
		color: #7a7f8c;
	}

	.snapshot-meta {
		display: grid;
		gap: 4px;
		font-size: 0.83rem;
		color: var(--muted);
	}

	.snapshot-empty {
		padding: 16px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.7);
		color: var(--muted);
	}

	.control-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.panel-body {
		display: grid;
		gap: 18px;
	}

	.toggle-list {
		display: grid;
		gap: 10px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.mobile-bar {
		position: sticky;
		bottom: 10px;
		display: none;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		padding: 10px;
		margin-top: 18px;
		backdrop-filter: blur(18px);
		box-shadow: 0 12px 32px rgba(58, 46, 108, 0.12);
	}

	.mobile-only {
		display: none;
	}

	@media (max-width: 1099px) {
		.lab-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 767px) {
		.page-shell {
			padding-bottom: 112px;
		}

		.board-head,
		.snapshot-header {
			flex-direction: column;
			align-items: stretch;
		}

		.board-stack,
		.control-panel {
			padding: 16px;
			gap: 16px;
		}

		.board-head {
			gap: 12px;
		}

		.glass-strip {
			padding: 12px 14px;
		}

		.snapshot-card {
			min-width: 160px;
			padding: 10px;
		}

		.snapshot-preview {
			gap: 1px;
			padding: 3px;
		}

		.preview-cell {
			font-size: 0.56rem;
		}

		.panel-body {
			display: none;
			gap: 14px;
		}

		.control-panel {
			padding-bottom: 14px;
		}

		.control-panel.open .panel-body {
			display: grid;
			max-height: calc(100dvh - 242px);
			overflow: auto;
			padding-right: 2px;
		}

		.control-panel :global(.button-row) {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.control-panel :global(.button-row .btn),
		.control-panel :global(.button-row input),
		.control-panel :global(.button-row select) {
			width: 100%;
		}

		.toggle-row {
			min-height: 48px;
			padding: 0 4px;
		}

		.mobile-bar {
			display: grid;
		}

		.mobile-only {
			display: grid;
		}
	}
</style>
