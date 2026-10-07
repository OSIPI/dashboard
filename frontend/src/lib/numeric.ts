export function boundedNumber(
	raw: string,
	current: number,
	min: number,
	max: number,
	step: number
) {
	const value = Number(raw);
	if (!raw.trim() || !Number.isFinite(value)) return current;
	return Math.max(min, Math.min(max, Number((Math.round(value / step) * step).toPrecision(12))));
}
