export const INPUT_ACTIONS = [
	['inspect', 'Voxel tool', 'v'],
	['pan', 'Pan tool', 'p'],
	['slice', 'Slice drag tool', 's'],
	['window', 'Window and level tool', 'w'],
	['window-region', 'Regional window tool', 'e'],
	['rectangle', 'Rectangle ROI tool', 'r'],
	['freehand', 'Freehand ROI tool', 'f'],
	['previousSlice', 'Previous slice', 'PageUp'],
	['nextSlice', 'Next slice', 'PageDown'],
	['previousVolume', 'Previous acquisition', '['],
	['nextVolume', 'Next acquisition', ']'],
	['zoomIn', 'Zoom in', '='],
	['zoomOut', 'Zoom out', '-'],
	['reset', 'Reset display', '0']
] as const;
export type InputAction = (typeof INPUT_ACTIONS)[number][0];
export type InputPreferences = {
	wheel: 'zoom' | 'slice';
	drag: 'tool' | 'slice';
	shortcuts: Record<InputAction, string>;
};
export const defaultInputPreferences = (): InputPreferences => ({
	wheel: 'zoom',
	drag: 'tool',
	shortcuts: Object.fromEntries(INPUT_ACTIONS.map(([id, , key]) => [id, key])) as Record<
		InputAction,
		string
	>
});
// Keep browser/system combinations and native focus/voxel keys reserved.
export function shortcutKey(key: string): string | undefined {
	if (/^[a-z0-9]$/i.test(key) || (key.length === 1 && '[]=-,.;/'.includes(key)))
		return key.toLowerCase();
	if (key === 'PageUp' || key === 'PageDown') return key;
	return undefined;
}
export function readInputPreferences(raw: string): InputPreferences {
	const defaults = defaultInputPreferences();
	try {
		const value = JSON.parse(raw);
		if (
			!value ||
			!['zoom', 'slice'].includes(value.wheel) ||
			!['tool', 'slice'].includes(value.drag)
		)
			return defaults;
		const keys = INPUT_ACTIONS.map(([id]) => value.shortcuts?.[id]);
		if (keys.some((key) => typeof key !== 'string' || (key !== '' && shortcutKey(key) !== key)))
			return defaults;
		const assigned = keys.filter(Boolean);
		if (new Set(assigned).size !== assigned.length) return defaults;
		return {
			wheel: value.wheel,
			drag: value.drag,
			shortcuts: Object.fromEntries(INPUT_ACTIONS.map(([id], i) => [id, keys[i]])) as Record<
				InputAction,
				string
			>
		};
	} catch {
		return defaults;
	}
}
