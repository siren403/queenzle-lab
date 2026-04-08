<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { applyCommand, createSessionState, resolvePuzzle } from '$lib/core/state';
	import { loadSession, saveSession } from '$lib/core/persistence';
	import type { FeatureFlags, PresetId, RendererEvent, SessionState } from '$lib/core/types';
	import { buildBoardViewModel } from '$lib/render/pixi/board-view';
	import PixiBoard from '$lib/ui/components/PixiBoard.svelte';
	import { getPresetFlags, PRESETS } from '$lib/ui/presets';
	import { buildLabQuery, getRandomSeed, parseLabQuery } from '$lib/ui/stores/lab-query';

	let selectedSize = $state<6 | 7>(6);
	let selectedSeed = $state(12031);
	let seedInput = $state('12031');
	let selectedPreset = $state<PresetId>('modern-minimal');
	let session = $state<SessionState | null>(null);

	const viewModel = $derived(session ? buildBoardViewModel(session) : null);
	const canUndo = $derived((session?.history.past.length ?? 0) > 0);
	const canRedo = $derived((session?.history.future.length ?? 0) > 0);
	const hasSnapshot = $derived(Boolean(session?.snapshotSlot));
	const sourceLabel = $derived(session?.puzzle.source === 'catalog' ? 'Catalog' : 'Generator');
	const statusLabel = $derived(viewModel?.solved ? 'Solved' : 'In progress');

	function syncUrl(): void {
		const query = buildLabQuery({
			size: selectedSize,
			seed: selectedSeed,
			preset: selectedPreset
		}).toString();

		void goto(resolve(`/lab?${query}`), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function applySession(next: SessionState): void {
		session = next;
		if (browser) {
			saveSession(next);
		}
	}

	function loadPuzzle(size: 6 | 7, seed: number, preset: PresetId, preferStored = false): void {
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
			case 'clickCell':
				applySession(applyCommand(session, { type: 'toggleX', index: event.index }));
				return;
			case 'doubleClickCell':
				applySession(applyCommand(session, { type: 'setQueen', index: event.index }));
				return;
			case 'dragCells':
				applySession(applyCommand(session, { type: 'dragCells', indices: event.indices }));
				return;
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

	function changeSize(size: 6 | 7): void {
		loadPuzzle(size, selectedSeed, selectedPreset);
		syncUrl();
	}

	onMount(() => {
		const currentUrl = new URL(window.location.href);
		const stored = loadSession();

		if (stored && currentUrl.searchParams.size === 0) {
			selectedSize = stored.puzzle.size as 6 | 7;
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
	<title>Modern Queenzle Lab</title>
</svelte:head>

<div class="page-shell">
	<div class="lab-grid">
		<section class="glass-panel lab-panel">
			<div style="display:grid; gap:14px;">
				<span class="eyebrow">Playable Research</span>
				<h1 style="margin:0;">Modern Queenzle Lab</h1>
				<p style="margin:0; color:var(--muted); line-height:1.6;">
					같은 퍼즐 위에서 `classic`과 `modern-minimal`을 바꿔가며, 드래그 마킹과 anti-pattern
					필터의 체감을 비교합니다.
				</p>
			</div>

			<div style="display:grid; gap:12px;">
				<div class="field">
					<label for="seed-input">Seed</label>
					<div class="button-row">
						<input id="seed-input" bind:value={seedInput} inputmode="numeric" />
						<button class="btn" type="button" onclick={applySeedInput}>Load</button>
						<button class="btn ghost" type="button" onclick={regenerate}>New Puzzle</button>
					</div>
				</div>

				<div class="field">
					<label for="size-select">Board Size</label>
					<select
						id="size-select"
						value={selectedSize}
						onchange={(event) =>
							changeSize(Number((event.currentTarget as HTMLSelectElement).value) as 6 | 7)}
					>
						<option value="6">6x6</option>
						<option value="7">7x7</option>
					</select>
				</div>
			</div>

			<div style="display:grid; gap:12px;">
				<strong>Preset</strong>
				<div class="button-row">
					{#each Object.keys(PRESETS) as preset (preset)}
						<button
							class={`btn ${selectedPreset === preset ? 'primary' : ''}`}
							type="button"
							onclick={() => setPreset(preset as PresetId)}
						>
							{preset}
						</button>
					{/each}
				</div>
			</div>

			{#if session}
				<div style="display:grid; gap:10px;">
					<strong>Flags</strong>
					<label class="toggle-row">
						<input
							type="checkbox"
							checked={session.flags.dragMarking}
							onchange={() => toggleFlag('dragMarking')}
						/>
						<span>Drag marking</span>
					</label>
					<label class="toggle-row">
						<input
							type="checkbox"
							checked={session.flags.antiPatternFilter}
							onchange={() => toggleFlag('antiPatternFilter')}
						/>
						<span>Anti-pattern filter</span>
					</label>
					<label class="toggle-row">
						<input
							type="checkbox"
							checked={session.flags.blockIllegalQueenPlacement}
							onchange={() => toggleFlag('blockIllegalQueenPlacement')}
						/>
						<span>Block illegal queen placement</span>
					</label>
				</div>

				<div class="button-row">
					<button
						class="btn"
						type="button"
						disabled={!canUndo}
						onclick={() => dispatch({ type: 'undo' })}>Undo</button
					>
					<button
						class="btn"
						type="button"
						disabled={!canRedo}
						onclick={() => dispatch({ type: 'redo' })}>Redo</button
					>
					<button class="btn" type="button" onclick={() => dispatch({ type: 'resetBoard' })}
						>Reset</button
					>
				</div>

				<div class="button-row">
					<button class="btn" type="button" onclick={() => dispatch({ type: 'saveSnapshot' })}
						>Save Snapshot</button
					>
					<button
						class="btn"
						type="button"
						disabled={!hasSnapshot}
						onclick={() => dispatch({ type: 'restoreSnapshot' })}
					>
						Restore Snapshot
					</button>
				</div>

				<div class="metrics-grid">
					<div class="metric">
						<span class="eyebrow" style="width:max-content;">Status</span>
						<strong>{statusLabel}</strong>
						<span style="color:var(--muted);"
							>{session.selectionFeedback?.reason ?? 'Keep proving cells.'}</span
						>
					</div>
					<div class="metric">
						<strong>{sourceLabel}</strong>
						<span style="color:var(--muted);">
							{session.puzzle.source === 'catalog'
								? 'Validated deterministic seed'
								: 'Generated with fallback protection'}
						</span>
					</div>
				</div>
			{/if}
		</section>

		<section class="glass-panel board-panel">
			{#if session && viewModel}
				<PixiBoard {viewModel} flags={session.flags} onRendererEvent={handleRendererEvent} />
			{:else}
				<div style="padding:24px;">Loading board…</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.lab-grid {
		display: grid;
		grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}

	.lab-panel {
		padding: 24px;
		display: grid;
		gap: 22px;
		position: sticky;
		top: 24px;
	}

	.board-panel {
		padding: 16px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	@media (max-width: 1100px) {
		.lab-grid {
			grid-template-columns: 1fr;
		}

		.lab-panel {
			position: static;
		}
	}

	@media (max-width: 640px) {
		.metrics-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
