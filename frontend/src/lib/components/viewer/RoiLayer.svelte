<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import ContrastIcon from '~icons/lucide/contrast';
	import EyeIcon from '~icons/lucide/eye';
	import EyeOffIcon from '~icons/lucide/eye-off';
	import EllipsisIcon from '~icons/lucide/ellipsis';
	import type { Roi } from '$lib/roi';
	import type { RoiSession } from '$lib/roi-session.svelte';

	let {
		roi,
		session,
		defaultVisible,
		defaultOpacity,
		open,
		ontoggle,
		onremove
	}: {
		roi: Roi;
		session: RoiSession;
		defaultVisible: boolean;
		defaultOpacity: number;
		open: boolean;
		ontoggle: () => void;
		onremove: (clear: boolean) => void;
	} = $props();
	const selected = $derived(roi.id === session.selected);
	const visible = $derived(roi.visible ?? defaultVisible);
	const opacity = $derived(Math.round((roi.opacity ?? defaultOpacity) * 100));
	const shownOpacity = $derived(
		session.opacityPreview?.id === roi.id
			? Math.round(session.opacityPreview.opacity * 100)
			: opacity
	);
	let renaming = $state(false);
	let nameInput: HTMLInputElement;
	let nameButton: HTMLButtonElement;
	let actionsButton: HTMLButtonElement;
	let drag: { id: number; x: number; start: number } | undefined;
	const controlsId = $props.id();
	onDestroy(() => {
		if (drag && session.opacityPreview?.id === roi.id) session.opacityPreview = undefined;
	});

	async function rename() {
		session.selected = roi.id;
		renaming = true;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}

	async function finishName(value?: string, restoreFocus = false) {
		if (!renaming) return;
		renaming = false;
		const name = value?.trim();
		if (name && name !== roi.name) session.edit(roi.id, { name });
		if (restoreFocus) {
			await tick();
			nameButton?.focus();
		}
	}

	const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
	function setOpacity(value: number) {
		if (Number.isFinite(value) && percent(value) !== opacity)
			session.edit(roi.id, { opacity: percent(value) / 100 });
	}
	function scrubValue(event: PointerEvent, start: NonNullable<typeof drag>) {
		return percent(start.start + event.clientX - start.x);
	}
	function startScrub(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (event.button !== 0 || !event.isPrimary) return;
		drag = { id: event.pointerId, x: event.clientX, start: opacity };
		event.currentTarget.setPointerCapture(event.pointerId);
	}
	function moveScrub(event: PointerEvent) {
		if (drag?.id === event.pointerId)
			session.opacityPreview = { id: roi.id, opacity: scrubValue(event, drag) / 100 };
	}
	function endScrub(event: PointerEvent, commit = false) {
		if (drag?.id !== event.pointerId) return;
		const value = scrubValue(event, drag);
		drag = undefined;
		session.opacityPreview = undefined;
		if (commit) setOpacity(value);
	}

	const iconButton = 'button button-ghost h-8 w-8 shrink-0 p-0 max-[899px]:h-11 max-[899px]:w-11';
</script>

<li
	class="rounded-md border p-1 {selected
		? 'border-selection/55 bg-selection-surface'
		: 'border-transparent hover:bg-muted/45'}"
