<script lang="ts">
	import { onMount } from 'svelte';
	import type { BoardViewModel, FeatureFlags, RendererEvent } from '$lib/core/types';
	import { createBoardApp } from '$lib/render/pixi/app/create-board-app';
	import { PixiBoardRenderer } from '$lib/render/pixi/board/renderer';

	interface Props {
		viewModel: BoardViewModel;
		flags: FeatureFlags;
		onRendererEvent: (event: RendererEvent) => void;
	}

	let { viewModel, flags, onRendererEvent }: Props = $props();
	let host = $state<HTMLElement | null>(null);
	let renderer = $state<PixiBoardRenderer | null>(null);
	let appInstance = $state<Awaited<ReturnType<typeof createBoardApp>> | null>(null);

	onMount(() => {
		let alive = true;

		(async () => {
			if (!host) return;
			const app = await createBoardApp(host);
			if (!alive) {
				app.destroy(true);
				return;
			}
			appInstance = app;
			renderer = new PixiBoardRenderer(app, host, onRendererEvent);
			renderer.update(viewModel, flags);
		})();

		return () => {
			alive = false;
			renderer?.destroy();
			appInstance?.destroy(true, { children: true });
		};
	});

	$effect(() => {
		if (!renderer) return;
		renderer.update(viewModel, flags);
	});
</script>

<div bind:this={host} class="pixi-host"></div>

<style>
	.pixi-host {
		width: 100%;
		min-height: min(70vw, 720px);
		height: min(70vw, 720px);
		border-radius: 28px;
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.82) 0%,
			rgba(249, 247, 255, 0.96) 100%
		);
		border: 1px solid rgba(128, 117, 169, 0.16);
		overflow: hidden;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}

	:global(.pixi-host canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}

	@media (max-width: 960px) {
		.pixi-host {
			min-height: 60vw;
			height: 60vw;
		}
	}

	@media (max-width: 640px) {
		.pixi-host {
			min-height: 78vw;
			height: 78vw;
		}
	}
</style>
