<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Modern Queenzle Lab</title>
	<meta
		name="description"
		content="Playable research lab for comparing classic and modern Queenzle puzzle UX."
	/>
</svelte:head>

{@render children()}
