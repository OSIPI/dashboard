<script lang="ts">
	import type { ValidationIssue } from '$lib/imports/scan';
	let { issues }: { issues: ValidationIssue[] } = $props();
</script>

<ul class="space-y-1 text-xs leading-5" aria-label="Dataset validation">
	{#each issues as issue, i (i)}<li
			class={issue.severity === 'error'
				? 'text-destructive'
				: issue.severity === 'warning'
					? 'rounded bg-warning/10 px-2 py-1 text-foreground'
					: 'text-muted-foreground'}
		>
			<strong class="uppercase">{issue.severity}:</strong>
			{issue.message}
		</li>{/each}
</ul>
