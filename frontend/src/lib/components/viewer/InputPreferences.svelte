<script lang="ts">
	import {
		INPUT_ACTIONS,
		defaultInputPreferences,
		shortcutKey,
		type InputPreferences,
		type InputAction
	} from '$lib/viewer-input';
	let { value = $bindable() }: { value: InputPreferences } = $props();
	let message = $state('');
	function rebind(event: KeyboardEvent, id: InputAction) {
		if (event.key === 'Tab') return;
		event.preventDefault();
		event.stopPropagation();
		const key = shortcutKey(event.key);
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !key) {
			message =
				'Use a letter, digit, punctuation, PageUp or PageDown without modifiers. Space, arrows, Escape and browser shortcuts are reserved.';
			return;
		}
		const conflict = INPUT_ACTIONS.find(
			([other]) => other !== id && value.shortcuts[other] === key
		);
		if (conflict) {
			message = `Already assigned to ${conflict[1]}. Clear that binding first.`;
			return;
		}
		value.shortcuts[id] = key;
		message = 'Shortcut updated.';
	}
</script>

<div class="mt-3 space-y-3 border-t pt-3" data-input-preferences>
	<h3 class="font-semibold">Mouse and keyboard bindings</h3>
	<label class="grid gap-1"
		>Wheel over image
		<select class="input min-h-11" bind:value={value.wheel}
			><option value="zoom">Zoom at pointer (default)</option><option value="slice"
				>Step through slices</option
			></select
		>
	</label>
	<label class="grid gap-1"
		>Primary drag with Voxel tool
		<select class="input min-h-11" bind:value={value.drag}
			><option value="tool">Select voxel (default)</option><option value="slice"
				>Step through slices</option
			></select
		>
	</label>
	<p class="text-muted-foreground">
		Slice drag: down advances, up reverses, one slice per 24 pixels. Pan and ROI tools take
		priority. Space + drag always pans; Shift + wheel scrolls the grid. Right-click opens layouts.
		Arrow keys move the voxel or pan with Pan selected. Escape cancels an ROI; Ctrl/⌘ + Z undoes it.
	</p>
	<p class="text-muted-foreground">
		Shortcuts work only with an image focused, never in text fields or other controls. Focus a
		binding and press a new key; Tab leaves it. Clear disables it. Preferences stay in this browser.
	</p>
	<div class="space-y-1">
		{#each INPUT_ACTIONS as [id, label] (id)}
			<div class="flex items-center justify-between gap-2">
				<span>{label}</span>
				<div class="flex shrink-0 gap-1">
					<input
						class="input min-h-11 w-24 text-center"
						aria-label="Shortcut for {label}"
						readonly
						value={value.shortcuts[id] || 'Unbound'}
						onkeydown={(event) => rebind(event, id)}
					/>
					<button
						class="button button-ghost min-h-11 px-2"
						aria-label="Clear shortcut for {label}"
						onclick={() => {
							value.shortcuts[id] = '';
							message = `${label} shortcut cleared.`;
						}}>Clear</button
					>
				</div>
			</div>
		{/each}
	</div>
	<p role="status" class="text-muted-foreground">{message}</p>
	<button
		class="button button-outline min-h-11"
		onclick={() => {
			value = defaultInputPreferences();
			message = 'Default bindings restored.';
		}}>Restore default bindings</button
	>
</div>
