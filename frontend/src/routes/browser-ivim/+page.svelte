<script lang="ts">
	import BrowserIvimWorkbench from '$lib/components/BrowserIvimWorkbench.svelte';
</script>

<svelte:head>
	<title>Browser IVIM demo · OSIPY</title>
	<meta
		name="description"
		content="Run the published OSIPY IVIM fitter locally in a Pyodide Web Worker."
	/>
</svelte:head>

<BrowserIvimWorkbench />
