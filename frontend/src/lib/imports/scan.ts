import type { Dataset, VoxelVolume } from '$lib/ivim';
import { createGeometry, nearestVoxel, toWorld, type Point } from '$lib/spatial';

export type Technique = 'IVIM' | 'DCE' | 'DSC' | 'ASL' | 'Unassigned';
export type ValidationIssue = { severity: 'error' | 'warning' | 'info'; message: string };
export type ScanMetadata = {
	subject: string;
	study: string;
	session: string;
	date: string;
	technique: Technique;
	coordinateFrame: string;
};
export type Scan = {
	id: string;
	dataset: Dataset;
	volumes: VoxelVolume[];
	metadata: ScanMetadata;
	issues: ValidationIssue[];
};
export const SESSION_LIMIT = 768 * 1024 * 1024;

export function validDate(value: string): boolean {
	if (!value) return true;
	const date = value.slice(0, 10);
	return (
		/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) &&
		Number.isFinite(Date.parse(value)) &&
		new Date(date).toISOString().slice(0, 10) === date
	);
}
export function compareScans(a: Scan, b: Scan): boolean {
	return (
		a.metadata.subject !== 'Unassigned' &&
		a.metadata.subject === b.metadata.subject &&
		a.metadata.study === b.metadata.study &&
		!!a.metadata.coordinateFrame.trim() &&
		a.metadata.coordinateFrame.trim() === b.metadata.coordinateFrame.trim()
	);
}
export function mapPoint(a: Dataset, b: Dataset, voxel: Point): Point | null {
	return nearestVoxel(createGeometry(b), toWorld(createGeometry(a), voxel));
}

export function orderScans<T extends Pick<Scan, 'metadata'>>(scans: T[]): T[] {
	return [...scans].sort((a, b) => {
		if (!a.metadata.date) return b.metadata.date ? 1 : 0;
		if (!b.metadata.date) return -1;
		return Date.parse(a.metadata.date) - Date.parse(b.metadata.date);
	});
}
