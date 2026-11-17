import { IVIM_METHODS, IVIM_MODELS, OSIPY_VERSION } from './browser-ivim';

/** Registry snapshot from the installed OSIPY 0.1.4 release, not general enums. */
export const capabilityVersion = '0.1.4';
export const capabilitySource =
	'https://github.com/OSIPI/osipy/tree/bcecaea4c79728cc67e8836183aa91b7bf9a224d/osipy';
export const capabilitySnapshotDate = '2026-11-16';

export const osipyCapabilities = [
	{
		modality: 'IVIM',
		label: 'Signal models',
		registry: 'ivim/models/registry.py',
		methods: ['biexponential', 'simplified']
	},
	{
		modality: 'IVIM',
		label: 'Fitting strategies',
		registry: 'ivim/fitting/registry.py',
		methods: ['bayesian', 'full', 'segmented']
	},
	{
		modality: 'DCE',
		label: 'Pharmacokinetic models',
		registry: 'dce/models/registry.py',
		methods: ['2cum', '2cxm', 'extended_tofts', 'patlak', 'tofts']
	},
	{
		modality: 'DCE',
		label: 'T1 mapping',
		registry: 'dce/t1_mapping/registry.py',
		methods: ['look_locker', 'vfa']
	},
	{
		modality: 'DCE',
		label: 'Signal to concentration',
		registry: 'dce/concentration/registry.py',
		methods: ['linear', 'spgr']
	},
	{
		modality: 'DSC',
		label: 'Deconvolution',
		registry: 'dsc/deconvolution/registry.py',
		methods: ['cSVD', 'oSVD', 'sSVD']
	},
	{
		modality: 'DSC',
		label: 'Arrival detection',
		registry: 'dsc/arrival/registry.py',
		methods: ['residue_peak']
	},
	{
		modality: 'DSC',
		label: 'Leakage correction',
		registry: 'dsc/leakage/registry.py',
		methods: ['bidirectional', 'bsw']
	},
	{
		modality: 'ASL',
		label: 'Quantification models',
		registry: 'asl/quantification/registry.py',
		methods: ['buxton_multi_pld', 'casl_single_pld', 'pasl_single_pld', 'pcasl_single_pld']
	},
	{
		modality: 'ASL',
		label: 'M0 calibration',
		registry: 'asl/calibration/registry.py',
		methods: ['reference_region', 'single', 'voxelwise']
	},
	{
		modality: 'ASL',
		label: 'Transit time models',
		registry: 'asl/quantification/att_registry.py',
		methods: ['buxton']
	},
	{
		modality: 'Common',
		label: 'Fitters',
		registry: 'common/fitting/registry.py',
		methods: ['bayesian', 'cSVD', 'lm', 'oSVD', 'sSVD', 'tikhonov']
	},
	{
		modality: 'Common',
		label: 'Population AIFs',
		registry: 'common/aif/population.py',
		methods: ['fritz-hansen', 'fritz_hansen', 'georgiou', 'mcgrath', 'parker', 'weinmann']
	},
	{
		modality: 'Common',
		label: 'AIF detection',
		registry: 'common/aif/detection_registry.py',
		methods: ['multi_criteria']
	}
] as const;

export function hasBrowserDemoEvidence(registry: string, method: string): boolean {
	if (capabilityVersion !== OSIPY_VERSION) return false;
	return registry === 'ivim/models/registry.py'
		? IVIM_MODELS.some((model) => model === method)
		: registry === 'ivim/fitting/registry.py' &&
				IVIM_METHODS.some((strategy) => strategy === method);
}
