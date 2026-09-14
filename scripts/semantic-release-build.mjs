import { spawn } from 'node:child_process';

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit', ...options });
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))
		);
	});
}

export async function prepare(_pluginConfig, { nextRelease }) {
	const version = `v${nextRelease.version}`;
	const archive = `osipy-${version}.tar.gz`;
	await run('bun', ['run', 'build'], {
		env: {
			...process.env,
			APP_VERSION: version,
			APP_SHA: process.env.GITHUB_SHA ?? ''
		}
	});
	await run('tar', ['-czf', archive, '-C', 'build', '.']);
}
