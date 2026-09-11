import { expect, test } from 'bun:test';
import { decodeNifti, parseBValues, parseBVectors, readImageFile } from '../src/lib/imports/nifti';
import { bidsIdentity, discoverFiles } from '../src/lib/imports/discovery';
import { compareScans, mapPoint, validDate, type Scan } from '../src/lib/imports/scan';
import { autoWindow } from '../src/lib/workspace';
import { niftiFixture, dicomFixture } from './fixtures/local-scans';

test('NIfTI imports preserve float/int samples, signed scaling, endian order and millimetre geometry', async () => {
	for (const littleEndian of [true, false])
		for (const float of [true, false]) {
			const { dataset, volumes, issues } = await decodeNifti(
				niftiFixture({ littleEndian, float, slope: -2 }),
				'0 10 10'
			);
			expect(dataset.dimensions).toEqual([3, 2, 2, 3]);
			expect(dataset.spacing).toEqual([2, 3, 4]);
			expect(dataset.axisCodes).toEqual(['R', 'A', 'S']);
			expect(dataset.slope).toBe(-2);
			expect(dataset.intercept).toBe(-3);
			expect(dataset.bVectors).toEqual([]);
			expect(volumes[2][0]).toBeCloseTo(float ? 2.525 : 14);
			expect(issues.some((i) => i.message.includes('b-vectors'))).toBe(true);
			const window = autoWindow(volumes[0], dataset, 0, false);
			expect(window.width).toBeGreaterThan(0);
		}
	const decoded = await decodeNifti(niftiFixture(), '0 10 10', '0 1 0\n0 0 1\n0 0 0');
	expect(decoded.dataset.bValues).toEqual([0, 10, 10]);
	expect(decoded.dataset.bVectors[2]).toEqual([0, 1, 0]);
	const gzip = new File([Bun.gzipSync(new Uint8Array(niftiFixture()))], 'data.nii.gz');
	expect(new Uint8Array(await readImageFile(gzip))).toEqual(new Uint8Array(niftiFixture()));
});

test('invalid dimensions, geometry, samples and diffusion metadata block import', async () => {
	for (const corrupt of [
		(v: DataView) => v.setInt16(42, 0, true),
		(v: DataView) => v.setInt16(254, 0, true),
		(v: DataView) => v.setFloat32(280, 0, true),
		(v: DataView) => v.setUint8(123, 0),
		(v: DataView) => v.setFloat32(352, NaN, true),
		(v: DataView) => v.setFloat32(108, 99999, true),
		(v: DataView) => v.setFloat32(112, Infinity, true)
	]) {
		const buffer = niftiFixture();
		corrupt(new DataView(buffer));
		await expect(decodeNifti(buffer, '0 10 10')).rejects.toThrow();
	}
	await expect(decodeNifti(niftiFixture().slice(0, 360), '0 10 10')).rejects.toThrow('truncated');
	await expect(decodeNifti(niftiFixture(), '0 10 10', undefined, 'fixture', 4)).rejects.toThrow(
		'memory limit'
	);
	expect(() => parseBValues('0 10', 3)).toThrow('mismatch');
	expect(() => parseBValues('0 -1 10', 3)).toThrow('non-negative');
	expect(() => parseBVectors('0 1\n0 0\n0 0', 3)).toThrow('3-row');
	const missingBaseline = await decodeNifti(niftiFixture(), '10 10 20');
	expect(missingBaseline.issues.some((i) => i.message.includes('No b=0'))).toBe(true);
});

