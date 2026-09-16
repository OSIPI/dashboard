import { PersistedState } from 'runed';

// Runed owns storage; retain reactive session controls if the browser denies storage access.
export function persistedPreference<T>(
	key: string,
	initial: T,
	deserialize: (raw: string) => T,
	serialize: (value: T) => string = JSON.stringify
): { current: T } {
	try {
		return new PersistedState(key, initial, {
			syncTabs: false,
			serializer: { serialize, deserialize }
		});
	} catch {
		const session = $state({ current: initial });
		return session;
	}
}
