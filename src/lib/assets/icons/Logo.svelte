<script lang="ts">
	import osipiAvatar from '$lib/assets/images/osipi-avatar.png';

	let { class: className = '' } = $props();
</script>

<img class={className} src={osipiAvatar} alt="OSIPI logo" width="200" height="200" />
