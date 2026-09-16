import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	readFileSync,
	openSync,
	closeSync,
	readSync,
	unlinkSync,
	writeFileSync,
	mkdirSync,
	rmdirSync,
	renameSync
} from 'node:fs';
import { resolve } from 'node:path';

const files = ['package.json', 'CITATION.cff', 'codemeta.json', 'CHANGELOG.md'];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
type Commit = { hash: string; message: string };

export function analyze(commits: Commit[]) {
	let bump = 0;
	const groups: Record<string, string[]> = {};
	for (const { hash, message } of commits) {
		const header = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(message.split('\n')[0]);
		if (!header) continue;
		const [, type, scope, bang, subject] = header;
		const breaking = Boolean(bang) || /^BREAKING[ -]CHANGE:\s*\S/m.test(message);
		bump = Math.max(
			bump,
			breaking ? 3 : type === 'feat' ? 2 : ['fix', 'perf'].includes(type) ? 1 : 0
		);
		const category = breaking
			? 'Breaking changes'
			: type === 'feat'
				? 'Features'
				: type === 'fix'
					? 'Fixes'
					: type === 'perf'
						? 'Performance'
						: 'Other changes';
		(groups[category] ??= []).push(
			`- ${scope ? `${scope}: ` : ''}${subject.replace(/[<>]/g, '')} (${hash.slice(0, 7)})`
		);
	}
	return { bump, groups };
}

export function nextVersion(version: string, bump: number) {
	if (!semver.test(version)) throw new Error(`Unsupported stable SemVer: ${version}`);
	const parts = version.split('.').map(Number);
	if (parts.some((part) => !Number.isSafeInteger(part + 1))) throw new Error('Version too large');
	if (!bump) return null;
	if (![1, 2, 3].includes(bump)) throw new Error('Invalid bump');
	const index = 3 - bump;
	parts[index]++;
	for (let i = index + 1; i < 3; i++) parts[i] = 0;
	return parts.join('.');
}

export function prependNotes(changelog: string, version: string, date: string, commits: Commit[]) {
	if (new RegExp(`^## \\[?v?${version.replaceAll('.', '\\.')}[\\] \\n]`, 'm').test(changelog))
		throw new Error(`Changelog already contains ${version}`);
	const { groups } = analyze(commits);
	const notes = ['Breaking changes', 'Features', 'Fixes', 'Performance', 'Other changes']
		.filter((category) => groups[category])
		.map((category) => `### ${category}\n\n${groups[category].join('\n')}`)
		.join('\n\n');
	const heading = /^# [^\n]+\n/.exec(changelog);
	if (!heading) throw new Error('Missing changelog heading');
	return `${heading[0]}\n## ${version} - ${date}\n\n${notes}\n\n${changelog.slice(heading[0].length).trimStart()}`;
}

export function versionFiles(source: Record<string, string>, version: string) {
	const result = { ...source };
	for (const [file, key] of [
		['package.json', 'version'],
		['codemeta.json', 'softwareVersion']
	]) {
		const expression = new RegExp(`("${key}"\\s*:\\s*")[^"]+(")`);
		if (!expression.test(source[file])) throw new Error(`Missing ${file} ${key}`);
		result[file] = source[file].replace(expression, `$1${version}$2`);
	}
	if (!/^version: .+$/m.test(source['CITATION.cff'])) throw new Error('Missing citation version');
	result['CITATION.cff'] = source['CITATION.cff'].replace(
		/^version: .+$/m,
		`version: '${version}'`
	);
	return result;
}

export function validateRetryContent(
	file: string,
	content: string,
	before: string,
	after: string,
	committed: boolean
) {
	if (content !== after && (committed || content !== before))
		throw new Error(`Unexpected edits in ${file}; refusing overwrite`);
}

function git(...args: string[]) {
	return execFileSync('git', args, {
		encoding: 'utf8',
		env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
	}).trim();
}
function run(command: string, args: string[], env = process.env) {
	console.log(`> ${command} ${args.join(' ')}`);
	execFileSync(command, args, { stdio: 'inherit', env });
}
export type State = {
	base: string;
	version: string;
	before: Record<string, string>;
	after: Record<string, string>;
	archive?: { path: string; sha256: string };
	commit?: string;
	pushed?: boolean;
	releaseId?: number;
	uploads?: Record<string, number>;
	complete?: boolean;
};

