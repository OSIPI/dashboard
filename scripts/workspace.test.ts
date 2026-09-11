import { expect, test } from 'bun:test';
import type { Dataset } from '../src/lib/ivim';
import {
	autoWindow,
	chartSvg,
	defaultDisplay,
	zoomAtPointer,
	gridVolumes,
	replaceActiveVolume,
	parseWorkspace,
	voxelCsv,
	type Workspace
} from '../src/lib/workspace';

const dataset: Dataset = {
	schema: 1,
	id: 'test',
	name: 'Test <unsafe>',
	dimensions: [2, 2, 2, 3],
	spacing: [1, 1, 1],
	spatialUnit: 'mm',
	affine: [
		[1, 0, 0, 0],
		[0, 1, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1]
	],
	axisCodes: ['R', 'A', 'S'],
	slope: 2,
	intercept: -5,
	bValues: [0, 10, 10],
	bVectors: [
		[0, 0, 0],
		[1, 0, 0],
		[0, 1, 0]
	],
	dtype: 'int16-le',
	order: 'x-y-z-volume',
	byteLength: 48,
	sha256: 'a'.repeat(64),
	signalRange: [-5, 500],
	window: [100, 200]
};
const bookmark = { id: 'saved', datasetId: 'test', b: 2, x: 1, y: 0, z: 1, note: 'original note' };
const workspace: Workspace = {
	version: 1,
	datasetId: dataset.id,
	sha256: dataset.sha256,
	x: 1,
	y: 0,
	slice: 1,
	volume: 2,
	selected: [1, 2],
	gridLayout: 'four',
	linked: false,
	display: defaultDisplay(dataset),
	tiles: { 1: { ...defaultDisplay(dataset), zoom: 2, panX: -35 } },
	bookmarks: [bookmark],
	compared: ['saved'],
	seriesWidth: 260,
	inspectorWidth: 400,
	search: 'b 10',
	range: '10',
	list: true,
	note: 'unsaved draft'
};

test('wheel zoom is bounded and preserves the point under the cursor', () => {
	const view = { zoom: 2, panX: 10, panY: -5, center: 100, width: 200 };
	const next = zoomAtPointer(view, -100, 40, -20);
	expect(next.zoom).toBeGreaterThan(view.zoom);
	expect((40 + view.panX - next.panX) / next.zoom).toBeCloseTo(40 / view.zoom);
	expect((-20 + view.panY - next.panY) / next.zoom).toBeCloseTo(-20 / view.zoom);
	expect(next.center).toBe(view.center);
	expect(next.width).toBe(view.width);
	expect(zoomAtPointer(view, 100, 0, 0).zoom).toBeLessThan(view.zoom);
	expect(zoomAtPointer({ ...view, zoom: 4 }, -10000, 40, 20)).toEqual({ ...view, zoom: 4 });
	expect(zoomAtPointer({ ...view, zoom: 1 }, 10000, 40, 20)).toEqual({ ...view, zoom: 1 });
});

test('grid layouts page by acquisition identity and never discard overflow selections', () => {
	expect(replaceActiveVolume([0, 1], 0, 4)).toEqual([4, 1]);
	expect(replaceActiveVolume([0, 1], 0, 1)).toEqual([0, 1]);
	expect(replaceActiveVolume([], 0, 4)).toEqual([4]);
	const selected = [2, 3, 5, 6, 10, 11, 12, 13, 20];
	expect(gridVolumes(selected, 10, 'auto')).toEqual(selected);
	expect(gridVolumes(selected, 10, 'four')).toEqual([10, 11, 12, 13]);
	expect(gridVolumes(selected, 20, 'eight')).toEqual([20]);
	expect(gridVolumes(selected, 3, 'pair')).toEqual([2, 3]);
	expect(gridVolumes([], 7, 'four')).toEqual([7]);
	expect(() =>
		parseWorkspace(JSON.stringify({ ...workspace, gridLayout: 'invalid' }), dataset)
	).toThrow();
});

test('workspace round trip preserves acquisition identity, independent views, notes and layout', () => {
	expect(parseWorkspace(JSON.stringify(workspace), dataset)).toEqual(workspace);
	for (const change of [
		{ version: 2 },
		{ sha256: 'b'.repeat(64) },
		{ datasetId: 'another' },
		{ slice: 2 },
		{ x: -1 },
		{ selected: [1, 1] },
		{ selected: [3] },
		{ display: { ...workspace.display, zoom: null } },
		{ tiles: { bad: workspace.display } },
		{ tiles: { 1: { ...workspace.display, width: 0 } } },
		{ compared: ['missing'] },
		{ bookmarks: [bookmark, bookmark] },
		{ range: '15' },
		{ note: 'a'.repeat(241) },
		{ seriesWidth: 0 },
		{ linked: 'true' }
	])
		expect(() => parseWorkspace(JSON.stringify({ ...workspace, ...change }), dataset)).toThrow();
	expect(() => parseWorkspace('a'.repeat(100001), dataset)).toThrow('too large');
});

test('auto window uses scaled intensities, explicit slice/volume scope, robust quantiles and constant fallback', () => {
	const samples = new Int16Array([0, 10, 20, 30, 40, 50, 60, 70]);
	expect(autoWindow(samples, dataset, 0, false)).toEqual({ center: 25, width: 60 });
	expect(autoWindow(samples, dataset, undefined, false)).toEqual({ center: 65, width: 140 });
	expect(autoWindow(new Int16Array(8).fill(10), dataset, 1, true)).toEqual({
		center: 15,
		width: 1
	});
	const outliers = new Int16Array(Array.from({ length: 100 }, (_, i) => (i === 99 ? 32767 : i)));
	expect(autoWindow(outliers, dataset, undefined, true)).toEqual({ center: 93, width: 192 });
	expect(samples[7]).toBe(70);
});

test('scatter and CSV keep repeated acquisitions; exports escape user text and include real coordinates/units', () => {
	const values = [100, 65, 60];
	const svg = chartSvg(dataset, [{ label: 'Current (1, 0, 1) <script>', values }], 2, true);
	expect(svg.match(/<circle /g)).toHaveLength(3);
	expect(svg).not.toContain('<polyline');
	expect(svg).not.toContain('<script>');
	expect(svg).toContain('&lt;script&gt;');
	expect(svg).toContain('b-value (s/mm²)');
	expect(svg).toContain('volume 3 · b=10 · 60');
	const rows = voxelCsv(dataset, values, 1, 0, 1).split('\r\n');
	expect(rows).toHaveLength(4);
	expect(rows[2]).toContain('"1","0","1","2","10","65"');
	expect(rows[3]).toContain('"1","0","1","3","10","60"');
});
