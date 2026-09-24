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
		The public site is for browser-local viewing. For fitting, install Docker, then run this one
		command in a terminal. It downloads the dashboard source and starts a local workspace with
		Python and OSIPY included.
	</p>
	<pre class="mt-4 overflow-x-auto rounded-md border bg-background p-3 text-xs leading-5"><code
			>{command}</code
		></pre>
	<div class="mt-3 flex flex-wrap items-center gap-3">
		<button class="button button-outline" onclick={copy}>Copy command</button>
		<a
			class="text-sm underline underline-offset-2"
			href="http://localhost:60010/dashboard/"
			target="_blank"
			rel="noreferrer">Open local workspace</a
		>
	</div>
	{#if message}<p class="mt-2 text-xs text-muted-foreground" role="status">{message}</p>{/if}
	<p class="mt-4 text-xs leading-5 text-muted-foreground">
		The local workspace has its own browser storage, so datasets saved on the public site do not
		transfer automatically. Reimport scans there. Only the verified IVIM biexponential fit is
		runnable today; other OSIPY methods are listed for discovery.
	</p>
	<p class="mt-2 text-xs leading-5 text-muted-foreground">
		A shorter GHCR image command will be available after the first public container release.
	</p>
	<div class="mt-5 flex justify-end">
		<button class="button button-ghost" onclick={() => dialog.close()}>Close</button>
	</div>
</dialog>
