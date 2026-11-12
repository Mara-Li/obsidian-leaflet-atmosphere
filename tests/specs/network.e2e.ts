import { browser, expect } from "@wdio/globals";
import * as http from "http";
import type { AddressInfo } from "net";

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
		const plugin = plugins.leafletAtmosphere;
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
