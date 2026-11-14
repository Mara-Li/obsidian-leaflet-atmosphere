import { browser, expect } from "@wdio/globals";
import * as http from "http";
import type { AddressInfo } from "net";
import { clearNotices, waitNotice } from "../helpers/obsidian";

/** Set the proxy of Obsidian's Electron session ("system" to restore it). */
async function setProxy(rules: string | null): Promise<void> {
	await browser.executeObsidian(async (_, proxyRules) => {
		const remote = (window as unknown as { require(id: string): unknown }).require(
			"@electron/remote"
		) as {
			session: { defaultSession: { setProxy(config: Record<string, string>): Promise<void> } };
		};
		await remote.session.defaultSession.setProxy(
			proxyRules ? { proxyRules, proxyBypassRules: "<-loopback>" } : { mode: "system" }
		);
	}, rules);
}

async function connectError(): Promise<string> {
	return browser.executeObsidian(async ({ app, plugins }) => {
		const plugin = plugins.gazette;
		app.secretStorage.setSecret("leaflet-network-test", "not-a-password");
		Object.assign(plugin.settings, {
			identifier: "alice.example.com",
			appPasswordSecret: "leaflet-network-test",
			pdsUrl: "",
		});
		try {
			await plugin.getClient();
			return "connected";
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	});
}

describe("Network errors", function () {
	let proxy: http.Server;

	before(async function () {
		// A proxy that refuses every tunnel, like a broken corporate proxy or VPN
		proxy = http.createServer((_, res) => res.writeHead(502).end());
		proxy.on("connect", (_, socket) => socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
		await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
		const { port } = proxy.address() as AddressInfo;
		await setProxy(`http://127.0.0.1:${port}`);
	});

	after(async function () {
		await setProxy(null);
		proxy.close();
	});

	it("explains a failed proxy tunnel", async function () {
		const message = await connectError();
		expect(message).toContain("ERR_TUNNEL_CONNECTION_FAILED");
		expect(message).toContain("public.api.bsky.app");
		expect(message).toContain("proxy");
	});
});

describe("HTTP errors", function () {
	let server: http.Server;
	let pdsUrl = "";
	let answer: (res: http.ServerResponse) => void = () => undefined;

	before(async function () {
		server = http.createServer((_, res) => answer(res));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		pdsUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	after(function () {
		server.close();
	});

	/** Run the Connect button and return the notice it shows. */
	async function connectNotice(identifier: string): Promise<string> {
		await clearNotices();
		await browser.executeObsidian(
			async ({ app, plugins }, { identifier, pdsUrl }) => {
				const plugin = plugins.gazette;
				app.secretStorage.setSecret("leaflet-network-test", "not-a-password");
				Object.assign(plugin.settings, {
					identifier,
					appPasswordSecret: "leaflet-network-test",
					pdsUrl,
				});
				await plugin.connect();
			},
			{ identifier, pdsUrl }
		);
		return waitNotice(/^Leaflet: /);
	}

	it("explains a server or proxy outage", async function () {
		answer = (res) =>
			res.writeHead(502, { "Content-Type": "text/html" }).end("<h1>Bad gateway</h1>");
		const notice = await connectNotice("alice.example.com");
		expect(notice).toContain("is not answering right now (HTTP 502)");
	});

	it("shows special characters without HTML escaping", async function () {
		answer = (res) =>
			res
				.writeHead(401, { "Content-Type": "application/json" })
				.end(JSON.stringify({ error: "AuthenticationRequired", message: "Invalid" }));
		const notice = await connectNotice("o'brien&co.example.com");
		expect(notice).toBe("Leaflet: Wrong handle or app password for o'brien&co.example.com.");
	});
});
