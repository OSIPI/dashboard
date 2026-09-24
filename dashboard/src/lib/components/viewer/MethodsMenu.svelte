<script lang="ts">
	import type { Catalog } from '$lib/analysis';

	let { catalog }: { catalog?: Catalog } = $props();
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

<details class="group relative shrink-0 text-xs max-[899px]:static">
	<summary
		class="button button-outline min-h-9 cursor-pointer list-none px-3 max-[899px]:min-h-11 [&::-webkit-details-marker]:hidden"
	>
		Methods <span aria-hidden="true" class="ml-1 text-muted-foreground">▾</span>
	</summary>
	<div
		class="absolute right-0 z-30 mt-1 max-h-[min(65dvh,32rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-md border bg-card p-3 shadow-lg max-[899px]:right-2 max-[899px]:left-2 max-[899px]:max-h-[calc(100dvh-14rem)] max-[899px]:w-auto"
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
									<li class="flex items-baseline justify-between gap-2">
										<span title={method}>{label(method)}</span>
										<span
											class="shrink-0 {section.technique === 'IVIM' &&
											catalog.models.some((model) => model.id === method)
												? 'text-selection'
												: 'text-muted-foreground'}"
										>
											{section.technique === 'IVIM' &&
											catalog.models.some((model) => model.id === method)
												? 'Runnable'
												: 'Library only'}
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</section>
			{/each}
		{:else}
			<p class="mt-2 text-muted-foreground">
				Connect the local companion in Inspector → IVIM analysis to list installed methods. No
				remote service is used.
			</p>
		{/if}
	</div>
</details>
