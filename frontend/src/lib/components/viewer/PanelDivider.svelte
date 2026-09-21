<script lang="ts">
	let {
		side,
		value = $bindable(),
		other,
		workspaceWidth,
		onreset
	}: {
		side: 'series' | 'inspector';
		value: number;
		other: number;
		workspaceWidth: number;
		onreset: () => void;
	} = $props();
	function resize(event: PointerEvent) {
		if (event.button !== 0) return;
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		const start = event.clientX;
		const initial = value;
		const move = (e: PointerEvent) => {
			const available = workspaceWidth - 276;
			value =
				side === 'series'
					? Math.max(
							180,
							Math.min(
								420,
								available - Math.min(other, workspaceWidth * 0.35),
								initial + e.clientX - start
							)
						)
					: Math.max(
							240,
							Math.min(
								600,
								available - Math.min(other, workspaceWidth * 0.26),
								initial - e.clientX + start
							)
						);
		};
		const end = () => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', end);
			handle.removeEventListener('pointercancel', end);
			handle.removeEventListener('lostpointercapture', end);
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
		handle.addEventListener('lostpointercapture', end);
	}
	function keyboard(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
		e.preventDefault();
		if (e.key === 'Home') {
			onreset();
			return;
		}
		const delta = e.key === 'ArrowRight' ? 16 : -16;
		value =
			side === 'series'
				? Math.max(180, Math.min(420, value + delta))
				: Math.max(240, Math.min(600, value - delta));
	}
</script>

<button
	class="hidden cursor-col-resize touch-none rounded-[3px] bg-transparent hover:bg-selection focus-visible:bg-selection min-[900px]:block"
	aria-label="Resize {side} panel. Arrow keys adjust; Home resets layout."
	onpointerdown={resize}
	onkeydown={keyboard}
></button>
