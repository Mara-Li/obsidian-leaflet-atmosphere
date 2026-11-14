import { browser, expect } from "@wdio/globals";
import * as http from "http";
import type { AddressInfo } from "net";
import { validateDocument } from "../helpers/lexicons";
import { getRecords, getStore, publish, setup } from "../helpers/obsidian";

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64"
);
const DOCUMENT = "at://did:plc:writer/site.standard.document/3kpost";
const PUBLICATION = "at://did:plc:writer/site.standard.publication/3kblog";

const html = (head: string) => `<!doctype html><html><head>${head}</head><body>Hi</body></html>`;

const PAGES: Record<string, [number, string, string | Buffer]> = {
	"/article": [
		200,
		"text/html; charset=utf-8",
		html(
			'<title>Fallback</title><meta property="og:title" content="An article">' +
				'<meta name="description" content="What it is about"><meta property="og:image" content="/cover.png">'
		),
	],
	"/cover.png": [200, "image/png", PNG],
	"/post": [200, "text/html", html(`<title>Post</title><link rel="site.standard.document" href="${DOCUMENT}">`)],
	"/blog": [200, "text/html", html("<title>Blog</title>")],
	"/.well-known/site.standard.publication/blog": [200, "text/plain", PUBLICATION],
};

describe("Link cards", function () {
	let server: http.Server;
	let base = "";

	before(async function () {
		server = http.createServer((req, res) => {
			const page = PAGES[req.url ?? ""];
			if (!page) return void res.writeHead(404).end("Not found");
			res.writeHead(page[0], { "Content-Type": page[1] }).end(page[2]);
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	after(function () {
		server.close();
	});

	it("show the title, description and image of the page", async function () {
		await setup({ publishKey: "" });
		const note = ["/article", "/post", "/blog", "/missing"].map((p) => base + p).join("\n\n");
		await browser.executeObsidian(async ({ app }, content) => {
			await app.vault.create("Links.md", content);
		}, note);
		await publish("Links.md");
		const record = Object.values(await getRecords()).find((r) => r.title === "Links")!;
		expect(validateDocument(record)).toBe("");

		const blocks = record.content.pages[0]!.blocks.map((b) => b.block);
		expect(blocks[0]).toMatchObject({
			$type: "pub.leaflet.blocks.website",
			src: `${base}/article`,
			title: "An article",
			description: "What it is about",
			previewImage: { $type: "blob", mimeType: "image/png" },
		});
		// standard.site pages get the Leaflet cards of their records
		expect(blocks[1]).toEqual({ $type: "pub.leaflet.blocks.standardSitePost", uri: DOCUMENT });
		expect(blocks[2]).toEqual({
			$type: "pub.leaflet.blocks.standardSitePublication",
			uri: PUBLICATION,
		});
		// A page that cannot be read still gets a card with its address
		expect(blocks[3]).toEqual({ $type: "pub.leaflet.blocks.website", src: `${base}/missing` });
		expect((await getStore()).blobs).toHaveLength(1);
	});
});