const repository = 'OSIPI/dashboard';
const remoteUrl = `https://github.com/${repository}.git`;

export function fileDigest(path: string) {
	const hash = createHash('sha256');
	const fd = openSync(path, 'r');
	try {
		const buffer = Buffer.alloc(1024 * 1024);
		let length;
		while ((length = readSync(fd, buffer, 0, buffer.length, null)))
			hash.update(buffer.subarray(0, length));
		return hash.digest('hex');
	} finally {
		closeSync(fd);
	}
}

export function assertArchive(state: State) {
	if (
		!state.archive ||
		!existsSync(state.archive.path) ||
		fileDigest(state.archive.path) !== state.archive.sha256
	)
		throw new Error(
			'Frozen archive missing or changed; restore original bytes, never rebuild a published release'
		);
}

type Github = (args: string[], output?: string) => Buffer;
const github: Github = (args, output) => {
	if (!output)
		return execFileSync('gh', args, {
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 16 * 1024 * 1024
		});
	const fd = openSync(output, 'w');
	try {
		execFileSync('gh', args, { stdio: ['ignore', fd, 'pipe'] });
		return Buffer.alloc(0);
	} finally {
		closeSync(fd);
	}
};

// Reconcile remote state even when a request succeeded but its local checkpoint did not.
export function publishRelease(state: State, save: () => void, gh: Github = github) {
	assertArchive(state);
	if (!state.commit || !state.pushed) throw new Error('Push must be verified before publication');
	const tag = `v${state.version}`;
	const checksum = `${state.archive!.sha256}  osipy-${tag}.tar.gz\n`;
	if (readFileSync(`${state.archive!.path}.sha256`, 'utf8') !== checksum)
		throw new Error('Checksum file does not match frozen archive');
	const endpoint = `repos/${repository}/releases`;
	const notes = state.after['CHANGELOG.md'].split(`## ${state.version} - `)[1]?.split('\n## ')[0];
	if (!notes) throw new Error('Missing release notes');
	const body = `## ${state.version} - ${notes}`.trim();
	const json = (args: string[]) => JSON.parse(gh(['api', ...args]).toString());
	// Listing includes drafts; tag-only lookup can hide an interrupted draft release.
	const matches = state.releaseId
		? [json([`${endpoint}/${state.releaseId}`])]
		: json([endpoint, '--paginate', '--slurp'])
				.flat()
				.filter((item: { tag_name: string }) => item.tag_name === tag);
	if (matches.length > 1) throw new Error('Duplicate GitHub Releases for tag');
	let release = matches[0];
	if (!release) {
		release = json([
			endpoint,
			'--method',
			'POST',
			'-f',
			`tag_name=${tag}`,
			'-f',
			`target_commitish=${state.commit}`,
			'-f',
			`name=${tag}`,
			'-f',
			`body=${body}`,
			'-F',
			'draft=true'
		]);
	}
	if (release.tag_name !== tag || (state.releaseId && release.id !== state.releaseId))
		throw new Error('Conflicting GitHub Release identity');
	state.releaseId = release.id;
	save();
	if (release.name !== tag || release.body !== body || release.prerelease) {
		if (!release.draft) throw new Error('Published release metadata differs; refusing replacement');
		release = json([
			`${endpoint}/${release.id}`,
			'--method',
			'PATCH',
			'-f',
			`name=${tag}`,
			'-f',
			`body=${body}`,
			'-F',
			'prerelease=false'
		]);
	}
	const assets = json([`${endpoint}/${release.id}/assets`, '--paginate', '--slurp']).flat() as {
		id: number;
		name: string;
		state: string;
	}[];
	for (const path of [state.archive!.path, `${state.archive!.path}.sha256`]) {
		const name = path.split('/').at(-1)!;
		const matches = assets.filter((asset) => asset.name === name);
		if (matches.length > 1) throw new Error(`Duplicate asset: ${name}`);
		if (!matches.length) {
			if (!release.draft) throw new Error(`Published release missing ${name}; refusing mutation`);
			gh(['release', 'upload', tag, path, '--repo', repository]);
		}
		const current = json([`${endpoint}/${release.id}/assets`, '--paginate', '--slurp'])
			.flat()
			.filter((asset: { name: string }) => asset.name === name);
		if (current.length !== 1 || current[0].state !== 'uploaded')
			throw new Error(`Incomplete asset ${name}; inspect release before retry`);
		const downloaded = `${path}.verify`;
		try {
			gh(
				[
					'api',
					`repos/${repository}/releases/assets/${current[0].id}`,
					'-H',
					'Accept: application/octet-stream'
				],
				downloaded
			);
			if (fileDigest(downloaded) !== fileDigest(path))
				throw new Error(`Conflicting asset ${name}; refusing overwrite`);
		} finally {
			if (existsSync(downloaded)) unlinkSync(downloaded);
		}
		(state.uploads ??= {})[name] = current[0].id;
		save();
	}
	if (release.draft) json([`${endpoint}/${release.id}`, '--method', 'PATCH', '-F', 'draft=false']);
	const published = json([`${endpoint}/${release.id}`]);
	if (
		published.draft ||
		published.prerelease ||
		published.name !== tag ||
		published.tag_name !== tag ||
		published.body !== body
	)
		throw new Error('Release publication not verified');
	state.complete = true;
	save();
}

