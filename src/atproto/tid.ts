const S32 = "234567abcdefghijklmnopqrstuvwxyz";

let lastTimestamp = 0;
const clockId = Math.floor(Math.random() * 1024);

/** Timestamp identifier (AT Protocol record key). */
export function nextTid(): string {
	const timestamp = Math.max(Date.now() * 1000, lastTimestamp + 1);
	lastTimestamp = timestamp;
	let value = (BigInt(timestamp) << 10n) | BigInt(clockId);
	let out = "";
	for (let i = 0; i < 13; i++) {
		out = S32.charAt(Number(value & 31n)) + out;
		value >>= 5n;
	}
	return out;
}

export function parseAtUri(
	uri: string
): { repo: string; collection: string; rkey: string } | null {
	const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)/.exec(uri.trim());
	if (!match) return null;
	return { repo: match[1]!, collection: match[2]!, rkey: match[3]! };
}

export function isValidRecordKey(rkey: string): boolean {
	return /^[A-Za-z0-9._:~-]{1,512}$/.test(rkey) && rkey !== "." && rkey !== "..";
}
