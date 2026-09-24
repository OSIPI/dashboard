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
	expect(svg).toContain('font-size="13"');
	expect(svg).not.toContain('font-size="20"');
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

test('compact charts preserve real fits and acquisitions while expanded exports include residuals', () => {
	const series = [{ label: 'Current voxel', values: [100, 65, 60] }];
	const fit = {
		parameters: { S0: 100, D: 0.001, 'D*': 0.02, f: 0.2 },
		valid: false,
		model: 'OSIPY biexponential'
	};
	const preview = chartSvg(dataset, series, 2, true, fit, true);
	expect(preview.match(/<circle /g)).toHaveLength(3);
	expect(preview).toContain('<polyline');
	expect(preview).toContain('stroke-dasharray="6 4"');
	expect(preview).toContain('fit · flagged');
	expect(preview).not.toContain('Residuals (');
	expect(preview).not.toMatch(/NaN|Infinity/);
	const expanded = chartSvg(dataset, series, 2, false, fit);
	expect(expanded).toContain('Residuals (');
	expect(expanded).toContain('flagged estimate');
	expect(expanded).not.toContain('data-chart-fit');
	const interactive = chartSvg(dataset, series, 2, true, fit, false, true);
	expect(interactive).toContain('data-chart-fit');
	expect(interactive).toContain('Hover or use arrow keys to inspect predicted signal');
	expect(chartSvg(dataset, series, 2, true, undefined, true)).not.toContain('<polyline');
});

test('interactive chart exposes each acquisition without adding handlers to exported SVG', () => {
	const series = [{ label: 'Current <voxel>', values: [100, 65, 60] }];
	const interactive = chartSvg(dataset, series, 2, true, undefined, false, true);
	expect(interactive.match(/data-chart-point/g)).toHaveLength(3);
	expect(interactive).toContain('data-volume="1"');
	expect(interactive).toContain('b 10 s/mm², signal 65 a.u.');
	expect(interactive).toContain('Current &lt;voxel&gt;');
	expect(interactive).not.toContain('Current <voxel>');
	expect(interactive).toContain('style="cursor:zoom-in"');
	expect(interactive).toContain('x="90" y="414" width="650"');
	expect(interactive).toContain('data-chart-range="move"');
	expect(interactive).toContain('data-chart-range="start"');
	expect(interactive).toContain('data-chart-range="end"');
	const exported = chartSvg(dataset, series, 2, true);
	expect(exported).not.toContain('data-chart-point');
	expect(exported).not.toContain('tabindex=');
	expect(exported).not.toContain('cursor:zoom-in');
	expect(exported).not.toContain('data-chart-range');
});

test('zoomed chart restricts the view without changing acquisition identities or the full export', () => {
	const series = [{ label: 'Current', values: [100, 65, 60] }];
	const zoomed = chartSvg(dataset, series, 2, true, undefined, false, true, [0, 5]);
	expect(zoomed.match(/data-chart-point/g)).toHaveLength(1);
	expect(zoomed).toContain('data-volume="0"');
	expect(zoomed).toContain('>5</text>');
	expect(zoomed).toContain('x="90" y="413" width="325"');
	expect(chartSvg(dataset, series, 2, true, undefined, false, true, [5, 10])).toContain(
		'>65</text>'
	);
	expect(chartSvg(dataset, series, 2, true).match(/<circle /g)).toHaveLength(3);
});

test('expanded legend lays comparisons in a row and wraps long labels without clipping', () => {
	const series = [
		{ label: 'Current (64, 45, 55)', values: [100, 65, 60] },
		{ label: 'Saved (43, 50, 6) · comment', values: [90, 50, 40] },
		{ label: 'Saved (66, 78, 6) · weeee', values: [80, 45, 30] }
	];
	const svg = chartSvg(dataset, series, 2, true);
	const positions = [
		...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" fill="[^"]+">[●■] (?:Current|Saved)/g)
	];
	expect(positions).toHaveLength(3);
	expect(positions.map((match) => Number(match[2]))).toEqual([454, 454, 454]);
	expect(Number(positions[0][1])).toBeLessThan(Number(positions[1][1]));
	expect(Number(positions[1][1])).toBeLessThan(Number(positions[2][1]));
	const wrapped = chartSvg(
		dataset,
		Array.from({ length: 4 }, (_, i) => ({
			label: `Saved ${i} · ${'long note '.repeat(3)}`,
			values: [100, 65, 60]
		})),
		2,
		true
	);
	expect(wrapped).toContain('y="477"');
});
