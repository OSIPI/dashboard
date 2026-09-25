<script lang="ts">
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import type { Catalog } from '$lib/analysis';

	let {
		catalog,
		canFit = false,
		selectedMethod,
		onselect
	}: {
		catalog?: Catalog;
		canFit?: boolean;
		selectedMethod?: string;
		onselect: (id: string) => void;
	} = $props();
	let expanded = $state(false);
	const names: Record<string, string> = {
		biexponential: 'Biexponential',
		simplified: 'Simplified IVIM',
		tofts: 'Tofts',
		extended_tofts: 'Extended Tofts',
		patlak: 'Patlak',
		'2cxm': 'Two-compartment exchange (2CXM)',
		'2cum': 'Two-compartment uptake (2CUM)',
		vfa: 'Variable flip angle (VFA)',
		spgr: 'Spoiled gradient echo (SPGR)',
		bsw: 'Boxerman–Schmainda–Weisskoff (BSW)',
		pcasl_single_pld: 'pCASL single PLD',
		casl_single_pld: 'CASL single PLD',
		pasl_single_pld: 'PASL single PLD',
		buxton_multi_pld: 'Buxton multi-PLD'
	};
	function label(id: string) {
		return names[id] ?? id.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
	}
</script>

<details bind:open={expanded} class="group relative shrink-0 text-xs max-[899px]:static">
	<summary
		class="button button-primary min-h-9 cursor-pointer list-none px-3 max-[899px]:min-h-11 [&::-webkit-details-marker]:hidden"
	>
		{selectedMethod ? label(selectedMethod) : 'Methods'}
		<ChevronDownIcon aria-hidden="true" class="size-4" />
	</summary>
	<div
		class="absolute left-0 z-30 mt-1 max-h-[min(65dvh,32rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-md border bg-card p-3 shadow-lg max-[899px]:right-2 max-[899px]:left-2 max-[899px]:max-h-[calc(100dvh-14rem)] max-[899px]:w-auto"
	>
		<h2 class="text-sm font-semibold">OSIPY methods</h2>
		{#if catalog?.library?.length}
			<p class="mt-1 text-muted-foreground">
				Installed OSIPY {catalog.osipyVersion}. Only methods marked Runnable are integrated with
				this dashboard.
			</p>
			{#each catalog.library as section (section.technique)}
				<section class="mt-3 border-t pt-2" aria-label={section.technique}>
					<h3 class="font-semibold text-selection">{section.technique}</h3>
					{#each section.groups as group (group.label)}
						<div class="mt-2">
							<h4 class="text-muted-foreground">{group.label}</h4>
							<ul class="mt-1 space-y-1">
								{#each group.methods as method (method)}
									<li>
										{#if section.technique === 'IVIM' && catalog.models.some((model) => model.id === method)}
											<button
												type="button"
												class="flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
												aria-current={selectedMethod === method ? 'true' : undefined}
												disabled={!canFit}
												onclick={() => {
													expanded = false;
													onselect(method);
												}}
												><span title={method}>{label(method)}</span><span
													class="shrink-0 text-selection">Configure →</span
												></button
											>
										{:else}<div
												class="flex items-baseline justify-between gap-2 px-2 py-1 text-muted-foreground"
											>
												<span title={method}>{label(method)}</span><span class="shrink-0"
													>Library only</span
												>
											</div>{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</section>
			{/each}
		{:else}
			<p class="mt-2 text-muted-foreground">
				{import.meta.env.DEV && !__LOCAL_COMPANION_PROXY__
					? 'This dashboard was started without its companion. Stop the server using port 60010 and run make dev to list methods automatically.'
					: __LOCAL_COMPANION_PROXY__
						? 'Connecting to the local companion. If it stays disconnected, open Inspector → IVIM analysis to retry.'
						: 'Start the local Docker companion, then connect in Inspector → IVIM analysis to list available fitting methods.'}
			</p>
		{/if}
	</div>
</details>
