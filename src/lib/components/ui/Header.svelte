<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount, type Snippet } from 'svelte';
	import Logo from '$lib/assets/icons/Logo.svelte';
	import MoonIcon from '~icons/lucide/moon';
	import SunIcon from '~icons/lucide/sun';

	let dark = $state(true);
	let {
		technique = $bindable(),
		children
	}: {
		technique?: 'DCE' | 'DSC' | 'ASL' | 'IVIM';
		children?: Snippet;
	} = $props();

	onMount(() => (dark = document.documentElement.classList.contains('dark')));

	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('theme', dark ? 'dark' : 'light');
		} catch {
			// The selected mode still applies when storage is unavailable.
		}
	}
</script>

<header class="app-header">
	<div class="app-navigation">
		<a class="brand" href={resolve('/')} aria-label="OSIPY dashboard home">
			<Logo class="size-7 rounded-md" /><span>OSIPY</span>
		</a>
		{#if technique}
			<nav class="techniques" aria-label="MRI technique">
				{#each ['DCE', 'DSC', 'ASL', 'IVIM'] as key (key)}
					<button
						class="button {technique === key ? 'button-primary' : 'button-ghost'}"
						aria-pressed={technique === key}
						title={key === 'IVIM' ? 'In-vivo IVIM viewer' : `${key}: not implemented`}
						onclick={() => (technique = key as typeof technique)}>{key}</button
					>
				{/each}
			</nav>
		{:else}
			<a class="button button-outline" href={resolve('/')}>Open viewer</a>
		{/if}
		<nav class="secondary-links" aria-label="Resources">
			<a href="https://osipy.readthedocs.io" target="_blank" rel="noreferrer">Docs</a>
			<a href="https://github.com/OSIPI/dashboard" target="_blank" rel="noreferrer">GitHub</a>
			<button
				class="button button-ghost button-icon"
				type="button"
				onclick={toggleTheme}
				aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
			>
				{#if dark}<SunIcon class="size-4" aria-hidden="true" />{:else}<MoonIcon
						class="size-4"
						aria-hidden="true"
					/>{/if}
			</button>
		</nav>
	</div>
	{#if children}<div class="app-context">{@render children()}</div>{/if}
</header>

<style>
	.app-header {
		flex-shrink: 0;
		border-bottom: 1px solid var(--border);
		background: var(--card);
		padding-top: env(safe-area-inset-top);
	}
	.app-navigation {
		display: flex;
		align-items: center;
		gap: 24px;
		min-height: 54px;
		padding: 9px 12px;
		background: var(--background);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 650;
	}
	.techniques {
		display: flex;
		gap: 4px;
	}
	.techniques .button[aria-pressed='true'] {
		background: transparent;
		color: var(--selection);
		box-shadow: none;
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 8px;
	}
	.secondary-links {
		display: flex;
		margin-left: auto;
		gap: 16px;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.secondary-links a,
	.secondary-links button {
		display: flex;
		align-items: center;
		min-height: 36px;
	}
	.app-context {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 46px;
		padding: 6px 12px;
		border-top: 1px solid var(--border);
	}
	@media (max-width: 899px) {
		.app-navigation {
			flex-wrap: wrap;
			gap: 0 8px;
			padding: 0 8px;
			min-height: 44px;
		}
		.brand {
			font-size: 13px;
		}
		.secondary-links {
			gap: 14px;
		}
		.secondary-links a,
		.secondary-links button {
			min-height: 44px;
		}
		.secondary-links button {
			min-width: 44px;
		}
		.techniques {
			order: 3;
			width: 100%;
		}
		.techniques .button {
			flex: 1;
			height: 44px;
		}
		.app-context {
			flex-wrap: wrap;
			padding: 4px 8px;
		}
	}
</style>
