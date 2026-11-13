/** Static source assessment, not an executable package registry. */
export const assessedOn = '2026-11-10';
export const runtime = 'Pyodide 0.27.7 / Python 3.12.7';

export const collections = {
	'DCE/DSC': {
		repo: 'OSIPI/DCE-DSC-MRI_CodeCollection',
		sha: '78cc4c7b8ec09d01ff209724ce0a49fcde6c175f',
		prefix: 'src/original/'
	},
	ASL: {
		repo: 'OSIPI/TF2.2_OSIPI-ASL-toolbox',
		sha: '86e723639eae4bf507ae6ee9dc7932d2a9077a97',
		prefix: ''
	},
	IVIM: {
		repo: 'OSIPI/TF2.4_IVIM-MRI_CodeCollection',
		sha: '3058d5deed347125be5b829bbc2a5cdcdb43ec88',
		prefix: 'src/original/'
	},
	OSIPY: {
		repo: 'OSIPI/dashboard',
		sha: 'a0a3b78becea99d73ac336d74786001d66e031b9',
		prefix: ''
	}
} as const;

export const assessments = {
	documented: 'Documented browser workflow',
	candidate: 'Candidate · not verified',
	adaptation: 'Adaptation needed · not verified',
	blocked: 'Not compatible as supplied',
	matlab: 'MATLAB port needed'
} as const;

export type Contribution = {
	name: string;
	description: string;
	collection: keyof typeof collections;
	path: string;
	language: string;
	kind: 'Source' | 'External reference' | 'Browser engine';
	assessment: keyof typeof assessments;
	notes: string;
};