test('sform precedence, qform-only images, units and float64 precision are preserved', async () => {
	const both = niftiFixture({ translation: 6 });
	new DataView(both).setInt16(252, 4, true);
	const selected = await decodeNifti(both, '0 10 10');
	expect(selected.dataset.affine[0][3]).toBe(6);
	expect(selected.issues.some((i) => i.message.includes('sform and qform differ'))).toBe(true);
	const qform = niftiFixture();
	const q = new DataView(qform);
	q.setInt16(254, 0, true);
	q.setInt16(252, 1, true);
	q.setFloat32(268, 9, true);
	const qOnly = await decodeNifti(qform, '0 10 10');
	expect(qOnly.dataset.affine[0][3]).toBe(9);
	const metres = niftiFixture();
	new DataView(metres).setUint8(123, 1);
	expect((await decodeNifti(metres, '0 10 10')).dataset.spacing).toEqual([2000, 3000, 4000]);
	const precise = new ArrayBuffer(352 + 36 * 8);
	new Uint8Array(precise).set(new Uint8Array(niftiFixture()).subarray(0, 352));
	const p = new DataView(precise);
	p.setInt16(70, 64, true);
	p.setInt16(72, 64, true);
	p.setFloat32(112, 1, true);
	p.setFloat32(116, 0, true);
	for (let i = 0; i < 36; i++) p.setFloat64(352 + i * 8, 1 + Number.EPSILON * (i + 1), true);
	const decoded = await decodeNifti(precise, '0 10 10');
	expect(decoded.volumes[0][0]).toBe(1 + Number.EPSILON);
	expect(decoded.volumes[2][11]).toBe(1 + 36 * Number.EPSILON);
});

const fileAt = (data: BlobPart, path: string) => {
	const file = new File([data], path.split('/').at(-1)!);
	Object.defineProperty(file, 'webkitRelativePath', { value: path });
	return file;
};
test('BIDS discovery matches sidecars and supplied scan dates, and DICOM discovery groups series', async () => {
	const root = 'study/sub-01/ses-02/';
	const result = await discoverFiles([
		fileAt(niftiFixture(), root + 'dwi/sub-01_ses-02_dwi.nii'),
		fileAt('0 10 10', root + 'dwi/sub-01_ses-02_dwi.bval'),
		fileAt('{"Name":"Fixture study"}', 'study/dataset_description.json'),
		fileAt(
			'filename\tacq_time\ndwi/sub-01_ses-02_dwi.nii\t2026-01-02T10:30:00Z',
			root + 'sub-01_ses-02_scans.tsv'
		),
		fileAt(dicomFixture(), 'dicom/one.dcm'),
		fileAt(dicomFixture(), 'dicom/two.dcm'),
		fileAt(dicomFixture('1.2.3.5'), 'dicom/three.dcm')
	]);
	expect(result.candidates).toHaveLength(3);
	const nifti = result.candidates.find((c) => c.kind === 'nifti')!;
	expect(nifti.bval?.name).toBe('sub-01_ses-02_dwi.bval');
	expect(nifti.metadata).toMatchObject({
		subject: 'sub-01',
		session: 'ses-02',
		date: '2026-01-02T10:30:00Z',
		study: 'Fixture study',
		technique: 'IVIM'
	});
	const dicom = result.candidates.filter((c) => c.kind === 'dicom');
	expect(dicom.map((c) => c.fileCount)).toEqual([2, 1]);
	expect(dicom[0].metadata.date).toBe('2026-01-02');
	expect(dicom[0].metadata.coordinateFrame).toBe('1.2.3.99');
	expect(bidsIdentity('unknown.nii').date).toBe('');
	expect(validDate('2026-02-31')).toBe(false);
});

test('comparison requires a declared shared subject/study/frame, and maps physical coordinates without clamping', async () => {
	const a = await decodeNifti(niftiFixture(), '0 10 10'),
		b = await decodeNifti(niftiFixture({ translation: 2 }), '0 10 10');
	expect(mapPoint(a.dataset, b.dataset, [1, 1, 1])).toEqual([0, 1, 1]);
	expect(mapPoint(a.dataset, b.dataset, [0, 0, 0])).toBeNull();
	const metadata = {
		subject: 'sub-01',
		study: 'study',
		session: 'session',
		date: '',
		technique: 'IVIM' as const,
		coordinateFrame: ''
	};
	const left: Scan = { ...a, id: 'one', metadata };
	const right: Scan = { ...b, id: 'two', metadata: { ...metadata } };
	expect(compareScans(left, right)).toBe(false);
	left.metadata.coordinateFrame = 'registered';
	right.metadata.coordinateFrame = 'registered';
	expect(compareScans(left, right)).toBe(true);
	right.metadata.subject = 'sub-02';
	expect(compareScans(left, right)).toBe(false);
});
