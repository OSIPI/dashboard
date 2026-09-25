<script lang="ts">
	import ServerIcon from '~icons/lucide/server';
	let dialog: HTMLDialogElement;
	let message = $state('');
	const command =
		'git clone https://github.com/OSIPI/dashboard.git && cd dashboard && docker compose up';
	async function copy() {
		try {
			await navigator.clipboard.writeText(command);
			message = 'Command copied.';
		} catch {
			message = 'Copy the command above manually.';
		}
	}
</script>

<button class="button button-outline" onclick={() => dialog.showModal()}>
	<ServerIcon class="mr-1 size-4" aria-hidden="true" />Run local fitting
</button>
<dialog
	bind:this={dialog}
	aria-labelledby="local-fitting-title"
	class="m-auto max-h-[calc(100dvh-1rem)] w-[min(34rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/70"
>
	<h2 id="local-fitting-title" class="text-lg font-semibold">Run OSIPY fitting on your computer</h2>
	<p class="mt-2 text-sm leading-6 text-muted-foreground">
		For fitting from this public dashboard, install Docker and run this command in a terminal. It
		starts only the local Python/OSIPY companion; continue using this browser tab.
	</p>
	<pre class="mt-4 overflow-x-auto rounded-md border bg-background p-3 text-xs leading-5"><code
			>{command}</code
		></pre>
	<div class="mt-3 flex flex-wrap items-center gap-3">
		<button class="button button-outline" onclick={copy}>Copy command</button>
	</div>
	{#if message}<p class="mt-2 text-xs text-muted-foreground" role="status">{message}</p>{/if}
	<p class="mt-4 text-xs leading-5 text-muted-foreground">
		Copy the session token printed by Docker, then paste it under Inspector → IVIM analysis and
		connect. The companion listens only on your computer; this browser sends acquisitions to it for
		fitting. If prompted, allow this site to access your local network. Only verified IVIM
		biexponential fitting is runnable today.
	</p>
	<div class="mt-5 flex justify-end">
		<button class="button button-ghost" onclick={() => dialog.close()}>Close</button>
	</div>
</dialog>
