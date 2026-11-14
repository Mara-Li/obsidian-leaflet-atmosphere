import i18next from "i18next";
import { type RequestUrlParam, type RequestUrlResponse, requestUrl } from "obsidian";

/** Chromium network errors (net::ERR_*) grouped by what the user can do about them. */
type NetworkKind = "proxy" | "offline" | "dns" | "certificate" | "connection" | "blocked";

const NETWORK_ERRORS: [RegExp, NetworkKind][] = [
	[
		/ERR_(TUNNEL_CONNECTION|PROXY_CONNECTION|PROXY_AUTH|PROXY_CERTIFICATE|MANDATORY_PROXY)/,
		"proxy",
	],
	[
		/ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|NETWORK_ACCESS_DENIED|ADDRESS_UNREACHABLE)/,
		"offline",
	],
	[/ERR_NAME_(NOT_RESOLVED|RESOLUTION_FAILED)/, "dns"],
	[/ERR_(CERT_|SSL_|BAD_SSL)/, "certificate"],
	[/ERR_(CONNECTION_|TIMED_OUT|EMPTY_RESPONSE|SOCKET_)/, "connection"],
	[/ERR_BLOCKED/, "blocked"],
];

export class NetworkError extends Error {
	constructor(
		public code: string,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

export function hostOf(url: string): string {
	return /^https?:\/\/([^/?#]+)/.exec(url)?.[1] ?? url;
}

/** requestUrl with readable messages for network failures. */
export async function request(params: RequestUrlParam): Promise<RequestUrlResponse> {
	try {
		return await requestUrl({ throw: false, ...params });
	} catch (e) {
		const raw = e instanceof Error ? e.message : String(e);
		const code = /ERR_[A-Z_]+/.exec(raw)?.[0];
		if (!code) throw e;
		const kind = NETWORK_ERRORS.find(([pattern]) => pattern.test(code))?.[1] ?? "generic";
		const host = hostOf(params.url);
		throw new NetworkError(code, i18next.t(`network.${kind}`, { host, code }), {
			cause: e,
		});
	}
}

/** Message for an HTTP failure that the server did not explain itself. */
export function httpErrorMessage(status: number, url: string): string {
	const host = hostOf(url);
	if (status === 429) return i18next.t("http.rateLimited", { host, status });
	if (status >= 500) return i18next.t("http.unavailable", { host, status });
	if (status === 401 || status === 403 || status === 407)
		return i18next.t("http.denied", { host, status });
	if (status === 404 || status === 405) return i18next.t("http.notPds", { host, status });
	return i18next.t("http.unexpected", { host, status });
}
