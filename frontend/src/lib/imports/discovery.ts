import { parseDicom } from 'dicom-parser';
import { readSidecar } from './nifti';
import { validDate, type ScanMetadata, type ValidationIssue } from './scan';

export type Candidate = {
	id: string;
	kind: 'nifti' | 'dicom';
	name: string;
	path: string;
	metadata: ScanMetadata;
	issues: ValidationIssue[];
	image?: File;
	bval?: File;
	bvec?: File;
	fileCount: number;
	details: Record<string, string>;
};
export const filePath = (file: File) => file.webkitRelativePath || file.name;
const stem = (path: string) => path.replace(/\.nii(?:\.gz)?$/i, '');
const field = (v: unknown) => (typeof v === 'string' ? v.slice(0, 256) : '');

export function bidsIdentity(path: string, json: Record<string, unknown> = {}): ScanMetadata {
	const subject = path.match(/(?:^|[/_])sub-([^/_]+)/)?.[1];
	const session = path.match(/(?:^|[/_])ses-([^/_]+)/)?.[1];
	const date = field(json.AcquisitionDateTime || json.AcquisitionDate);
	return {
		subject: subject ? `sub-${subject}` : field(json.SubjectID) || 'Unassigned',
		study: field(json.StudyDescription) || 'Local study',
		session: session ? `ses-${session}` : stem(path.split('/').at(-1)!),
		date: validDate(date) ? date : '',
		technique: /(?:_|\/)asl(?:\.|_)/i.test(path)
			? 'ASL'
			: /(?:_|\/)dwi(?:\.|_)/i.test(path)
				? 'IVIM'
				: 'Unassigned',
		coordinateFrame: ''
	};
}

