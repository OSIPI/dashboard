<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		clearDiagnostics,
		diagnosticsStatus,
		downloadDiagnostics,
		pauseDiagnostics,
		savedDiagnosticsSessions
	} from '$lib/diagnostics';
	import ActivityIcon from '~icons/lucide/activity';
	let dialog: HTMLDialogElement;
	let status = $state(diagnosticsStatus());
	let error = $state('');
	let sessions = $state<Awaited<ReturnType<typeof savedDiagnosticsSessions>>>([]);
	let selected = $state('');
	let busy = $state(false);
	let confirmClear = $state(false);
	let timer: ReturnType<typeof setInterval> | undefined;
	onDestroy(() => clearInterval(timer));
	function refresh() {
		status = diagnosticsStatus();
	}
	async function loadHistory() {
		try {
			sessions = await savedDiagnosticsSessions();
		} catch {
			error = 'Saved history is unavailable. You can still download the current session.';
		}
	}
	async function open() {
		refresh();
		selected = status.session;
		confirmClear = false;
		dialog.showModal();
		clearInterval(timer);
		timer = setInterval(refresh, 1000);
		await loadHistory();
	}
	async function download() {
		busy = true;
		try {
			await downloadDiagnostics(selected);
			error = '';
			refresh();
		} catch {
			error =
				'Could not download that session. It may have been removed or browser storage may be unavailable.';
		} finally {
			busy = false;
		}
	}
	async function clearHistory() {
		if (!confirmClear) {
			confirmClear = true;
			return;
		}
		busy = true;
		try {
			await clearDiagnostics();
			error = '';
			selected = status.session;
			confirmClear = false;
			await loadHistory();
			refresh();
		} catch {
			error = 'Could not clear saved history. Existing logs have been kept.';
		} finally {
			busy = false;
		}
	}
</script>

<div>
	<button
		type="button"
		class="button button-ghost button-icon min-h-11 min-w-11"
		data-diagnostic="diagnostics"
		aria-label="Session diagnostics"
		title="Session diagnostics"
		onclick={open}
	>
		<ActivityIcon class="size-4" aria-hidden="true" />
	</button>
	<dialog
		bind:this={dialog}
		onclose={() => clearInterval(timer)}
		aria-labelledby="diagnostics-title"
		class="m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-auto rounded-xl border bg-card p-4 text-foreground backdrop:bg-black/65"
	>
		<div class="flex items-center justify-between gap-3">
			<h2 id="diagnostics-title" class="text-base font-semibold">Session diagnostics</h2>
			<button class="button button-ghost" onclick={() => dialog.close()}>Close</button>
		</div>
		<div class="space-y-4 py-4 text-sm">
			<p>
				Recording actions, import stages, analysis progress, timings and resource pressure locally.
				No automatic upload.
			</p>
			<p class="text-muted-foreground">
				Logs exclude patient data, file names, typed values, image samples and error text. Technical
				sizes and counts are included. Review the downloaded log before sharing it.
			</p>
			<p>
				{status.paused ? 'Paused' : 'Recording'} · {status.retained} retained events · {status.dropped}
				older events dropped
			</p>
			<p class="text-muted-foreground">
				Saved locally in IndexedDB across reloads. Keeps up to 10 sessions with 5,000 events each.
				Clearing site data or browser eviction removes saved logs. A crash may lose the latest
				unfinished write.
			</p>
			{#if status.storage === 'unavailable'}
				<p role="alert" class="text-destructive">
					Storage unavailable. This session is memory only; download before closing or reloading.
				</p>
			{:else}<p role="status" class="text-muted-foreground">
					{status.storage === 'saving'
						? 'Saving latest events…'
						: 'Latest events saved on this device.'}
				</p>{/if}
			<label class="grid gap-2"
				>Session to download
				<select class="input min-h-11 w-full" bind:value={selected} disabled={busy}>
					<option value={status.session}>Current session</option>
					{#each sessions.filter((item) => item.session !== status.session) as item (item.session)}
						<option value={item.session}
							>{new Date(item.startedAt).toLocaleString()} · {item.retained} events</option
						>
					{/each}
				</select>
			</label>
			{#if confirmClear}<p>
					Delete all saved diagnostic sessions on this device? Other open tabs may continue
					recording.
				</p>{/if}
			{#if error}<p role="alert" class="text-destructive">{error}</p>{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				class="button button-primary"
				data-diagnostic="download"
				disabled={busy}
				onclick={download}>Download diagnostics</button
			>
			<button
				class="button button-outline"
				data-diagnostic="pause"
				disabled={busy}
				onclick={() => {
					pauseDiagnostics(!status.paused);
					refresh();
				}}>{status.paused ? 'Resume' : 'Pause'}</button
			>
			<button
				class="button button-outline"
				data-diagnostic="clear"
				disabled={busy}
				onclick={clearHistory}
				>{confirmClear ? 'Confirm clear history' : 'Clear saved history'}</button
			>
			{#if confirmClear}<button
					class="button button-ghost"
					disabled={busy}
					onclick={() => (confirmClear = false)}>Cancel</button
				>{/if}
		</div>
	</dialog>
</div>
