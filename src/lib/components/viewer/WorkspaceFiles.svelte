<script lang="ts">
	import { download, parseWorkspace, type Workspace } from '$lib/workspace';
	import type { Dataset } from '$lib/ivim';
	let {
		dataset,
		getworkspace,
		onapply,
		onresetlayout,
		onmessage
	}: {
		dataset: Dataset;
		getworkspace: () => Workspace;
		onapply: (w: Workspace) => void;
		onresetlayout: () => void;
		onmessage: (message: string) => void;
	} = $props();
	let pending = $state<Workspace>();
	let dialog: HTMLDialogElement;
	function exportWorkspace() {
		download(
			new Blob([JSON.stringify(getworkspace(), null, 2)], { type: 'application/json' }),
			'osipy-workspace.json'
		);
		onmessage('Workspace exported (settings and notes only; no MRI samples).');
	}
	async function importWorkspace(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			if (file.size > 100_000) throw new Error('Workspace is too large (100 KB maximum).');
			pending = parseWorkspace(await file.text(), dataset);
			dialog.showModal();
		} catch (e) {
			onmessage(e instanceof Error ? e.message : 'Invalid workspace file.');
		}
	}
</script>

<section class="card space-y-3 p-3">
	<h2 class="text-sm font-semibold">Workspace</h2>
	<p class="text-xs text-muted-foreground">
		Export settings, selections and notes. MRI data is not included.
	</p>
	<div class="flex flex-wrap gap-2">
		<button class="button button-outline" onclick={exportWorkspace}>Export workspace</button><button
			class="button button-ghost"
			onclick={onresetlayout}>Reset layout</button
		>
	</div>
	<label class="block text-xs"
		>Import workspace JSON<input
			class="mt-2 block w-full text-xs"
			type="file"
			accept=".json,application/json"
			onchange={importWorkspace}
		/></label
	>
	<p class="text-xs text-muted-foreground">
		Import validates dataset identity and previews replacement before applying.
	</p>
</section>
<dialog
	bind:this={dialog}
	class="m-auto max-h-[calc(100dvh-24px)] w-[min(520px,calc(100vw-24px))] overflow-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/65"
	aria-labelledby="import-title"
>
	<h2 id="import-title" class="text-lg font-semibold">Replace current workspace?</h2>
	<p class="my-4 text-sm">
		Dataset verified. Import {pending?.bookmarks.length ?? 0} saved voxels and {pending?.selected
			.length ?? 0} selected volumes. This replaces the current settings and saved notes; export them
		first if needed.
	</p>
	<div class="flex flex-wrap gap-2">
		<button
			class="button button-primary"
			onclick={() => {
				if (pending) onapply(pending);
				dialog.close();
				pending = undefined;
			}}>Replace workspace</button
		><button class="button button-outline" onclick={() => dialog.close()}>Cancel import</button>
	</div>
</dialog>
