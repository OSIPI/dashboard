<script lang="ts">
	import ServerIcon from '~icons/lucide/server';
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	let { client }: { client?: AnalysisClient } = $props();
	let dialog: HTMLDialogElement;
	let message = $state('');
	const command =
		'docker run --rm --pull=always -p 127.0.0.1:60016:60016 ghcr.io/osipi/dashboard:latest';
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
	{#if client?.catalog}
		<span class="relative mr-1 flex size-2 shrink-0" aria-hidden="true">
			<span
				class="absolute size-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none"
			></span>
			<span class="relative size-2 rounded-full bg-green-500"></span>
		</span>
	{:else}<ServerIcon class="mr-1 size-4" aria-hidden="true" />{/if}
	{client ? (client.catalog ? 'Companion · Ready' : 'Local companion') : 'Run local fitting'}
</button>
<dialog
	bind:this={dialog}
	aria-labelledby="local-fitting-title"
	class="m-auto max-h-[calc(100dvh-1rem)] w-[min(34rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/70"
>
	<h2 id="local-fitting-title" class="text-lg font-semibold">Local OSIPY fitting</h2>
	{#if client}<p class="mt-1 text-sm text-muted-foreground" role="status">{client.stage}</p>{/if}
	{#if client && __LOCAL_COMPANION_PROXY__}
		<p class="mt-2 text-sm text-muted-foreground">
			The local development companion starts with make dev.
		</p>
		{#if !client.catalog}<button
				class="button button-outline mt-3"
				disabled={client.busy}
				onclick={() => client?.connect()}>{client.busy ? 'Connecting…' : 'Retry connection'}</button
			>{/if}
	{:else}
		<p class="mt-2 text-sm leading-6 text-muted-foreground">
			Install Docker and run this command in a terminal. It starts only the local Python/OSIPY
			companion; continue using this browser tab.
		</p>
		<pre class="mt-4 overflow-x-auto rounded-md border bg-background p-3 text-xs leading-5"><code
				>{command}</code
			></pre>
		<div class="mt-3 flex flex-wrap items-center gap-3">
			<button class="button button-outline" onclick={copy}>Copy command</button>
		</div>
		{#if message}<p class="mt-2 text-xs text-muted-foreground" role="status">{message}</p>{/if}
	{/if}
	{#if client && !__LOCAL_COMPANION_PROXY__}
		<form
			class="mt-5 space-y-2 border-t pt-4"
			onsubmit={(event) => {
				event.preventDefault();
				void client?.connect();
			}}
		>
			<label class="block text-sm font-medium" for="companion-token"
				>Session token from Docker</label
			>
			<div class="flex gap-2">
				<input
					id="companion-token"
					class="input min-w-0 flex-1"
					type="password"
					autocomplete="off"
					spellcheck="false"
					placeholder="Paste token"
					bind:value={client.token}
					oninput={() => (client.error = '')}
				/>
				<button
					class="button button-outline shrink-0"
					type="submit"
					disabled={client.busy || !client.token.trim()}
					>{client.busy ? 'Connecting…' : client.catalog ? 'Reconnect' : 'Connect'}</button
				>
			</div>
			<p class="text-xs text-muted-foreground">
				Checks every second after you paste. If prompted, allow this site to access your local
				network.
			</p>
			{#if client.error}<p class="text-xs text-destructive" role="alert">{client.error}</p>{/if}
		</form>
	{:else}
		<p class="mt-4 text-xs leading-5 text-muted-foreground">
			Copy the session token printed by Docker, then paste it in Local companion at the top right of
			the viewer. Only verified IVIM biexponential fitting is runnable today.
		</p>
	{/if}
	<div class="mt-5 flex justify-end">
		<button class="button button-ghost" onclick={() => dialog.close()}>Close</button>
	</div>
</dialog>
