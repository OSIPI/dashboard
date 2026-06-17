<script lang="ts">
	import { base } from '$app/paths';
	import Logo from '$lib/assets/icons/Logo.svelte';
	import { toggleMenu } from '$lib/stores/menu.store';
	import menuItems from '$lib/models/menu-itmes';
	import GithubIcon from '~icons/simple-icons/github';

	interface Props {
		showSearch?: boolean;
	}

	let { showSearch = false }: Props = $props();
	let activeCategory = $state('');

	function hrefFor(path: string) {
		return path.startsWith('http') ? path : `${base}${path}`;
	}
</script>

<nav class="bien-nav mb-10">
	<div class="bien-glass"></div>
	<div class="bien-glass-edge"></div>
	<div class="relative container mx-auto py-2">
		<!--Desktop Header-->
		<header class="flex items-center gap-3 px-2 sm:px-0">
			<button
				class="rounded-md p-2 transition-colors duration-200 hover:bg-base-200 sm:hidden"
				onclick={toggleMenu}
				aria-label="Open menu"
			>
				<span class="block text-2xl leading-none">=</span>
			</button>
			<a
				class="no-drag mr-4 flex flex-initial shrink-0 select-none items-center gap-3"
				href="{base}/"
				aria-label="OSIPY dashboard home"
			>
				<Logo class="h-9 w-9 object-contain sm:h-10 sm:w-10" />
				<span class="text-lg font-black tracking-[0.22em] text-base-content">OSIPY</span>
			</a>
			<div class="flex-1"></div>
			{#if showSearch}
				<div class="hidden text-sm text-base-content/60 sm:block">Search coming later</div>
			{/if}
			<!-- Desktop menu -->
			<div class="z-10 hidden w-full flex-1 justify-end space-x-4 sm:flex lg:space-x-8">
				{#each menuItems as link}
					<a
						class="menu-link"
						onclick={() => (activeCategory = link.title)}
						class:active={activeCategory === link.title}
						href={hrefFor(link.path)}
						target={link.path.startsWith('http') ? '_blank' : undefined}
						rel={link.path.startsWith('http') ? 'noreferrer' : undefined}
					>
						{link.displayTitle}
					</a>
				{/each}
			</div>
			<a
				class="btn btn-circle btn-ghost btn-sm"
				href="https://github.com/OSIPI/dashboard"
				target="_blank"
				rel="noreferrer"
				aria-label="Open OSIPY dashboard repository on GitHub"
			>
				<GithubIcon class="h-5 w-5" aria-hidden="true" />
			</a>
		</header>
	</div>
</nav>

<style>
	.menu-link.active {
		color: var(--color-primary);
	}

	/* Frosted navigation header */
	nav {
		z-index: 10000;
		position: sticky;
		left: 0;
		right: 0;
		top: 0;
		/* height: 100px; */
	}

	/* Frosted Navigation bar */
	.bien-glass {
		position: absolute;
		inset: 0;
		/*   Extend the backdrop to the bottom for it to "collect the light" outside of the nav */
		--extended-by: 100px;
		bottom: calc(-1 * var(--extended-by));

		--filter: blur(30px);
		-webkit-backdrop-filter: var(--filter);
		backdrop-filter: var(--filter);
		pointer-events: none;

		/*   Cut the part of the backdrop that falls outside of <nav /> */
		--cutoff: calc(100% - var(--extended-by));
		-webkit-mask-image: linear-gradient(
			to bottom,
			black 0,
			black var(--cutoff),
			transparent var(--cutoff)
		);
		mask-image: linear-gradient(to bottom, black 0, black var(--cutoff), transparent var(--cutoff));
	}

	.bien-glass-edge {
		position: absolute;
		z-index: -1;
		left: 0;
		right: 0;

		--extended-by: 80px;
		--offset: 20px;
		--thickness: 2px;
		height: calc(var(--extended-by) + var(--offset));
		/*   Offset is used to snuck the border backdrop slightly under the main backdrop for  smoother effect */
		top: calc(100% - var(--offset) + var(--thickness));

		/*   Make the blur bigger so that the light bleed effect spreads wider than blur on the first backdrop */
		/*   Increase saturation and brightness to fake smooth chamfered edge reflections */
		--filter: blur(90px) saturate(160%) brightness(1.3);
		-webkit-backdrop-filter: var(--filter);
		backdrop-filter: var(--filter);
		pointer-events: none;

		-webkit-mask-image: linear-gradient(
			to bottom,
			black 0,
			black var(--offset),
			transparent var(--offset)
		);
		mask-image: linear-gradient(to bottom, black 0, black var(--offset), transparent var(--offset));
	}
</style>