export function release(dry: boolean) {
	process.chdir(git('rev-parse', '--show-toplevel'));
	const statePath = git('rev-parse', '--git-path', 'dashboard-release.json');
	let state: State | undefined = existsSync(statePath)
		? JSON.parse(readFileSync(statePath, 'utf8'))
		: undefined;
	const head = git('rev-parse', 'HEAD');
	// Retire a completed receipt only once its tagged commit is in the current history.
	if (
		state?.complete &&
		head !== state.base &&
		git('tag', '--merged', 'HEAD', '--list', `v${state.version}`) &&
		git('rev-parse', `v${state.version}^{commit}`) !== head
	)
		state = undefined;
	const branch = git('branch', '--show-current');
	const dirty = git('status', '--porcelain', '--untracked-files=all');
	const tags = git('tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-version:refname')
		.split('\n')
		.filter(Boolean);
	if (!tags.length || tags.some((tag) => !semver.test(tag.slice(1))))
		throw new Error(
			'Require a stable vX.Y.Z baseline; unsupported v* tags must be resolved manually'
		);
	if (git('rev-parse', '--is-shallow-repository') === 'true')
		throw new Error('Full history required');
	const latest = tags[0];
	const commits = git('log', `${latest}..HEAD`, '--format=%H%x00%B%x00').split('\0');
	const history: Commit[] = [];
	for (let i = 0; i + 1 < commits.length; i += 2)
		history.push({ hash: commits[i].trim(), message: commits[i + 1].trim() });
	const version = state?.version ?? nextVersion(latest.slice(1), analyze(history).bump);
	if (dry) {
		console.log(
			`Offline preview: ${latest} → ${version ? `v${version}` : 'no release-worthy commits'}`
		);
		console.log(
			`Readiness: branch=${branch}; tree=${dirty ? 'dirty' : 'clean'}. Live origin/main and tags NOT checked.`
		);
		if (version) {
			const source = Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));
			console.log(
				state?.after['CHANGELOG.md'] ??
					prependNotes(
						source['CHANGELOG.md'],
						version,
						new Date().toISOString().slice(0, 10),
						history
					)
			);
		}
		console.log(
			'Plan (only if release-worthy commits or pending receipt): verify clean/current main and remote tags; update package.json, CITATION.cff, codemeta.json, CHANGELOG.md; run bun run check, bun test, Python companion tests and prepared-data verification; build; freeze tar archive + SHA-256 + version manifest; checkpoint; create release commit and annotated checksum-bound tag; atomic push main + tag; create/update draft GitHub Release; reconcile/upload exact archive and checksum without clobber; publish; tag-triggered Pages waits for assets, verifies checksum/version/source and deploys without install/build. Retries reuse frozen archive and reconcile remote effects.'
		);
		console.log(
			`Checkpoint: ${state ? JSON.stringify({ version: state.version, archive: state.archive?.sha256, commit: state.commit, pushed: state.pushed, releaseId: state.releaseId, complete: state.complete }) : 'none'}`
		);
		return;
	}
	if (branch !== 'main') throw new Error('Release requires main');
	// Read public refs without credentials; publishing below uses the existing Git/gh login.
	const remote = git(
		'-c',
		'credential.helper=',
		'ls-remote',
		remoteUrl,
		'refs/heads/main',
		'refs/tags/v*'
	);
	const refs = new Map(
		remote
			.split('\n')
			.map((line) => line.split(/\s+/) as [string, string])
			.map(([sha, ref]) => [ref, sha])
	);
	const base = state?.base ?? head;
	if (refs.get('refs/heads/main') !== base && !(state && refs.get('refs/heads/main') === head))
		throw new Error('main must equal live OSIPI/dashboard main (or saved release base on retry)');
	for (const [ref, sha] of refs) {
		if (ref.startsWith('refs/tags/') && git('rev-parse', ref) !== sha)
			throw new Error(`Fetch matching remote tag first: ${ref}`);
	}
	if (!state && dirty)
		throw new Error('Release requires clean tracked, staged and untracked files');
	if (!version) {
		console.log('No release-worthy commits.');
		return;
	}
	const tag = `v${version}`;
	const message = `chore(release): ${tag}`;
	const before =
		state?.before ?? Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));
	const after = state?.after ?? versionFiles(before, version);
	if (!state)
		after['CHANGELOG.md'] = prependNotes(
			before['CHANGELOG.md'],
			version,
			new Date().toISOString().slice(0, 10),
			history
		);
	const committed = head !== base;
	if (
		committed &&
		(git('rev-parse', 'HEAD^') !== base || git('log', '-1', '--format=%B') !== message)
	)
		throw new Error('HEAD changed during release; inspect saved release state');
	const allowed = new Set(files);
	const changed = [
		...git('diff', '--name-only', base).split('\n'),
		...git('diff', '--cached', '--name-only').split('\n'),
		...git('ls-files', '--others', '--exclude-standard').split('\n')
	].filter(Boolean);
	if (changed.some((file) => !allowed.has(file)))
		throw new Error('Unrelated changes during release; preserve them and resolve before retry');
	for (const file of files) {
		const content = readFileSync(file, 'utf8');
		validateRetryContent(file, content, before[file], after[file], committed);
		validateRetryContent(
			file,
			git('show', `:${file}`),
			before[file].trim(),
			after[file].trim(),
			committed
		);
		if (committed && git('show', `HEAD:${file}`) !== after[file].trim())
			throw new Error(`Release commit mismatch: ${file}`);
	}
	const tagExists = git('tag', '--list', tag) === tag;
	if (
		tagExists &&
		(!committed ||
			git('rev-parse', `${tag}^{commit}`) !== head ||
			git('cat-file', '-t', `refs/tags/${tag}`) !== 'tag')
	)
		throw new Error(`Conflicting tag ${tag}`);
	state ??= { base, version, before, after };
	const save = () => {
		writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
		renameSync(`${statePath}.tmp`, statePath);
	};
	save();
	for (const file of files) writeFileSync(file, after[file]);
	if (!state.archive) {
		if (state.pushed || state.releaseId) throw new Error('Missing frozen archive checkpoint');
		const python = process.env.RELEASE_PYTHON ?? '../osipy/.venv/bin/python';
		run('bun', ['run', 'check']);
		run('bun', ['test']);
		run(python, ['-m', 'unittest', 'discover', '-s', 'companion']);
		run(python, ['scripts/prepare_ivim.py', '--verify']);
		run('bun', ['run', 'build'], { ...process.env, APP_VERSION: tag, APP_SHA: base });
		writeFileSync(
			'build/release.json',
			JSON.stringify({ version: tag, source: base, basePath: '/dashboard' }) + '\n'
		);
		// Keep the durable artifact outside build/: a later Vite build must not erase it.
		const directory = git('rev-parse', '--git-path', `dashboard-releases/${tag}`);
		mkdirSync(directory, { recursive: true });
		const path = resolve(directory, `osipy-${tag}.tar.gz`);
		run('tar', ['-czf', `${path}.tmp`, '-C', 'build', '--exclude=*.tar.gz*', '.']);
		renameSync(`${path}.tmp`, path);
		state.archive = { path, sha256: fileDigest(path) };
	}
	if (git('rev-parse', 'HEAD') !== head || git('branch', '--show-current') !== 'main')
		throw new Error('HEAD or branch changed while checking release');
	for (const file of files) {
		if (readFileSync(file, 'utf8') !== after[file]) throw new Error(`Checks changed ${file}`);
		validateRetryContent(
			file,
			git('show', `:${file}`),
			before[file].trim(),
			after[file].trim(),
			committed
		);
	}
	if (
		[
			...git('diff', '--name-only', base).split('\n'),
			...git('diff', '--cached', '--name-only').split('\n'),
			...git('ls-files', '--others', '--exclude-standard').split('\n')
		]
			.filter(Boolean)
			.some((file) => !allowed.has(file))
	)
		throw new Error('Unrelated changes appeared during checks');
	save();
	assertArchive(state);
	const checksum = `${state.archive.sha256}  osipy-${tag}.tar.gz\n`;
	const checksumPath = `${state.archive.path}.sha256`;
	if (existsSync(checksumPath) && readFileSync(checksumPath, 'utf8') !== checksum)
		throw new Error('Checksum file changed; refusing overwrite');
	writeFileSync(checksumPath, checksum);
	if (!committed) {
		run('git', ['add', '--', ...files]);
		if (
			git('diff', '--cached', '--name-only')
				.split('\n')
				.some((file) => !allowed.has(file))
		)
			throw new Error('Unrelated staged changes');
		run('git', [
			'-c',
			'core.hooksPath=/dev/null',
			'-c',
			'commit.gpgSign=false',
			'commit',
			'-m',
			message
		]);
	}
	state.commit = git('rev-parse', 'HEAD');
	save();
	const annotation = `Release ${tag}\n\nSHA256: ${state.archive.sha256}\nSource: ${base}`;
	if (!tagExists) run('git', ['-c', 'tag.gpgSign=false', 'tag', '-a', tag, '-m', annotation]);
	if (git('for-each-ref', '--format=%(contents)', `refs/tags/${tag}`) !== annotation)
		throw new Error('Tag annotation differs from frozen archive; refusing replacement');
	const tagObject = git('rev-parse', `refs/tags/${tag}`);
	const remoteMain = refs.get('refs/heads/main');
	const remoteTag = refs.get(`refs/tags/${tag}`);
	if (remoteMain !== state.commit || remoteTag !== tagObject) {
		if (remoteTag) throw new Error('Partial/conflicting remote release; inspect before retry');
		run('git', [
			'-c',
			'core.hooksPath=/dev/null',
			'push',
			'--atomic',
			remoteUrl,
			`${state.commit}:refs/heads/main`,
			`refs/tags/${tag}:refs/tags/${tag}`
		]);
	}
	const pushed = git(
		'-c',
		'credential.helper=',
		'ls-remote',
		remoteUrl,
		'refs/heads/main',
		`refs/tags/${tag}`
	);
	if (
		!pushed.includes(`${state.commit}\trefs/heads/main`) ||
		!pushed.includes(`${tagObject}\trefs/tags/${tag}`)
	)
		throw new Error('Atomic push not verified');
	state.pushed = true;
	save();
	publishRelease(state, save);
	console.log(
		`Published ${tag}: ${state.archive.path}. Receipt: ${statePath}. Pages deployment runs on GitHub; inspect its tag run for completion.`
	);
}

if (import.meta.main) {
	try {
		if (process.argv.slice(2).some((arg) => arg !== '--dry-run'))
			throw new Error('Usage: bun scripts/release.ts [--dry-run]');
		const dry = process.argv.includes('--dry-run');
		const lock = git('rev-parse', '--git-path', 'dashboard-release.lock');
		if (!dry) mkdirSync(lock);
		try {
			release(dry);
		} finally {
			if (!dry) rmdirSync(lock);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
