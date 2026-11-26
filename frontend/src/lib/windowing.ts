import type { Dataset, VoxelVolume } from './ivim';
import { autoWindow, minimumWindow, type Display } from './workspace';

// MRI has no universal intensity scale: these names describe sample statistics,
// not tissues, sequences, CT/HU thresholds, or diagnostic recommendations.
export const MRI_WINDOW_PRESETS = [
	{ id: 'balanced', label: 'MRI balanced · 2–98%', percentiles: [0.02, 0.98] },
	{ id: 'contrast', label: 'MRI high contrast · 5–95%', percentiles: [0.05, 0.95] },
	{ id: 'full', label: 'MRI full signal range', percentiles: [0, 1] }
] as const;
export type MriWindowPreset = (typeof MRI_WINDOW_PRESETS)[number]['id'];

export function presetWindow(
	volume: VoxelVolume,
	dataset: Dataset,
	slice: number | undefined,
	preset: MriWindowPreset
) {
	const { percentiles } = MRI_WINDOW_PRESETS.find((p) => p.id === preset)!;
	return autoWindow(volume, dataset, slice, true, { percentiles });
}

export function dragWindow(
	view: Display,
	dataset: Dataset,
	dx: number,
	dy: number,
	width: number,
	height: number
): Display {
	const range = dataset.signalRange[1] - dataset.signalRange[0];
	return {
		...view,
		width: Math.max(
			minimumWindow(dataset),
			Math.min(2 * range, view.width + (dx / Math.max(1, width)) * 2 * range)
		),
		center: Math.max(
			dataset.signalRange[0],
			Math.min(dataset.signalRange[1], view.center - (dy / Math.max(1, height)) * range)
		)
	};
}
