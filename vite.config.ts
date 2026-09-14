import { execSync } from 'child_process';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';
import { version as manifestVersion } from './package.json';

const getSha = (): string => {
	if (process.env.APP_SHA) return process.env.APP_SHA.slice(0, 12);
	try {
		return execSync('git rev-parse --short=12 HEAD').toString().trim();
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

export default defineConfig({
	// Discover worker dependencies at startup, rather than reloading a session after its first export.
	optimizeDeps: { include: ['nifti-reader-js', 'dicom-parser', 'fflate'] },
	server: {
		host: '0.0.0.0',
		port: 60010,
		strictPort: true
	},
	preview: {
		host: '0.0.0.0',
		port: 60014,
		strictPort: true
	},
	define: {
		__APP_VERSION__: JSON.stringify(appVersion),
		__BUILD_SHA__: JSON.stringify(buildSha),
		__BUILD_DATE__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		Icons({
			compiler: 'svelte',
			autoInstall: true
		})
	]
});
