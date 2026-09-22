<script lang="ts">
	import PanelsIcon from '~icons/lucide/panels-top-left';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import { download, parseWorkspace, type Workspace } from '$lib/workspace';
	import type { Dataset } from '$lib/ivim';
	let {
		dataset,
		getworkspace,
		onapply,
		onresetlayout,
		open = $bindable(true),
		onmessage
	}: {
		dataset: Dataset;
		getworkspace: () => Workspace;
		onapply: (w: Workspace) => void;
		onresetlayout: () => void;
		open: boolean;
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

<section class="card space-y-3 p-3 {open ? '' : '[&>*:not(:first-child)]:hidden'}">
	<h2>
		<button
			type="button"
			class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			aria-label="{open ? 'Collapse' : 'Expand'} workspace panel"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<PanelsIcon class="size-4 shrink-0" aria-hidden="true" />Workspace
			{#if open}<ChevronDownIcon class="ml-auto size-4" />{:else}<ChevronRightIcon
					class="ml-auto size-4"
				/>{/if}
		</button>
	</h2>
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