export async function discoverFiles(
	files: File[],
	signal?: AbortSignal
): Promise<{ candidates: Candidate[]; issues: ValidationIssue[] }> {
	if (files.length > 5000) throw new Error('Select at most 5,000 files per discovery batch.');
	const paths = new Map<string, File>();
	for (const file of files) {
		const path = filePath(file);
		if (paths.has(path))
			throw new Error(
				`Duplicate file path: ${path}. Choose a directory to preserve distinct paths.`
			);
		paths.set(path, file);
	}
	const images = files.filter((f) => /\.nii(?:\.gz)?$/i.test(f.name));
	const bvals = files.filter((f) => /\.bval$/i.test(f.name)),
		bvecs = files.filter((f) => /\.bvec$/i.test(f.name));
	const candidates: Candidate[] = [],
		issues: ValidationIssue[] = [];
	const dates = new Map<string, string>();
	const studies = new Map<string, string>();
	for (const file of files.filter((f) =>
		/(?:dataset_description\.json|_scans\.tsv)$/i.test(f.name)
	)) {
		if (signal?.aborted) throw new DOMException('Discovery cancelled', 'AbortError');
		try {
			const text = await readSidecar(file);
			if (file.name === 'dataset_description.json')
				studies.set(
					filePath(file).slice(0, filePath(file).lastIndexOf('/') + 1),
					field(JSON.parse(text).Name)
				);
			else {
				const lines = text
					.trim()
					.split(/\r?\n/)
					.map((l) => l.split('\t'));
				const filename = lines[0].indexOf('filename'),
					time = lines[0].indexOf('acq_time');
				if (filename < 0 || time < 0) continue;
				const parent = filePath(file).slice(0, filePath(file).lastIndexOf('/') + 1);
				for (const row of lines.slice(1))
					if (row[filename] && row[time] && row[time] !== 'n/a' && validDate(row[time]))
						dates.set(parent + row[filename].replace(/^\.\//, ''), row[time]);
			}
		} catch {
			issues.push({
				severity: 'warning',
				message: `Could not read dataset metadata in ${filePath(file)}.`
			});
		}
	}
	for (const image of images) {
		if (signal?.aborted) throw new DOMException('Discovery cancelled', 'AbortError');
		const path = filePath(image),
			base = stem(path);
		const candidateIssues: ValidationIssue[] = [];
		let json: Record<string, unknown> = {};
		const sidecar = paths.get(base + '.json');
		if (sidecar) {
			try {
				const value = JSON.parse(await readSidecar(sidecar));
				if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
				json = value;
			} catch {
				candidateIssues.push({
					severity: 'error',
					message: 'The matching JSON sidecar is not a valid metadata object.'
				});
			}
		}
		const metadata = bidsIdentity(path, json);
		const study = [...studies.entries()]
			.filter(([root]) => path.startsWith(root))
			.sort((a, b) => b[0].length - a[0].length)[0]?.[1];
		if (study) metadata.study = study;
		if (dates.has(path)) metadata.date = dates.get(path)!;
		if (json.AcquisitionDateTime && !validDate(field(json.AcquisitionDateTime)))
			candidateIssues.push({
				severity: 'warning',
				message: 'Invalid supplied acquisition date was left unset.'
			});
		if (images.length === 1 && metadata.technique === 'Unassigned') metadata.technique = 'IVIM';
		candidates.push({
			id: crypto.randomUUID(),
			kind: 'nifti',
			name: image.name,
			path,
			image,
			bval:
				paths.get(base + '.bval') ??
				(images.length === 1 && bvals.length === 1 ? bvals[0] : undefined),
			bvec:
				paths.get(base + '.bvec') ??
				(images.length === 1 && bvecs.length === 1 ? bvecs[0] : undefined),
			metadata,
			issues: candidateIssues,
			fileCount: 1,
			details: {
				Format: 'NIfTI',
				Protocol: field(json.ProtocolName),
				'Image bytes': String(image.size),
				'Sidecar matching':
					'Exact image basename; dataset name and scans.tsv dates are read. Inherited BIDS sidecars are not merged.'
			}
		});
	}
	const dicomGroups = new Map<string, Candidate>();
	for (const file of files) {
		if (signal?.aborted) throw new DOMException('Discovery cancelled', 'AbortError');
		if (/\.(nii(?:\.gz)?|bval|bvec|json|tsv)$/i.test(file.name)) continue;
		const prefix = new Uint8Array(await file.slice(0, 132).arrayBuffer());
		const magic = String.fromCharCode(...prefix.slice(128, 132)) === 'DICM';
		if (!magic && !/\.(dcm|ima)$/i.test(file.name)) continue;
		try {
			const ds = parseDicom(new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer()), {
				untilTag: 'x7fe00010'
			});
			const studyId = ds.string('x0020000d'),
				seriesId = ds.string('x0020000e');
			if (!studyId || !seriesId) throw new Error('Missing study or series UID');
			const subject = ds.string('x00100020') || 'Unassigned';
			const key = `${subject}|${studyId}|${seriesId}`;
			const existing = dicomGroups.get(key);
			if (existing) {
				existing.fileCount++;
				continue;
			}
			const rawDate = ds.string('x00080022') || ds.string('x00080020') || '';
			const date = /^\d{8}$/.test(rawDate)
				? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
				: '';
			const name = ds.string('x0008103e') || `Series ${ds.string('x00200011') || seriesId}`;
			const candidate: Candidate = {
				id: crypto.randomUUID(),
				kind: 'dicom',
				name,
				path: filePath(file),
				fileCount: 1,
				metadata: {
					subject,
					study: studyId,
					session: ds.string('x00080050') || 'Study acquisition',
					date: validDate(date) ? date : '',
					technique: 'Unassigned',
					coordinateFrame: ds.string('x00200052') || ''
				},
				issues: [
					{
						severity: 'info',
						message:
							'DICOM series discovered from headers. Convert to NIfTI + b-values with a validated converter to open the diffusion data; DICOM pixels are not decoded here.'
					}
				],
				details: {
					'Study UID': studyId,
					'Series UID': seriesId,
					'Study description': ds.string('x00081030') || '',
					Modality: ds.string('x00080060') || '',
					Rows: String(ds.uint16('x00280010') ?? ''),
					Columns: String(ds.uint16('x00280011') ?? ''),
					'Transfer syntax': ds.string('x00020010') || ''
				}
			};
			dicomGroups.set(key, candidate);
		} catch {
			issues.push({
				severity: 'warning',
				message: `DICOM header could not be indexed: ${filePath(file)}. Headers must be readable within 4 MiB.`
			});
		}
	}
	candidates.push(...dicomGroups.values());
	if (!candidates.length)
		issues.push({
			severity: 'warning',
			message: 'No NIfTI images or readable DICOM series were found.'
		});
	return { candidates, issues };
}
