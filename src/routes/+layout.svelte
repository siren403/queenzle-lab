<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>모던 퀸즐 연구실</title>
	<meta
		name="description"
		content="모던 퀸즐의 규칙과 UX 가설을 비교 검증하는 한국어 중심 플레이어블 연구실."
	/>
</svelte:head>

{@render children()}
