/** Registry snapshot from the installed OSIPY 0.1.4 release, not general enums. */
export const capabilityVersion = '0.1.4';
export const capabilitySource =
	'https://github.com/OSIPI/osipy/tree/bcecaea4c79728cc67e8836183aa91b7bf9a224d/osipy';
export const capabilitySnapshotDate = '2026-11-16';

export function countCatalogMethods(groups: readonly { methods: readonly string[] }[]): number {
	return new Set(
		groups.flatMap((group) =>
			group.methods.map((method) => (method === 'fritz-hansen' ? 'fritz_hansen' : method))
		)
	).size;
}

/** File and line locations inspected from the installed release implementations. */
const implementationSources: Record<string, Record<string, string>> = {
	'ivim/models/registry.py': {
		biexponential: 'ivim/models/biexponential.py#L193',
		simplified: 'ivim/models/biexponential.py#L311'
	},
	'ivim/fitting/registry.py': {
		segmented: 'ivim/fitting/estimators.py#L437',
		full: 'ivim/fitting/estimators.py#L447',
		bayesian: 'ivim/fitting/estimators.py#L461'
	},
	'dce/models/registry.py': {
		extended_tofts: 'dce/models/extended_tofts.py#L57',
		patlak: 'dce/models/patlak.py#L83',
		tofts: 'dce/models/tofts.py#L54',
		'2cxm': 'dce/models/two_compartment.py#L56',
		'2cum': 'dce/models/two_compartment_uptake.py#L51'
	},
	'dce/t1_mapping/registry.py': {
		vfa: 'dce/t1_mapping/vfa.py#L279',
		look_locker: 'dce/t1_mapping/look_locker.py#L72'
	},
	'dce/concentration/registry.py': {
		spgr: 'dce/concentration/signal_to_conc.py#L36',
		linear: 'dce/concentration/signal_to_conc.py#L87'
	},
	'dsc/deconvolution/registry.py': {
		sSVD: 'dsc/deconvolution/svd.py#L592',
		cSVD: 'dsc/deconvolution/svd.py#L616',
		oSVD: 'dsc/deconvolution/svd.py#L640'
	},
	'dsc/arrival/registry.py': { residue_peak: 'dsc/arrival/registry.py#L40' },
	'dsc/leakage/registry.py': {
		bsw: 'dsc/leakage/correction.py#L367',
		bidirectional: 'dsc/leakage/correction.py#L391'
	},
	'asl/quantification/registry.py': {
		pcasl_single_pld: 'asl/quantification/cbf.py#L281',
		pasl_single_pld: 'asl/quantification/cbf.py#L328',
		casl_single_pld: 'asl/quantification/cbf.py#L375',
		buxton_multi_pld: 'asl/quantification/multi_pld.py#L196'
	},
	'asl/calibration/registry.py': {
		voxelwise: 'asl/calibration/m0.py#L204',
		reference_region: 'asl/calibration/m0.py#L256',
		single: 'asl/calibration/m0.py#L307'
	},
	'asl/quantification/att_registry.py': { buxton: 'asl/quantification/multi_pld.py#L196' },
	'common/fitting/registry.py': {
		bayesian: 'common/fitting/bayesian.py#L29',
		lm: 'common/fitting/least_squares.py#L37',
		sSVD: 'dsc/deconvolution/svd_fitters.py#L87',
		cSVD: 'dsc/deconvolution/svd_fitters.py#L156',
		oSVD: 'dsc/deconvolution/svd_fitters.py#L217',
		tikhonov: 'dsc/deconvolution/svd_fitters.py#L336'
	},
	'common/aif/population.py': {
		parker: 'common/aif/population.py#L88',
		georgiou: 'common/aif/population.py#L248',
		fritz_hansen: 'common/aif/population.py#L382',
		'fritz-hansen': 'common/aif/population.py#L382',
		weinmann: 'common/aif/population.py#L503',
		mcgrath: 'common/aif/population.py#L625'
	},
	'common/aif/detection_registry.py': { multi_criteria: 'common/aif/detection.py#L549' }
};

export function methodImplementationUrl(registry: string, method: string): string {
	return `${capabilitySource.replace('/tree/', '/blob/')}/${implementationSources[registry]?.[method] ?? registry}`;
}

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

type Method = (typeof osipyCapabilities)[number]['methods'][number];

