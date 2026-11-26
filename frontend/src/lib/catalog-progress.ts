/** Curated dashboard coverage, separate from OSIPY's scientific registry snapshot. */
export const progressSnapshotDate = '2026-11-17';
export const dashboardTools = [
	{
		id: 'import',
		label: 'Import NIfTI scans',
		description:
			'Load local 3D/4D images with diffusion sidecars and retain acquisition order and image geometry.',
		action: 'Open dataset library',
		destination: 'library'
	},
	{
		id: 'discovery',
		label: 'Discover BIDS & DICOM series',
		description:
			'Browse subjects and series locally. DICOM discovery reads headers; pixel decoding is not available.',
		action: 'Browse local data',
		destination: 'library'
	},
	{
		id: 'view',
		label: 'Explore images & acquisitions',
		description: 'Navigate slices, zoom, pan, adjust windowing and compare acquisition panes.',
		action: 'Open viewer',
		destination: 'viewer'
	},
	{
		id: 'roi',
		label: 'Draw ROIs & import masks',
		description:
			'Create native-grid regions, undo edits and inspect regional mean signals. Imported masks must match the scan geometry.',
		action: 'Open ROI tools',
		destination: 'ROI'
	},
	{
		id: 'compare',
		label: 'Compare scans',
		description:
			'Compare scans from the same subject and study. Linked navigation requires an explicitly verified spatial relationship.',
		action: 'Open scan workspace',
		destination: 'viewer'
	},
	{
		id: 'bookmarks',
		label: 'Save voxels & notes',
		description:
			'Bookmark voxel locations and compare their acquired signals without changing the source samples.',
		action: 'Open saved voxels',
		destination: 'Saved'
	},
	{
		id: 'workspace',
		label: 'Save & restore workspaces',
		description:
			'Export and restore viewing settings and notes using a dataset-bound workspace file.',
		action: 'Open workspace tools',
		destination: 'Data & export'
	},
	{
		id: 'export',
		label: 'Export maps & research bundles',
		description:
			'Download available maps, ROI masks, reports and checksums. Result exports require an analysis result.',
		action: 'Open export tools',
		destination: 'Data & export'
	}
] as const;

// Existing tracked work only. Open PRs are not treated as available on main.
export const catalogRoadmap = [
	{
		id: 'cine',
		label: 'Cine playback',
		description: 'Slice/acquisition playback, frame stepping and adjustable frame rate.',
		modality: 'Shared tools',
		status: 'In progress',
		priority: 'P1',
		tracking: 'PR #24',
		url: 'https://github.com/OSIPI/dashboard/pull/24',
		note: 'Implementation awaiting review and merge'
	},
	{
		id: 'bindings',
		label: 'Mouse & keyboard bindings',
		description: 'Configurable navigation controls and tool shortcuts.',
		modality: 'Shared tools',
		status: 'In progress',
		priority: 'P1',
		tracking: 'PR #25',
		url: 'https://github.com/OSIPI/dashboard/pull/25',
		note: 'Implementation awaiting review and merge'
	},
	{
		id: 'windowing',
		label: 'Direct & regional windowing',
		description: 'Drag to adjust window/level and select a region for automatic windowing.',
		modality: 'Shared tools',
		status: 'In progress',
		priority: 'P1',
		tracking: 'PR #26',
		url: 'https://github.com/OSIPI/dashboard/pull/26',
		note: 'Implementation awaiting review and merge'
	},
	{
		id: 'inspection',
		label: 'Transforms, magnifier & pixel probe',
		description: 'Rotate, flip, invert and inspect source intensities with physical coordinates.',
		modality: 'Shared tools',
		status: 'In progress',
		priority: 'P1',
		tracking: 'PR #27',
		url: 'https://github.com/OSIPI/dashboard/pull/27',
		note: 'Implementation awaiting review and merge'
	},
	{
		id: 'dicom-pixels',
		label: 'DICOM image decoding',
		description: 'Extend header discovery to supported pixel decoding and transfer syntaxes.',
		modality: 'Shared tools',
		status: 'Planned',
		priority: 'P2',
		tracking: 'OHIF-41 · issue #23',
		url: 'https://github.com/OSIPI/dashboard/issues/23',
		note: 'Backlog item; no delivery date agreed'
	},
	{
		id: 'contrast',
		label: 'Contrast administration details',
		description:
			'Record dose and administration rate with explicit units for future DCE/DSC workflows.',
		modality: 'DCE / DSC',
		status: 'Planned',
		priority: 'Unprioritized',
		tracking: 'Issue #12',
		url: 'https://github.com/OSIPI/dashboard/issues/12',
		note: 'Requirement recorded; workflow design pending'
	}
] as const;
