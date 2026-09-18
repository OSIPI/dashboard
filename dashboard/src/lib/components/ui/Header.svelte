<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { persistedPreference } from '$lib/persisted-preference.svelte';
	import Logo from '$lib/assets/icons/Logo.svelte';
	import MoonIcon from '~icons/lucide/moon';
	import SunIcon from '~icons/lucide/sun';
	const theme = persistedPreference<'dark' | 'light'>(
		'theme',
		'dark',
		(raw) => (raw === 'light' ? 'light' : 'dark'),
		(value) => value
	);
	const dark = $derived(theme.current === 'dark');
	let {
		technique = $bindable(),
		children
	}: { technique?: 'DCE' | 'DSC' | 'ASL' | 'IVIM'; children?: Snippet } = $props();
	$effect(() => {
		document.documentElement.classList.toggle('dark', dark);
	});
	function toggleTheme() {
		theme.current = dark ? 'light' : 'dark';
	}
</script>

<header class="shrink-0 border-b bg-card pt-[env(safe-area-inset-top)]">
	<div
		class="flex min-h-[54px] items-center gap-6 bg-background px-3 py-[9px] max-[899px]:min-h-11 max-[899px]:flex-wrap max-[899px]:gap-x-2 max-[899px]:gap-y-0 max-[899px]:px-2 max-[899px]:py-0"
	>
		<a
			class="flex items-center gap-2 font-[650] max-[899px]:text-[13px]"
			href={resolve('/')}
			aria-label="OSIPY dashboard home"><Logo class="size-7 rounded-md" /><span>OSIPY</span></a
		>
		{#if technique}<nav
				class="flex gap-1 max-[899px]:order-3 max-[899px]:w-full"
				aria-label="MRI technique"
			>
				{#each ['DCE', 'DSC', 'ASL', 'IVIM'] as key (key)}<button
						class="button button-ghost aria-pressed:bg-transparent aria-pressed:text-selection aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-8 aria-pressed:shadow-none max-[899px]:h-11 max-[899px]:flex-1"
						aria-pressed={technique === key}
						title={key === 'IVIM' ? 'In-vivo IVIM viewer' : `${key}: not implemented`}
						onclick={() => (technique = key as typeof technique)}>{key}</button
					>{/each}
			</nav>{:else}<a class="button button-ghost" href={resolve('/')}>Datasets</a>{/if}
		<nav
			class="ml-auto flex gap-4 text-xs text-muted-foreground max-[899px]:gap-3.5 [&>*]:flex [&>*]:min-h-9 [&>*]:items-center max-[899px]:[&>*]:min-h-11"
			aria-label="Resources"
		>
			<a href="https://github.com/OSIPI/dashboard/issues/new" target="_blank" rel="noreferrer"
				>Feedback</a
			><a href="https://osipy.readthedocs.io" target="_blank" rel="noreferrer">Docs</a><a
				href="https://github.com/OSIPI/dashboard"
				target="_blank"
				rel="noreferrer">GitHub</a
			>
			<button
				class="button button-ghost button-icon max-[899px]:min-w-11"
				type="button"
				onclick={toggleTheme}
				aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
				>{#if dark}<SunIcon class="size-4" aria-hidden="true" />{:else}<MoonIcon
						class="size-4"
						aria-hidden="true"
					/>{/if}</button
			>
		</nav>
	</div>
	{#if children}<div
			class="flex min-h-[46px] items-center gap-2 border-t px-3 py-1.5 max-[899px]:flex-wrap max-[899px]:px-2 max-[899px]:py-1"
		>
			{@render children()}
		</div>{/if}
</header>