export const contributions: Contribution[] = [
	{
		name: 'OSIPY 0.1.4 · numeric IVIM',
		description: 'Fits IVIM signal decay using biexponential or simplified models with segmented, full or Bayesian estimation.',
		collection: 'OSIPY',
		path: 'frontend/src/lib/browser-ivim.worker.ts',
		language: 'Python',
		kind: 'Browser engine',
		assessment: 'documented',
		notes:
			'Existing worker and documented Chromium/native comparison for six synthetic single-voxel combinations. NumPy CPU path only; dependencies deliberately limited. Not whole-package, DICOM or volume compatibility; not re-exercised for this catalog.'
	},
	{
		name: 'pydcemri · Vanderbilt',
		description: 'Converts DCE signals to contrast concentration, estimates T1 and fits Tofts or extended Tofts models.',
		collection: 'DCE/DSC',
		path: 'DS_BW_VanderBiltUMC_USA',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'SciPy and pylab calculations; legacy skimage.filter import needs migration to the pinned scikit-image API. Separate plotting and supply array/file adapters.'
	},
	{
		name: 'Automatic AIF selection · Gothenburg',
		description: 'Selects arterial input functions from DSC MRI data using automated or semi-automated methods.',
		collection: 'DCE/DSC',
		path: 'JBJA_GUSahlgrenska_SWE',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'Uses NumPy, SciPy, pandas, scikit-learn, scikit-image, nibabel and Matplotlib. Isolate AIF selection from filesystem discovery and plotting; assess nibabel wheel and version compatibility.'
	},
	{
		name: 'DCE/DSC functions · Laura Bell',
		description: 'Converts DCE and DSC signals to concentration or relaxation changes and fits the DCE Tofts model.',
		collection: 'DCE/DSC',
		path: 'LCB_BNI_USA',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'Numeric modules import NumPy and scipy.optimize, available in the pinned runtime. Real signal conversion and fit entry points have not been exercised in Pyodide.'
	},
	{
		name: 'Pharmacokinetic modelling · Lucy Kershaw',
		description: 'Provides DCE pharmacokinetic forward models, bolus arrival estimation and signal-to-concentration conversion.',
		collection: 'DCE/DSC',
		path: 'LEK_UoEdinburgh_UK',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'NumPy/SciPy models, bolus arrival and signal conversion; plotting uses Matplotlib. Check legacy SciPy calls and isolate numeric entry points before claiming compatibility.'
	},
	{
		name: 'QbiPy subset · Manchester',
		description: 'Provides DCE input functions, compartment models, concentration conversion and variable-flip-angle T1 calculations.',
		collection: 'DCE/DSC',
		path: 'MB_QBI_UoManchester_UK',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'Contributed subset uses NumPy and SciPy, with Matplotlib in examples. Assess this subset separately from the full QbiPy/Madym ecosystem; native Madym execution is not included.'
	},
	{
		name: 'SEPAL · Michael Thrippleton',
		description: 'Simulates and fits DCE signals with configurable pharmacokinetic, pulse-sequence and water-exchange models.',
		collection: 'DCE/DSC',
		path: 'MJT_UoEdinburgh_UK',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy/SciPy, nibabel and joblib. Select a serial fitting path, adapt image I/O, and review legacy dependencies and model settings.'
	},
	{
		name: 'Variable-density DCE correction · Amsterdam',
		description: 'Extends DCE modelling to account for variable-density acquisitions that oversample the centre of k-space.',
		collection: 'DCE/DSC',
		path: 'NK_OG_MO_AUMC_ICR_RMH_NL_UK',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy/SciPy correction with joblib and plotting scripts. Remove process parallelism from the browser path and provide explicit numeric inputs.'
	},
	{
		name: 'MRImageAnalysis · Oslo',
		description: 'Simulates and analyses DCE MRI, including arterial input functions and pharmacokinetic model fitting.',
		collection: 'DCE/DSC',
		path: 'OGJ_OsloU_NOR',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Full workflow uses multiprocessing, shell calls, interactive input, legacy dicom and medpy. Numeric models may be separable, but the supplied workflow is not a browser implementation.'
	},
	{
		name: 'Extended Tofts · Gurney-Champion / Orton',
		description: 'Fits the extended Tofts model and provides arterial input functions, signal conversion and T1 estimation.',
		collection: 'DCE/DSC',
		path: 'OG_MO_AUMC_ICR_RMH_NL_UK',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy/SciPy fitting with joblib. Use a serial path, separate examples/plots, and assess current optimizer and integration APIs.'
	},
	{
		name: 'Population AIFs · Netherlands Cancer Institute',
		description: 'Generates Parker and Georgiou population arterial input functions for DCE analysis.',
		collection: 'DCE/DSC',
		path: 'PvH_NKI_NL',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'Numeric AIF functions use NumPy and math. Matplotlib/file handling occurs in examples; assess the function-only path with explicit time arrays.'
	},
	{
		name: 'DSC processing · Ragunathan / Bell',
		description: 'Provides AIF deconvolution, BSW leakage correction and DSC blood-volume, blood-flow and transit-time calculations.',
		collection: 'DCE/DSC',
		path: 'SR_TBG_BNIPhoenix_USA',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'NumPy linear algebra and SciPy deconvolution, leakage correction and parameter calculations. Bundled old version pins do not match the browser runtime; numerical behavior remains unverified.'
	},
	{
		name: 'DCE models and T1 mapping · Sydney',
		description: 'Provides DCE input functions and compartment models, variable-flip-angle T1 mapping and signal conversion.',
		collection: 'DCE/DSC',
		path: 'ST_USyd_AUS',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'Imports lmfit, SciPy and joblib; signal conversion requests four workers. Assess lmfit and its dependencies, replace parallel scheduling with serial execution, and review legacy APIs.'
	},
	{
		name: 'VFA T1 mapping · McGill',
		description: 'Estimates T1 from variable-flip-angle MRI using DESPOT and NOVIFAST methods.',
		collection: 'DCE/DSC',
		path: 'ZA_McGill_CAN',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'Contributed VFA module imports NumPy and numpy.linalg only. Suitable for an array-based browser assessment; no execution or numerical equivalence claim yet.'
	},
	{
		name: 'ASL Angio Reader',
		description: 'Reads ASL angiography images and supplies maximum-intensity-projection and NIfTI output utilities.',
		collection: 'ASL',
		path: 'ASL_Angio_Reader',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'MATLAB image reader and NIfTI utilities cannot run in Pyodide. Port required numeric/reader functionality; replace desktop interactions with dashboard controls.'
	},
	{
		name: 'ASL-MRICloud',
		description: 'Calculates ASL difference and cerebral blood-flow maps, with supporting registration and brain masking.',
		collection: 'ASL',
		path: 'ASL_MRIcloud',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'MATLAB CBF, difference-map, registration and masking routines. PyASL already contains related modules: assess reuse and scientific equivalence before duplicating a port.'
	},
	{
		name: 'ASLtbx',
		description: 'Preprocesses ASL images and calculates perfusion maps, including control-label subtraction and quantification.',
		collection: 'ASL',
		path: 'ASL_TBX',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'MATLAB/SPM pipeline. Separate quantification from registration and preprocessing; inspect existing PyASL counterparts before porting. No MATLAB engine in Pyodide.'
	},
	{
		name: 'BASIL',
		description: 'Estimates ASL perfusion parameters through Bayesian kinetic-model inference within the FSL ecosystem.',
		collection: 'ASL',
		path: 'BASIL',
		language: 'Shell / Python',
		kind: 'External reference',
		assessment: 'blocked',
		notes:
			'Collection contains a README link, not the pipeline source. Referenced FSL/BASIL workflow relies on native command-line tools; it is not directly executable in Pyodide.'
	},
	{
		name: 'DLASL',
		description: 'Denoises ASL perfusion images using deep learning and transfer learning with pretrained models.',
		collection: 'ASL',
		path: 'DLASL',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'TensorFlow/Keras denoising scripts and model weights. TensorFlow is not supplied by the pinned Pyodide runtime; a different browser inference implementation would need separate validation.'
	},
	{
		name: 'DeepASL',
		description: 'Denoises ASL images with a residual neural network trained using a kinetic-model-informed loss.',
		collection: 'ASL',
		path: 'DeepASL',
		language: 'Python (referenced)',
		kind: 'External reference',
		assessment: 'blocked',
		notes:
			'README points to ASL_CNN rather than vendoring Python code. Referenced source imports TensorFlow/Keras, unavailable in the pinned runtime. A different browser inference implementation and its model assets would need separate validation.'
	},
	{
		name: 'ExploreASL',
		description: 'Provides an ASL processing and analysis pipeline covering image preparation, quantification and quality control.',
		collection: 'ASL',
		path: 'ExploreASL',
		language: 'MATLAB (referenced)',
		kind: 'External reference',
		assessment: 'matlab',
		notes:
			'README points to the external MATLAB/SPM-based pipeline. A wrapper is not a Python port; assess maintainers, licensing and existing Python alternatives before committing to a full rewrite.'
	},
	{
		name: 'Oxford ASL',
		description: 'Orchestrates ASL kinetic-model fitting, calibration and registration to produce quantified perfusion images.',
		collection: 'ASL',
		path: 'OXFORD-ASL',
		language: 'Shell / Python / C++',
		kind: 'External reference',
		assessment: 'blocked',
		notes:
			'README points to the FSL pipeline. Python orchestration does not remove native FSL executables; no direct Pyodide workflow is provided.'
	},
	{
		name: 'Preclinical ASL · Jiadi Xu / Kevin Xie',
		description: 'Provides an application for ASL image preparation, interactive masking and cerebral blood-flow visualization.',
		collection: 'ASL',
		path: 'Preclinical_ASL_Codes/JiadiXu',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'MATLAB application and SPM8-assisted preparation/CBF visualization. Extract numeric functions and replace MATLAB app UI; assess existing PyASL preclinical coverage.'
	},
	{
		name: 'Preclinical ASL · Ni Ruiqing',
		description: 'Fits selective and global T1 signals to calculate cerebral blood flow from mouse FAIR-EPI acquisitions.',
		collection: 'ASL',
		path: 'Preclinical_ASL_Codes/NiRuiqing',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'T1 curve fitting and FAIR-EPI mouse CBF with interactive ROI selection. Port numerical definitions and explicit timing/units; replace lsqcurvefit and GUI selection without changing the estimator.'
	},
	{
		name: 'Preclinical ASL · Zhiliang Wei',
		description: 'Provides mouse ASL image-processing scripts and acquisition-specific preparation steps.',
		collection: 'ASL',
		path: 'Preclinical_ASL_Codes/ZhiliangWei',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'Mouse ASL processing scripts with local paths and acquisition settings. Port data handling and numeric functions with explicit acquisition metadata; assess PyASL overlap.'
	},
	{
		name: 'PyASL (pyasl-osipi)',
		description: 'Combines human and preclinical ASL workflows, including adaptations of ASLtbx, MRICloud and denoising tools.',
		collection: 'ASL',
		path: 'PyASL',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Composite Python library already adapts several MATLAB tools, but the full dependency/workflow includes TensorFlow, nipype, subprocess and FSL. Isolated numeric modules may be candidates; full pipeline is not browser compatible as supplied.'
	},
	{
		name: 'MRI-QAMPER IVIM · Memorial Sloan Kettering',
		description: 'Fits IVIM diffusion data and generates parameter maps using the MRI-QAMPER MATLAB implementation.',
		collection: 'IVIM',
		path: 'fitting/ASD_MemorialSloanKettering',
		language: 'MATLAB',
		kind: 'Source',
		assessment: 'matlab',
		notes:
			'Actual fitting source is MATLAB; the original Python file is an empty initializer and the standardized Python wrapper uses matlab.engine. Neither is a Python implementation of the estimator.'
	},
	{
		name: 'IVIM data utilities · DK / Amsterdam UMC',
		description: 'Loads, normalizes, sorts, masks and reshapes diffusion signals for IVIM analysis.',
		collection: 'IVIM',
		path: 'fitting/DK_OGC_AmsterdamUMC',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Imports torch and torchio for image/signal transforms. These are not supplied by the pinned runtime; extract or reimplement only the required numeric operations with scientific review.'
	},
	{
		name: 'Weighted / robust IVIM fitting · IIIT Nagpur',
		description: 'Estimates IVIM parameters using weighted or robust linear regression with a b-value cutoff.',
		collection: 'IVIM',
		path: 'fitting/DT_IIITN',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'NumPy and statsmodels weighted/robust linear regression. Both are in the pinned runtime catalog; actual estimator behavior and resource use remain unverified.'
	},
	{
		name: 'Linear IVIM fitting · Eric Peterson',
		description: 'Estimates IVIM parameters through a linear-fitting approach to diffusion signal decay.',
		collection: 'IVIM',
		path: 'fitting/ETP_SRI',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy polynomial fitting plus an import from repository utilities.data_simulation.GenerateData. Package required local modules or remove demonstration-only dependencies before browser assessment.'
	},
	{
		name: 'IVIM model suite · Ivan Rashid / Lund',
		description: 'Provides several IVIM estimators, including nonlinear, segmented, variable-projection, linear and simplified fits.',
		collection: 'IVIM',
		path: 'fitting/IAR_LundUniversity',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy/SciPy algorithms are coupled to DIPY model and multi-voxel APIs. DIPY is not in the pinned catalog; provide a compatible build or isolate the estimator without changing its method.'
	},
	{
		name: 'IVIM-NET · Amsterdam UMC',
		description: 'Estimates IVIM parameters with a self-supervised neural network, with fitting and simulation examples.',
		collection: 'IVIM',
		path: 'fitting/OGC_AUMC_IVIMNET',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Examples depend on external IVIMNET, PyTorch, nibabel and joblib. PyTorch is not supplied by the pinned runtime; browser inference would be a separately assessed implementation.'
	},
	{
		name: 'LSQ / segmented / Bayesian IVIM · Amsterdam UMC',
		description: 'Fits biexponential IVIM signals using least-squares, segmented and Bayesian methods, with tri-exponential variants.',
		collection: 'IVIM',
		path: 'fitting/OGC_AmsterdamUMC',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy/SciPy with joblib and tqdm. Establish a serial fitting path, package dependencies, and review optimizer/version behavior before exposing it in a worker.'
	},
	{
		name: 'Segmented / Bayesian IVIM · Oscar Jalnefjord',
		description: 'Provides segmented and Bayesian IVIM estimators; the contributed Python implementation covers segmented fitting.',
		collection: 'IVIM',
		path: 'fitting/OJ_GU',
		language: 'Python / MATLAB',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'ivim_seg.py is a NumPy-only segmented implementation candidate. Separate MATLAB segmented and Bayesian files cannot run in Pyodide; Python coverage does not establish Bayesian equivalence.'
	},
	{
		name: 'Two-step / tri-exponential IVIM · Maastricht',
		description: 'Provides two-step IVIM fitting and tri-exponential least-squares or nonnegative least-squares estimation.',
		collection: 'IVIM',
		path: 'fitting/PV_MUMC',
		language: 'Python',
		kind: 'Source',
		assessment: 'adaptation',
		notes:
			'NumPy/SciPy and joblib/tqdm. Use serial scheduling and explicitly separate biexponential from tri-exponential methods and settings.'
	},
	{
		name: 'ADC / IVIM maps · Netherlands Cancer Institute',
		description: 'Calculates ADC and IVIM parameter maps using selected b-values and a two-step fitting approach.',
		collection: 'IVIM',
		path: 'fitting/PvH_KB_NKI',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'Standalone ADC/IVIM module uses NumPy and warnings; plotting/file handling is separate. Assess array shape, repeated b-values and numeric behavior through the real entry point.'
	},
	{
		name: 'SUPER-IVIM-DC · Technion',
		description: 'Estimates IVIM parameters using supervised learning with data consistency and provides classical fitting alternatives.',
		collection: 'IVIM',
		path: 'fitting/TCML_TechnionIIT',
		language: 'Python (external package)',
		kind: 'External reference',
		assessment: 'blocked',
		notes:
			'Contributed folder contains README/notebook references and an empty initializer, not the package implementation. Referenced super-ivim-dc 0.4.0 declares torch and SimpleITK plus incompatible older pins. Individual classical fit paths need separate isolation.'
	},
	{
		name: 'Consensus segmented IVIM · TF reference',
		description: 'Provides the task force reference implementation of segmented IVIM parameter estimation.',
		collection: 'IVIM',
		path: 'fitting/TF_reference',
		language: 'Python',
		kind: 'Source',
		assessment: 'candidate',
		notes:
			'Imports NumPy, SciPy and statsmodels, all in the pinned catalog. Browser execution, estimator diagnostics and numerical equivalence have not been established.'
	},
	{
		name: 'Brain IVIM preprocessing · Elina Petersson',
		description: 'Provides brain diffusion preprocessing and outlier-removal routines before IVIM fitting.',
		collection: 'IVIM',
		path: 'preprocessing/EP_GU',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Uses subprocess/native preprocessing, nipype and itk. A Python wrapper does not supply the desktop executables or native library builds required by the workflow.'
	},
	{
		name: 'TOPED / FSL preprocessing · Lund',
		description: 'Builds and runs FSL preprocessing commands for diffusion MRI before downstream analysis.',
		collection: 'IVIM',
		path: 'preprocessing/MG_LU',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Builds and launches FSL commands through subprocess. Requires separately ported WASM executables or a local backend, not ordinary Pyodide loading.'
	},
	{
		name: 'Abdomen IVIM preprocessing · Mario Negri',
		description: 'Prepares abdominal diffusion images through denoising, Gibbs-ringing removal, motion and distortion correction, and bias-field correction.',
		collection: 'IVIM',
		path: 'preprocessing/SP_IRFMN',
		language: 'Python',
		kind: 'Source',
		assessment: 'blocked',
		notes:
			'Full pipeline uses MRtrix3, FSL, MIRTK, SimpleITK and DIPY/native operations. Browser integration needs replacements/builds and scientific validation; no direct support as supplied.'
	}
];