export const methodDescriptions: Record<Method, { label: string; description: string }> = {
	biexponential: {
		label: 'Biexponential IVIM',
		description:
			'Separates diffusion and microvascular signal components to estimate D, D*, perfusion fraction and baseline signal.'
	},
	simplified: {
		label: 'Simplified IVIM',
		description:
			'Estimates diffusion, perfusion fraction and baseline signal using a model that neglects the fast component above a b-value threshold.'
	},
	bayesian: {
		label: 'Bayesian estimation',
		description: 'Combines measured signals with prior information to estimate model parameters.'
	},
	full: {
		label: 'Full signal fitting',
		description: 'Fits the IVIM signal model to all acquired b-values together.'
	},
	segmented: {
		label: 'Segmented fitting',
		description:
			'Estimates diffusion from higher b-values before estimating the remaining IVIM parameters.'
	},
	'2cum': {
		label: 'Two-compartment uptake model',
		description:
			'Models plasma flow and one-way tracer uptake into tissue, without return flow to plasma.'
	},
	'2cxm': {
		label: 'Two-compartment exchange model',
		description:
			'Models plasma flow and tracer exchange in both directions between plasma and the extravascular space.'
	},
	extended_tofts: {
		label: 'Extended Tofts model',
		description:
			'Estimates tracer transfer and tissue space volumes while including the vascular plasma contribution.'
	},
	patlak: {
		label: 'Patlak model',
		description:
			'Estimates tracer uptake assuming transfer from blood into tissue with negligible return during the modeled interval.'
	},
	tofts: {
		label: 'Tofts model',
		description:
			'Describes tracer exchange between plasma and tissue to estimate transfer and extravascular volume parameters.'
	},
	look_locker: {
		label: 'Look-Locker T1 mapping',
		description:
			'Estimates longitudinal relaxation time from measurements of magnetization recovery.'
	},
	vfa: {
		label: 'Variable flip angle T1 mapping',
		description:
			'Estimates longitudinal relaxation time from images acquired at different flip angles.'
	},
	linear: {
		label: 'Linear concentration conversion',
		description:
			'Converts signal changes to contrast-agent concentration using a linear approximation.'
	},
	spgr: {
		label: 'Spoiled gradient echo conversion',
		description:
			'Uses the spoiled gradient echo signal equation and relaxation information to estimate contrast-agent concentration.'
	},
	cSVD: {
		label: 'Circular SVD deconvolution',
		description:
			'Uses a block-circulant convolution matrix to estimate the tissue residue function with reduced sensitivity to bolus arrival delay.'
	},
	oSVD: {
		label: 'Oscillation-controlled SVD',
		description:
			'Chooses a truncation threshold for each voxel to limit oscillations in the estimated tissue residue function.'
	},
	sSVD: {
		label: 'Standard SVD deconvolution',
		description:
			'Uses truncated singular value decomposition to recover the tissue residue function from tissue and arterial concentration curves.'
	},
	residue_peak: {
		label: 'Residue peak arrival detection',
		description: 'Estimates arrival time from the peak of the tissue residue function.'
	},
	bidirectional: {
		label: 'Bidirectional leakage correction',
		description:
			'Corrects DSC measurements for contrast leakage using a bidirectional leakage strategy.'
	},
	bsw: {
		label: 'Boxerman–Schmainda–Weisskoff correction',
		description:
			'Estimates leakage coefficients by regression to correct contrast leakage effects in DSC signals.'
	},
	buxton_multi_pld: {
		label: 'Buxton model at multiple delays',
		description:
			'Estimates cerebral blood flow and arterial transit time from ASL measurements at multiple post-labeling delays.'
	},
	casl_single_pld: {
		label: 'Continuous ASL at one delay',
		description:
			'Calculates cerebral blood flow from continuous-labeling ASL measurements at a single post-labeling delay.'
	},
	pasl_single_pld: {
		label: 'Pulsed ASL at one delay',
		description:
			'Calculates cerebral blood flow from pulsed ASL measurements using the QUIPSS II equation.'
	},
	pcasl_single_pld: {
		label: 'Pseudo-continuous ASL at one delay',
		description:
			'Calculates cerebral blood flow from pseudo-continuous ASL measurements using the consensus quantification equation.'
	},
	reference_region: {
		label: 'Reference-region M0 calibration',
		description:
			'Calibrates ASL measurements using a reference region to estimate the equilibrium magnetization scale.'
	},
	single: {
		label: 'Mean M0 calibration',
		description:
			'Applies a single mean equilibrium magnetization value to calibrate ASL measurements.'
	},
	voxelwise: {
		label: 'Voxelwise M0 calibration',
		description: 'Calibrates each voxel using its own equilibrium magnetization measurement.'
	},
	buxton: {
		label: 'Buxton transit time model',
		description:
			'Describes the ASL signal over time to support estimation of arterial transit time.'
	},
	lm: {
		label: 'Levenberg–Marquardt fitting',
		description:
			'Estimates nonlinear model parameters by minimizing the squared differences between predicted and measured signals.'
	},
	tikhonov: {
		label: 'Tikhonov regularization',
		description:
			'Stabilizes DSC deconvolution with a regularization penalty to reduce amplification of noise.'
	},
	'fritz-hansen': {
		label: 'Fritz-Hansen population AIF',
		description:
			'Provides a published population arterial input curve when an individual arterial measurement is not used. Alias of fritz_hansen.'
	},
	fritz_hansen: {
		label: 'Fritz-Hansen population AIF',
		description:
			'Provides a published population arterial input curve when an individual arterial measurement is not used.'
	},
	georgiou: {
		label: 'Georgiou population AIF',
		description: 'Generates an arterial input curve using the published Georgiou population model.'
	},
	mcgrath: {
		label: 'McGrath population AIF',
		description: 'Generates an arterial input curve using the published McGrath population model.'
	},
	parker: {
		label: 'Parker population AIF',
		description: 'Generates an arterial input curve using the published Parker population model.'
	},
	weinmann: {
		label: 'Weinmann population AIF',
		description: 'Generates an arterial input curve using the published Weinmann population model.'
	},
	multi_criteria: {
		label: 'Multi-criteria AIF selection',
		description:
			'Selects candidate arterial voxels using multiple signal characteristics to estimate an arterial input function.'
	}
};
