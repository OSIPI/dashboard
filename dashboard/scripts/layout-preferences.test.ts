import { expect, test } from 'bun:test';
import { DEFAULT_LAYOUT, parseLayout, parsePanes } from '../src/lib/layout-preferences';

test('layout preferences restore every layout choice and normalize invalid browser storage', () => {
	const layout = {
		...DEFAULT_LAYOUT,
		gridLayout: 'eight',
		seriesLayout: 'list',
		seriesWidth: 310,
		inspectorWidth: 450,
		panel: 'Inspector',
		linked: false,
		navigationOpen: true,
		metadataOpen: true,
		signalValuesOpen: true,
		signalOpen: false,
		savedVoxelsOpen: false,
		workspaceOpen: false,
		analysisOpen: false,
		roiOpen: false,
		exportOpen: false,
		validationOpen: false
	};
	expect(parseLayout(JSON.stringify(layout))).toEqual(layout);
	for (const raw of ['invalid json', 'null', '[]', '2'])
		expect(parseLayout(raw)).toEqual(DEFAULT_LAYOUT);
	expect(
		parseLayout(
			JSON.stringify({
				panel: 'unknown',
				gridLayout: 'three',
				linked: 'false',
				seriesLayout: 'bad',
				seriesWidth: -100,
				inspectorWidth: 100000
			})
		)
	).toEqual({ ...DEFAULT_LAYOUT, seriesWidth: 180, inspectorWidth: 600 });
	expect(parseLayout('{}')).not.toBe(DEFAULT_LAYOUT);
});

test('pane restoration preserves active acquisition and repeated acquisitions without invalid indices', () => {
	const dataset = { dimensions: [2, 2, 2, 6] as [number, number, number, number] };
	expect(parsePanes('{"active":4,"selected":[2,4,1]}', dataset)).toEqual({
		active: 4,
		selected: [2, 4, 1]
	});
	expect(parsePanes('{"active":3,"selected":[]}', dataset)).toEqual({ active: 3, selected: [] });
	for (const value of [
		null,
		{},
		{ active: 6, selected: [] },
		{ active: 1, selected: [0, 0, 1] },
		{ active: 0, selected: [1] },
		{ active: 0, selected: [0, -1] },
		{ active: 0, selected: [0, 6] }
	])
		expect(parsePanes(JSON.stringify(value), dataset)).toEqual({ active: 0, selected: [0] });
});
