import { rasterizeRoi, editRoi, ROI_COLORS, type Roi, type PixelPoint } from './roi';
import type { Dataset } from './ivim';

export class RoiSession {
	rois = $state.raw<Roi[]>([]);
	selected = $state('');
	erase = $state(false);
	error = $state('');
	history = $state.raw<Roi[][]>([]);
	constructor(readonly dataset: Dataset) {}
	get current() {
		return this.rois.find((r) => r.id === this.selected);
	}
	update(rois: Roi[]) {
		this.history = [...this.history.slice(-9), this.rois];
		this.rois = rois;
		this.error = '';
		if (!rois.some((r) => r.id === this.selected)) this.selected = rois[0]?.id ?? '';
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
			indices: []
		};
		this.update([...this.rois, roi]);
		this.selected = roi.id;
	}
	draw(points: PixelPoint[], slice: number, rectangle: boolean) {
		try {
			if (!this.current) this.add();
			const roi = this.current;
			if (!roi) return;
			const indices = editRoi(
				roi.indices,
				rasterizeRoi(points, slice, this.dataset.dimensions, rectangle),
				this.erase
			);
			this.update(this.rois.map((r) => (r.id === roi.id ? { ...r, indices } : r)));
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'ROI drawing failed.';
		}
	}
	undo() {
		const previous = this.history.at(-1);
		if (!previous) return;
		this.history = this.history.slice(0, -1);
		this.rois = previous;
		if (!previous.some((r) => r.id === this.selected)) this.selected = previous[0]?.id ?? '';
		this.error = '';
	}
}
