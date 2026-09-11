import { gzipSync, strToU8, zipSync } from 'fflate';
import type { Dataset, VoxelVolume, Bookmark } from './ivim';
import type { Roi } from './roi';
import type { FitResult } from './analysis';
import { predictIvim } from './analysis';
import type { Workspace } from './workspace';
import { voxelCsv } from './workspace';
import { voxelIndex } from './ivim';
import { toWorld, createGeometry, type Point } from './spatial';
import { niftiBytes } from './nifti-export';
import type { ScanMetadata } from './imports/scan';

export type BundleInput = {
	dataset: Dataset;
	volumes: VoxelVolume[];
	rois: Roi[];
	bookmarks: Bookmark[];
	point: Point;
	workspace: Workspace;
	metadata?: ScanMetadata;
	fit?: FitResult;
};

export const SLICER_SCRIPT = `"""Run from 3D Slicer's Python console: exec(open('/path/to/load-in-slicer.py').read())
Set bundle_dir below when __file__ is not defined by your launch method.
"""
from pathlib import Path
import json
import slicer
import vtk
import qt

bundle_dir = Path(__file__).resolve().parent if '__file__' in globals() else Path(qt.QFileDialog.getExistingDirectory(slicer.util.mainWindow(), 'Choose extracted OSIPY bundle'))
manifest = json.loads((bundle_dir / 'manifest.json').read_text())
source = slicer.util.loadVolume(str(bundle_dir / manifest['source']))
if source is None:
    raise RuntimeError('Could not load the source NIfTI')
maps = {}
for info in manifest['maps']:
    node = slicer.util.loadVolume(str(bundle_dir / info['file']))
    node.SetName(info['name'] + ' (' + info['unit'] + ')')
    node.SetAttribute('OSIPY.SourceHash', manifest['sourceHash'])
    maps[info['name']] = node
if manifest['rois']:
    segmentation = slicer.mrmlScene.AddNewNodeByClass('vtkMRMLSegmentationNode', 'OSIPY ROIs')
    segmentation.CreateDefaultDisplayNodes()
    segmentation.SetReferenceImageGeometryParameterFromVolumeNode(source)
    for info in manifest['rois']:
        labelmap = slicer.util.loadLabelVolume(str(bundle_dir / info['file']))
        before = segmentation.GetSegmentation().GetNumberOfSegments()
        slicer.modules.segmentations.logic().ImportLabelmapToSegmentationNode(labelmap, segmentation)
        for i in range(before, segmentation.GetSegmentation().GetNumberOfSegments()):
            segment = segmentation.GetSegmentation().GetSegment(segmentation.GetSegmentation().GetNthSegmentID(i))
            segment.SetName(info['name'])
            segment.SetColor(*[int(info['color'][j:j+2], 16) / 255.0 for j in (1, 3, 5)])
        slicer.mrmlScene.RemoveNode(labelmap)
marks = json.loads((bundle_dir / 'bookmarks.json').read_text())
if marks:
    points = slicer.mrmlScene.AddNewNodeByClass('vtkMRMLMarkupsFiducialNode', 'OSIPY saved voxels')
    for mark in marks:
        i = points.AddControlPoint(vtk.vtkVector3d(*mark['worldRAS']))
        points.SetNthControlPointLabel(i, mark['note'] or 'Saved voxel')
slicer.util.setSliceViewerLayers(background=source, foreground=maps.get('D'), foregroundOpacity=0.5)
slicer.util.resetSliceViews()
`;

