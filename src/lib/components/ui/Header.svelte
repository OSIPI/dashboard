<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/assets/icons/Logo.svelte';
	import GithubIcon from '~icons/simple-icons/github';
	import MenuIcon from '~icons/lucide/menu';
	import XIcon from '~icons/lucide/x';

	let menuOpen = $state(false);
</script>

<header
	class="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
>
	<div class="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
		<a
			class="flex shrink-0 items-center gap-2.5 rounded-sm"
			href={resolve('/')}
			aria-label="OSIPY dashboard home"
		>
			<Logo class="h-8 w-8 rounded-md object-contain" />
			<span class="font-semibold tracking-tight">OSIPY</span>
			<span class="hidden border-l pl-2 text-xs text-muted-foreground sm:inline">Dashboard</span>
		</a>

		<nav class="ml-auto hidden items-center gap-1 sm:flex" aria-label="Main navigation">
			<a
				class="button button-ghost"
				href="https://osipy.readthedocs.io"
				target="_blank"
				rel="noreferrer">Documentation</a
			>
			<a class="button button-ghost" href={resolve('/about')}>About</a>
			<div class="mx-1 h-5 border-l"></div>
			<a
				class="button button-ghost button-icon"
				href="https://github.com/OSIPI/dashboard"
				target="_blank"
				rel="noreferrer"
				aria-label="Open OSIPY dashboard repository on GitHub"
			>
				<GithubIcon class="h-4 w-4" aria-hidden="true" />
			</a>
		</nav>

		<button
			class="button button-ghost button-icon ml-auto sm:hidden"
			type="button"
			onclick={() => (menuOpen = !menuOpen)}
			aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
			aria-expanded={menuOpen}
		>
			{#if menuOpen}<XIcon class="h-5 w-5" />{:else}<MenuIcon class="h-5 w-5" />{/if}
		</button>
	</div>

	{#if menuOpen}
		<nav class="border-t bg-background px-4 py-3 sm:hidden" aria-label="Mobile navigation">
			<a
				class="flex rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
				href="https://osipy.readthedocs.io"
				target="_blank"
				rel="noreferrer"
				onclick={() => (menuOpen = false)}>Documentation</a
			>
			<a
				class="flex rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
				href={resolve('/about')}
				onclick={() => (menuOpen = false)}>About</a
			>
		</nav>
	{/if}
</header>
