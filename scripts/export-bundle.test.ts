import { expect, test } from 'bun:test';
import { unzipSync, strFromU8 } from 'fflate';
import { buildBundle } from '../src/lib/export-bundle';
import { decodeNifti, readImageFile } from '../src/lib/imports/nifti';
import { defaultDisplay, type Workspace } from '../src/lib/workspace';
import { niftiFixture } from './fixtures/local-scans';

test('handoff ZIP preserves source signals, overlapping ROI labels, affine and integrity metadata', async () => {
	const { dataset, volumes } = await decodeNifti(
		niftiFixture(),
		'0 10 10',
		undefined,
		'Bundle fixture'
	);
	const workspace: Workspace = {
		version: 1,
		datasetId: dataset.id,
		sha256: dataset.sha256,
		x: 1,
		y: 0,
		slice: 0,
		volume: 0,
		selected: [0],
		gridLayout: 'auto',
		linked: true,
		display: defaultDisplay(dataset),
		tiles: {},
		bookmarks: [],
		compared: [],
		seriesWidth: 260,
		inspectorWidth: 400,
		search: '',
		range: 'all',
		list: false,
		note: ''
	};
	const bytes = await buildBundle({
		dataset,
		volumes,
		workspace,
		bookmarks: [],
		point: [1, 0, 0],
		rois: [
			{ id: 'a', label: 1, name: 'Region A', color: '#ed746b', indices: [0, 1] },
			{ id: 'b', label: 2, name: 'Region B', color: '#b1c4df', indices: [1, 2] }
		]
	});
	const files = unzipSync(bytes);
	const manifest = JSON.parse(strFromU8(files['manifest.json']));
	expect(manifest.hasAnalysis).toBe(false);
	expect(manifest.rois).toHaveLength(2);
	for (const [name, hash] of Object.entries(manifest.checksums)) {
		const actual = Array.from(
			new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(files[name]))),
			(v) => v.toString(16).padStart(2, '0')
		).join('');
		expect(actual).toBe(hash);
	}
	const source = await decodeNifti(
		await readImageFile(new File([new Uint8Array(files['source.nii.gz'])], 'source.nii.gz')),
		strFromU8(files['source.bval'])
	);
	expect(source.dataset.affine).toEqual(dataset.affine);
	expect(source.volumes[2]).toEqual(volumes[2]);
	expect(source.dataset.slope).toBe(dataset.slope);
	for (const label of [1, 2]) {
		const mask = await decodeNifti(
			await readImageFile(
				new File([new Uint8Array(files[`rois/label-${label}.nii.gz`])], 'mask.nii.gz')
			),
			'0'
		);
		expect(mask.volumes[0][1]).toBe(label);
	}
	expect(strFromU8(files['load-in-slicer.py'])).toContain('ImportLabelmapToSegmentationNode');
	expect(strFromU8(files['README.md'])).toContain('itksnap -g source.nii.gz');
	expect(strFromU8(files['selected-voxel.csv']).split('\r\n')).toHaveLength(4);
});
