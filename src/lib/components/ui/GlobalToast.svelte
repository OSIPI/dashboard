<script lang="ts">
	import { Toaster } from 'svelte-french-toast';
</script>

<Toaster
	position="bottom-center"
	gutter={8}
	toastOptions={{
		style:
			'background: var(--popover); color: var(--popover-foreground); border: 1px solid var(--border); border-radius: var(--radius); font-weight: 500;'
	}}
/>
