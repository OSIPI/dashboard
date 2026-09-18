import { GRID_LAYOUTS, type GridLayout } from './workspace';
import type { Dataset } from './ivim';

export type LayoutPreferences = {
	panel: 'Image' | 'Controls' | 'Series' | 'Inspector';
	gridLayout: GridLayout;
	seriesLayout: 'grid' | 'list';
	seriesWidth: number;
	inspectorWidth: number;
	linked: boolean;
	navigationOpen: boolean;
	signalValuesOpen: boolean;
	signalOpen: boolean;
	savedVoxelsOpen: boolean;
	workspaceOpen: boolean;
	analysisOpen: boolean;
	roiOpen: boolean;
	exportOpen: boolean;
	validationOpen: boolean;
	metadataOpen: boolean;
	roiVisible: boolean;
	roiOpacity: number;
	roiMean: boolean;
};
export const DEFAULT_LAYOUT: LayoutPreferences = {
	panel: 'Image',
	gridLayout: 'auto',
	seriesLayout: 'grid',
	seriesWidth: 260,
	inspectorWidth: 400,
	linked: true,
	navigationOpen: false,
	signalValuesOpen: false,
	signalOpen: true,
	savedVoxelsOpen: true,
	workspaceOpen: true,
	analysisOpen: true,
	roiOpen: true,
	exportOpen: true,
	validationOpen: true,
	metadataOpen: false,
	roiVisible: true,
	roiOpacity: 0.25,
	roiMean: false
};

export function parseLayout(raw: string): LayoutPreferences {
	try {
		const value = JSON.parse(raw);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_LAYOUT };
		const result = { ...DEFAULT_LAYOUT };
		if (['Image', 'Controls', 'Series', 'Inspector'].includes(value.panel))
			result.panel = value.panel;
		if (GRID_LAYOUTS.some((g) => g.id === value.gridLayout)) result.gridLayout = value.gridLayout;
		if (['grid', 'list'].includes(value.seriesLayout)) result.seriesLayout = value.seriesLayout;
		if (Number.isFinite(value.seriesWidth))
			result.seriesWidth = Math.max(180, Math.min(420, value.seriesWidth));
		if (Number.isFinite(value.inspectorWidth))
			result.inspectorWidth = Math.max(240, Math.min(600, value.inspectorWidth));
		if (Number.isFinite(value.roiOpacity))
			result.roiOpacity = Math.max(0, Math.min(1, value.roiOpacity));
		for (const key of [
			'linked',
			'navigationOpen',
			'signalValuesOpen',
			'signalOpen',
			'savedVoxelsOpen',
			'workspaceOpen',
			'analysisOpen',
			'roiOpen',
			'exportOpen',
			'validationOpen',
			'metadataOpen',
			'roiVisible',
			'roiMean'
		] as const)
			if (typeof value[key] === 'boolean') result[key] = value[key];
		return result;
	} catch {
		return { ...DEFAULT_LAYOUT };
	}
}

export type PaneSelection = { active: number; selected: number[] };
export function parsePanes(raw: string, dataset: Pick<Dataset, 'dimensions'>): PaneSelection {
	try {
		const value = JSON.parse(raw);
		const valid = (v: number) => Number.isInteger(v) && v >= 0 && v < dataset.dimensions[3];
		if (
			value &&
			valid(value.active) &&
			Array.isArray(value.selected) &&
			value.selected.length <= dataset.dimensions[3] &&
			value.selected.every(valid) &&
			new Set(value.selected).size === value.selected.length &&
			(!value.selected.length || value.selected.includes(value.active))
		)
			return { active: value.active, selected: value.selected };
	} catch {
		/* Invalid local data resets this dataset's arrangement. */
	}
	return { active: 0, selected: [0] };
}
