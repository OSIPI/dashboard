import { rasterizeRoi, editRoi, ROI_COLORS, type Roi, type PixelPoint } from './roi';
import type { Dataset } from './ivim';

export class RoiSession {
	rois = $state.raw<Roi[]>([]);
	selected = $state('');
	erase = $state(false);
	error = $state('');
	history = $state.raw<{ rois: Roi[]; selected: string; notice?: string }[]>([]);
	opacityPreview = $state.raw<{ id: string; opacity: number }>();
	constructor(readonly dataset: Dataset) {}
	get current() {
		return this.rois.find((r) => r.id === this.selected);
	}
	update(rois: Roi[], notice?: string) {
		this.history = [
			...this.history.slice(-9),
			{ rois: this.rois, selected: this.selected, notice }
		];
		this.rois = rois;
		this.error = '';
		if (!rois.some((r) => r.id === this.selected)) this.selected = rois.at(-1)?.id ?? '';
	}
	edit(
		id: string,
		changes: Partial<Pick<Roi, 'name' | 'color' | 'visible' | 'opacity' | 'indices'>>,
		notice?: string
	) {
		this.update(
			this.rois.map((roi) => (roi.id === id ? { ...roi, ...changes } : roi)),
			notice
		);
	}
	add() {
		if (this.dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1) > 5_000_000) {
			this.error = 'ROI editing supports grids up to five million spatial voxels.';
			return;
		}
		if (this.rois.length >= 32) {
			this.error = 'At most 32 ROIs per dataset.';
			return;
		}
		let label = 1;
		while (this.rois.some((r) => r.label === label)) label++;
		const roi = {
			id: crypto.randomUUID(),
			label,
			name: `ROI ${label}`,
			color: ROI_COLORS[this.rois.length % ROI_COLORS.length],
			visible: true,
			opacity: 0.25,
			indices: []
		};
		this.update([...this.rois, roi]);
		this.selected = roi.id;
		this.erase = false;
		return roi;
	}
	draw(
		points: PixelPoint[],
		slice: number,
		rectangle: boolean,
		defaultVisible = true,
		target = this.selected
	) {
		try {
			const roi = this.rois.find((r) => r.id === target);
			if (!roi) return;
			if (!(roi.visible ?? defaultVisible)) {
				this.error = `Show ${roi.name} before drawing on it.`;
				return;
			}
			const indices = editRoi(
				roi.indices,
				rasterizeRoi(points, slice, this.dataset.dimensions, rectangle),
				this.erase
			);
			if (
				indices.length !== roi.indices.length ||
				indices.some((index, i) => index !== roi.indices[i])
			)
				this.edit(roi.id, { indices });
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'ROI drawing failed.';
		}
	}
	undo() {
		const previous = this.history.at(-1);
		if (!previous) return;
		this.history = this.history.slice(0, -1);
		this.rois = previous.rois;
		this.selected = previous.selected;
		this.error = '';
	}
}
