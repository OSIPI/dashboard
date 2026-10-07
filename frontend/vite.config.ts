import { execSync } from 'child_process';
import { request } from 'node:http';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import Icons from 'unplugin-icons/vite';
import { version as manifestVersion } from './package.json';

const getSha = (): string => {
	if (process.env.APP_SHA) return process.env.APP_SHA.slice(0, 12);
	try {
		return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return 'unknown';
	}
};

const getBaseVersion = (): string => {
	try {
		return execSync("git describe --tags --abbrev=0 --match 'v[0-9]*'", {
			stdio: ['ignore', 'pipe', 'ignore']
		})
			.toString()
			.trim()
			.replace(/^v/, '');
	} catch {
		return manifestVersion;
	}
};

const buildSha = getSha();
const appVersion = process.env.APP_VERSION ?? `${getBaseVersion()}-dev+${buildSha}`;

function localApiProxy(port: number): Plugin {
	return {
		name: 'local-osipy-api-proxy',
		configureServer(server) {
			server.middlewares.use('/local-api', (req, res) => {
				const host = req.headers.host;
				const origin = req.headers.origin;
				const path = req.url ?? '';
				const allowed =
					(req.method === 'GET' &&
						(/^\/(health|models|catalog)$/.test(path) ||
							/^\/fits\/[a-f0-9-]+(?:\/maps(?:\/(?:d|d_star|f|s0|valid|status|r_squared))?|\/voxel\?x=\d+&y=\d+&z=\d+)?$/.test(
								path
							))) ||
					(req.method === 'POST' &&
						(path === '/datasets' || /^\/datasets\/[a-f0-9-]+\/fits$/.test(path))) ||
					(req.method === 'DELETE' &&
						(/^\/(?:fits|datasets)\/[a-f0-9-]+$/.test(path) ||
							/^\/fits\/[a-f0-9-]+\/retained$/.test(path)));
				if (
					!['localhost:60010', '127.0.0.1:60010'].includes(host ?? '') ||
					(origin && origin !== `http://${host}`) ||
					req.headers['sec-fetch-site'] !== 'same-origin' ||
					!allowed
				) {
					res.writeHead(403).end();
					return;
				}
				const upstream = request(
					{
						hostname: '127.0.0.1',
						port,
						path,
						method: req.method,
						headers: {
							...(req.headers['content-type']
								? { 'Content-Type': req.headers['content-type'] }
								: {}),
							...(req.headers['content-length']
								? { 'Content-Length': req.headers['content-length'] }
								: {})
						}
					},
					(response) => {
						res.writeHead(response.statusCode ?? 502, {
							'Content-Type': response.headers['content-type'] ?? 'application/octet-stream',
							'Cache-Control': 'no-store'
						});
						response.pipe(res);
					}
				);
				upstream.on('error', () => {
					if (!res.headersSent) res.writeHead(502);
					res.end();
				});
				req.on('aborted', () => upstream.destroy());
				req.pipe(upstream);
			});
		}
	};
}

export default defineConfig(({ command }) => {
	const localProxy = command === 'serve' && process.env.OSIPY_LOCAL_API_PROXY === '1';
	const apiPort = Number(process.env.OSIPY_API_PORT ?? 60016);
	if (!Number.isSafeInteger(apiPort) || apiPort < 1 || apiPort > 65535)
		throw new Error('OSIPY_API_PORT must be a valid loopback port.');
	return {
		// Discover worker dependencies at startup, rather than reloading a session after its first export.
		optimizeDeps: { include: ['nifti-reader-js', 'dicom-parser', 'fflate'] },
		server: {
			host: localProxy ? '127.0.0.1' : '0.0.0.0',
			port: 60010,
			strictPort: true
		},
		preview: {
			host: '0.0.0.0',
			port: 60014,
			strictPort: true
		},
		define: {
			__LOCAL_API_PROXY__: JSON.stringify(localProxy),
			__APP_VERSION__: JSON.stringify(appVersion),
			__BUILD_SHA__: JSON.stringify(buildSha),
			__BUILD_DATE__: JSON.stringify(new Date().toISOString())
		},
		plugins: [
			...(localProxy ? [localApiProxy(apiPort)] : []),
			tailwindcss(),
			sveltekit(),
			devtoolsJson(),
			Icons({
				compiler: 'svelte',
				autoInstall: true
			})
		]
	};
});
