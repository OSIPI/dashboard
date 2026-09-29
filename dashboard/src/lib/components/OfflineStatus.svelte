<script lang="ts">
	let online = $state(true);
</script>

<svelte:window bind:online />
<span
	class="badge text-muted-foreground"
	title="The dashboard needs a connection to reload. Saved scans remain in this browser."
	>{online ? 'Online' : 'Offline'}</span
>
