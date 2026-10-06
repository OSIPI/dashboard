export function retryUntilConnected(
	isConnected: () => boolean,
	canAttempt: () => boolean,
	connect: () => Promise<void>,
	intervalMs = 1000
): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout>;
	const tick = async () => {
		if (stopped || isConnected()) return;
		try {
			if (canAttempt()) await connect();
		} finally {
			if (!stopped && !isConnected()) timer = setTimeout(tick, intervalMs);
		}
	};
	timer = setTimeout(tick, intervalMs);
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
