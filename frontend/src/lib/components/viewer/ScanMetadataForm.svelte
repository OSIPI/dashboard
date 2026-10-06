<script lang="ts">
	import type { ScanMetadata } from '$lib/imports/scan';
	let { value, onchange }: { value: ScanMetadata; onchange: (value: ScanMetadata) => void } =
		$props();
</script>

<div class="grid gap-2 text-xs sm:grid-cols-3">
	<label
		>Subject ID<input
			class="input mt-1 block w-full px-2 py-1.5"
			value={value.subject}
			maxlength="128"
			onchange={(e) =>
				onchange({ ...value, subject: e.currentTarget.value.trim() || 'Unassigned' })}
		/></label
	>
	<label
		>Study<input
			class="input mt-1 block w-full px-2 py-1.5"
			value={value.study}
			maxlength="128"
			onchange={(e) => onchange({ ...value, study: e.currentTarget.value.trim() || 'Local study' })}
		/></label
	>
	<label
		>Scan / timepoint<input
			class="input mt-1 block w-full px-2 py-1.5"
			value={value.session}
			maxlength="128"
			onchange={(e) =>
				onchange({ ...value, session: e.currentTarget.value.trim() || 'Unnamed scan' })}
		/></label
	>
	<label
		>Acquisition date / ISO timestamp<input
			class="input mt-1 block w-full px-2 py-1.5"
			value={value.date}
			maxlength="64"
			placeholder="Unknown (not inferred)"
			onchange={(e) => onchange({ ...value, date: e.currentTarget.value.trim() })}
		/></label
	>
	<label
		>Technique<select
			class="input mt-1 block w-full px-2 py-1.5"
			value={value.technique}
			onchange={(e) =>
				onchange({ ...value, technique: e.currentTarget.value as ScanMetadata['technique'] })}
			>{#each ['Unassigned', 'IVIM', 'DCE', 'DSC', 'ASL'] as technique (technique)}<option
					>{technique}</option
				>{/each}</select
		></label
	>
	<label
		>Verified shared coordinate frame<input
			class="input mt-1 block w-full px-2 py-1.5"
			value={value.coordinateFrame}
			maxlength="128"
			placeholder="Only if registered / same frame"
			onchange={(e) => onchange({ ...value, coordinateFrame: e.currentTarget.value.trim() })}
		/></label
	>
</div>