export async function buildBundle(
	input: BundleInput,
	progress: (message: string) => void = () => {}
): Promise<Uint8Array<ArrayBuffer>> {
	const { dataset, volumes, rois, bookmarks, fit, point } = input;
	if (fit && fit.report.dataset.sha256 !== dataset.sha256)
		throw new Error('Analysis belongs to a different dataset.');
	const count = dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1);
	const estimated =
		dataset.byteLength +
		rois.length * count * 2 +
		(fit ? Object.values(fit.maps).reduce((n, v) => n + v.byteLength, 0) : 0);
	if (estimated > 512 * 1024 * 1024)
		throw new Error(
			'Bundle exceeds 512 MiB before compression. Export individual maps/ROIs instead.'
		);
	const files: Record<string, Uint8Array> = {};
	const json = (name: string, value: unknown) =>
		(files[name] = strToU8(JSON.stringify(value, null, 2)));
	const image = (name: string, values: VoxelVolume[], scaled: boolean) => {
		files[name] = gzipSync(niftiBytes(dataset, values, scaled), { level: 1, mtime: 0 });
	};
	progress('Preparing source image…');
	image('source.nii.gz', volumes, false);
	files['source.bval'] = strToU8(dataset.bValues.join(' ') + '\n');
	if (dataset.bVectors.length === dataset.bValues.length)
		files['source.bvec'] = strToU8(
			[0, 1, 2].map((axis) => dataset.bVectors.map((v) => v[axis]).join(' ')).join('\n') + '\n'
		);
	const maps: { name: string; unit: string; file: string }[] = [];
	if (fit) {
		progress('Preparing parameter maps and quality masks…');
		for (const map of fit.report.maps) {
			const filename = `maps/${map.name === 'D*' ? 'Dstar' : map.name}.nii.gz`;
			image(filename, [fit.maps[map.name]], true);
			maps.push({ name: map.name, unit: map.unit, file: filename });
		}
		image('masks/valid.nii.gz', [Uint8Array.from(fit.maps.Valid, (v) => (v === 1 ? 1 : 0))], true);
		image(
			'masks/run-selection.nii.gz',
			[Uint8Array.from(fit.maps.Status, (v) => (v !== 0 ? 1 : 0))],
			true
		);
		json('analysis-report.json', fit.report);
	}
	progress('Preparing ROI masks and annotations…');
	const roiFiles = rois.map((roi) => {
		const mask = new Uint16Array(count);
		for (const i of roi.indices) mask[i] = roi.label;
		const file = `rois/label-${roi.label}.nii.gz`;
		image(file, [mask], true);
		return {
			id: roi.id,
			label: roi.label,
			name: roi.name,
			color: roi.color,
			voxelCount: roi.indices.length,
			file
		};
	});
	json('rois/labels.json', roiFiles);
	const geometry = createGeometry(dataset);
	json(
		'bookmarks.json',
		bookmarks.map((b) => ({ ...b, worldRAS: toWorld(geometry, [b.x, b.y, b.z]) }))
	);
	json('workspace.json', input.workspace);
	json('source-metadata.json', { ...dataset, scan: input.metadata ?? null });
	const index = voxelIndex(...point, dataset.dimensions);
	const values = volumes.map((v) => v[index] * dataset.slope + dataset.intercept);
	let csv = voxelCsv(dataset, values, ...point);
	if (fit) {
		const p = Object.fromEntries(
			['S0', 'D', 'D*', 'f'].map((name) => [name, fit.maps[name][index]])
		);
		const finite = Object.values(p).every(Number.isFinite);
		csv = csv
			.split('\r\n')
			.map((row, i) =>
				i === 0
					? row + ',fitted_signal_au,residual_au,status'
					: row +
						',' +
						(finite ? predictIvim(dataset.bValues[i - 1], p) : '') +
						',' +
						(finite ? values[i - 1] - predictIvim(dataset.bValues[i - 1], p) : '') +
						',' +
						fit.maps.Status[index]
			)
			.join('\r\n');
	}
	files['selected-voxel.csv'] = strToU8(csv);
	files['load-in-slicer.py'] = strToU8(SLICER_SCRIPT);
	files['README.md'] = strToU8(
		`# OSIPY research viewer bundle\n\n${fit ? 'Contains an actual OSIPY fitting result.' : 'No fitting result is included.'} Research use only; not a diagnostic device.\n\n## Contents\n- source.nii.gz, source.bval and optional source.bvec: original scalar samples/scaling on the native grid, written as NIfTI-1.\n- maps/: parameter/quality maps with units in manifest.json (when fitted). NaN marks unavailable estimates.\n- masks/valid.nii.gz: quality-valid voxels. masks/run-selection.nii.gz: the immutable requested fitting region.\n- rois/: one mask per current ROI; separate masks preserve overlapping regions. labels.json retains names/colors. These are current annotations, not necessarily the region used for an earlier run.\n- analysis-report.json: model, OSIPY version, settings, identity, quality policy and run details (when fitted).\n- selected-voxel.csv: acquisition order, b-values and signal; fitted values/residuals/status when available.\n- bookmarks.json: native coordinates and physical RAS-mm points.\n\n## 3D Slicer\nExtract the ZIP. Open Slicer's Python console and run:\n\n\`\`\`python\nscript = '/absolute/path/to/load-in-slicer.py'\nexec(compile(open(script).read(), script, 'exec'), {'__file__': script})\n\`\`\`\n\nThe helper loads source/maps/ROIs and saved voxel markers. It does not run fitting or modify the source image. Alternatively load the NIfTI files through Add Data.\n\n## ITK-SNAP\nOpen source.nii.gz as the main image. Open a rois/label-*.nii.gz file as a segmentation, or a parameter map as an additional image. Only one overlapping ROI mask is loaded at a time; the separate files preserve overlaps. Example:\n\n\`\`\`sh\nitksnap -g source.nii.gz -s rois/label-1.nii.gz\n\`\`\`\n\nUse the actual label file listed in manifest.json. Save an edited segmentation as NIfTI, then import it through the dashboard's Mask import/export. Geometry must match; no automatic resampling is performed.\n\n## Integrity and provenance\nmanifest.json lists SHA-256 hashes of the packaged files. NIfTI headers retain spatial geometry, and source-metadata.json retains the full original affine/scaling metadata. ${dataset.source === 'local' ? 'Source was locally imported; consult its original usage terms.' : 'Public source: OSIPI TF2.4, https://doi.org/10.5281/zenodo.14605039 (CC BY 4.0).'}\n`
	);
	progress('Computing file checksums…');
	const checksums: Record<string, string> = {};
	for (const [name, data] of Object.entries(files)) {
		checksums[name] = Array.from(
			new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)),
			(v) => v.toString(16).padStart(2, '0')
		).join('');
	}
	json('manifest.json', {
		schema: 1,
		createdAt: new Date().toISOString(),
		source: 'source.nii.gz',
		sourceHash: dataset.sha256,
		sourceName: dataset.name,
		maps,
		rois: roiFiles,
		hasAnalysis: !!fit,
		checksums
	});
	progress('Packaging ZIP…');
	return zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>;
}