>
	<div class="flex min-w-0 items-center gap-0.5">
		<input
			type="color"
			value={roi.color}
			aria-label="Color for {roi.name}"
			title="Change layer color"
			class="h-8 w-8 shrink-0 cursor-pointer rounded-md bg-transparent p-1.5 focus-visible:outline-2 focus-visible:outline-ring max-[899px]:h-11 max-[899px]:w-10 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch-wrapper]:p-0"
			onchange={(event) => {
				if (event.currentTarget.value !== roi.color)
					session.edit(roi.id, { color: event.currentTarget.value });
			}}
		/>
		{#if renaming}
			<input
				class="input h-8 min-w-0 flex-1 px-1.5 text-xs max-[899px]:h-11"
				bind:this={nameInput}
				aria-label="Layer name"
				maxlength="80"
				value={roi.name}
				onblur={(event) => finishName(event.currentTarget.value)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === 'Escape') {
						event.preventDefault();
						finishName(event.key === 'Enter' ? event.currentTarget.value : undefined, true);
					}
				}}
			/>
		{:else}
			<button
				type="button"
				bind:this={nameButton}
				class="button button-ghost h-8 min-w-0 flex-1 justify-start px-1 text-left text-xs max-[899px]:h-11 {selected
					? 'font-semibold'
					: ''}"
				aria-current={selected}
				title="{roi.name} · {roi.indices.length} voxels · Double-click or press F2 to rename"
				onclick={() => (session.selected = roi.id)}
				ondblclick={rename}
				onkeydown={(event) => {
					if (event.key === 'F2') {
						event.preventDefault();
						void rename();
					}
				}}><span class="truncate">{roi.name}</span></button
			>
		{/if}
		<div
			class="flex shrink-0 items-center rounded-md border bg-background/75 text-xs focus-within:border-selection"
		>
			<button
				type="button"
				class="{iconButton} cursor-ew-resize touch-none text-muted-foreground select-none"
				title="Drag left or right to change opacity"
				aria-label="Scrub opacity for {roi.name}"
				onpointerdown={startScrub}
				onpointermove={moveScrub}
				onpointerup={(event) => endScrub(event, true)}
				onpointercancel={(event) => endScrub(event)}
				onlostpointercapture={(event) => endScrub(event)}
				onkeydown={(event) => {
					if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
						event.preventDefault();
						const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
						setOpacity(opacity + direction * (event.shiftKey ? 10 : 1));
					}
				}}
				onclick={(event) => {
					if (!event.detail) {
						const input = event.currentTarget.nextElementSibling as HTMLInputElement;
						input.focus();
						input.select();
					}
				}}><ContrastIcon class="size-4" aria-hidden="true" /></button
			>
			<input
				type="text"
				inputmode="numeric"
				maxlength="3"
				value={shownOpacity}
				class="h-8 w-[4ch] shrink-0 border-0 bg-transparent p-0 text-right text-xs text-foreground tabular-nums focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring max-[899px]:h-11"
				aria-label="Opacity percentage for {roi.name}"
				onchange={(event) => {
					const text = event.currentTarget.value.trim();
					const value = /^\d+$/.test(text) ? percent(Number(text)) : opacity;
					setOpacity(value);
					event.currentTarget.value = String(value);
				}}
				onkeydown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
					if (event.key === 'Escape') {
						event.currentTarget.value = String(shownOpacity);
						event.currentTarget.blur();
					}
				}}
			/>
			<span class="pr-1 pl-0.5 text-muted-foreground" aria-hidden="true">%</span>
		</div>
		<button
			type="button"
			class="{iconButton} {visible ? '' : 'text-muted-foreground'}"
			aria-label="{visible ? 'Hide' : 'Show'} {roi.name}"
			title={visible ? 'Hide layer' : 'Show layer'}
			onclick={() => session.edit(roi.id, { visible: !visible })}
		>
			{#if visible}<EyeIcon class="size-4" aria-hidden="true" />{:else}<EyeOffIcon
					class="size-4"
					aria-hidden="true"
				/>{/if}
		</button>
		<button
			type="button"
			bind:this={actionsButton}
			class={iconButton}
			aria-label="Actions for {roi.name}"
			title="Layer actions"
			aria-expanded={open}
			aria-controls={open ? controlsId : undefined}
			onclick={ontoggle}
			onkeydown={(event) => {
				if (open && event.key === 'Escape') {
					event.stopPropagation();
					ontoggle();
				}
			}}
		>
			<EllipsisIcon class="size-4" aria-hidden="true" />
		</button>
	</div>
	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			id={controlsId}
			role="group"
			aria-label="Actions for {roi.name}"
			class="mt-1 flex flex-wrap justify-end gap-1 rounded-md border bg-background p-1"
			onkeydown={(event) => {
				if (event.key === 'Escape') {
					event.stopPropagation();
					ontoggle();
					actionsButton.focus();
				}
			}}
		>
			<button
				type="button"
				class="button button-ghost h-8 text-xs max-[899px]:h-11"
				onclick={() => {
					ontoggle();
					void rename();
				}}>Rename</button
			>
			<button
				type="button"
				class="button button-ghost h-8 text-xs max-[899px]:h-11"
				disabled={!roi.indices.length}
				onclick={() => onremove(true)}>Clear mask</button
			>
			<button
				type="button"
				class="button button-ghost h-8 text-xs text-destructive max-[899px]:h-11"
				onclick={() => onremove(false)}>Delete ROI</button
			>
		</div>
	{/if}
</li>
