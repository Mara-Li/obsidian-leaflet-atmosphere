import { browser } from "@wdio/globals";
import * as fs from "fs";
import * as path from "path";
import { obsidianPage } from "wdio-obsidian-service";
import { DEFAULT_SETTINGS, type GazetteSettings } from "../../src/interfaces";
import type { StandardDocument } from "../../src/leaflet/types";

export const DID = "did:plc:leaflettest";
export const PUBLICATION = {
	uri: `at://${DID}/site.standard.publication/3garden`,
	name: "Test garden",
	url: "https://garden.example.com",
};
const PLUGIN_ID = "gazette";

export interface FakeStore {
	records: Record<string, StandardDocument>;
	blobs: { mime: string; size: number }[];
}

const TEST_VAULT = path.resolve(process.env.VAULT_TEST || "tests/vault");

/**
 * Notes of a vault as UTF-8 strings: resetVault garbles non-ASCII characters when it
 * restores a modified file from a vault path (wdio-obsidian-service 3.5.0).
 */
function notesOf(vault: string, dir = vault, out: Record<string, string> = {}) {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (name === ".obsidian") continue;
		if (fs.statSync(full).isDirectory()) notesOf(vault, full, out);
		else if (name.endsWith(".md"))
			out[path.relative(vault, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
	}
	return out;
}

/** Reset the vault and replace the PDS client of the plugin by an in-memory fake. */
export async function setup(
	settings: Partial<GazetteSettings> = {},
	vault = TEST_VAULT
): Promise<void> {
	const notes = notesOf(vault);
	// Restoring the vault deletes notes: their posts are not the business of the next test
	await browser.executeObsidian(({ plugins }) => {
		plugins.gazette.settings.onNoteDeleted = "keep";
	});
	await obsidianPage.resetVault(vault, notes);
	// Wait for the metadata cache to hold the properties of the restored notes
	const expected: Record<string, string[]> = {};
	for (const [file, content] of Object.entries(notes)) {
		const yaml = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? "";
		expected[file] = [...yaml.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]!).sort();
	}
	let attempt = 0;
	await browser.waitUntil(
		() =>
			browser.executeObsidian(
				async ({ app }, { wanted, contents, repair }) => {
					let ready = true;
					for (const [p, keys] of Object.entries(wanted)) {
						const file = app.vault.getFileByPath(p);
						if (!file) {
							ready = false;
							continue;
						}
						const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
						if (JSON.stringify(Object.keys(fm).sort()) === JSON.stringify(keys)) continue;
						ready = false;
						// The file watcher can miss the restore (seen on Windows): write it again
						if (repair) await app.vault.modify(file, contents[p]!);
					}
					return ready;
				},
				{ wanted: expected, contents: notes, repair: ++attempt % 5 === 0 }
			),
		{ timeout: 15000, timeoutMsg: "Metadata cache not ready" }
	);
	await browser.executeObsidian(
		({ plugins }, { did, defaults, overrides }) => {
			const plugin = plugins.gazette;
			const store = {
				records: {} as Record<string, unknown>,
				blobs: [] as unknown[],
				delay: 0,
			};
			const cid = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
			const uri = (collection: string, rkey: string) => `at://${did}/${collection}/${rkey}`;
			const fake = {
				did,
				handle: "tester.example.com",
				getRecord: async (collection: string, rkey: string) => {
					const value = store.records[`${collection}/${rkey}`];
					return value ? { uri: uri(collection, rkey), cid, value } : null;
				},
				putRecord: async (collection: string, rkey: string, record: unknown) => {
					await new Promise((resolve) => setTimeout(resolve, store.delay));
					store.records[`${collection}/${rkey}`] = JSON.parse(JSON.stringify(record));
					return { uri: uri(collection, rkey), cid };
				},
				deleteRecord: async (collection: string, rkey: string) => {
					delete store.records[`${collection}/${rkey}`];
				},
				uploadBlob: async (data: ArrayBuffer, mimeType: string) => {
					store.blobs.push({ mime: mimeType, size: data.byteLength });
					return { $type: "blob", ref: { $link: cid }, mimeType, size: data.byteLength };
				},
				listRecords: async (collection: string) =>
					Object.entries(store.records)
						.filter(([key]) => key.startsWith(`${collection}/`))
						.map(([key, value]) => ({ uri: uri(collection, key.split("/")[1]!), cid, value })),
				getBskyPost: async (postUri: string) =>
					postUri.endsWith("/3notfound2222") ? null : { uri: postUri, cid },
				resolveHandle: async (handle: string) =>
					handle === "alice.bsky.social" ? "did:plc:alicetest" : null,
			};
			(window as unknown as { leafletTest: unknown }).leafletTest = store;
			(plugin as unknown as { getClient: () => Promise<unknown> }).getClient = async () =>
				fake;
			Object.assign(plugin.settings, JSON.parse(JSON.stringify(defaults)), overrides);
		},
		{
			did: DID,
			defaults: DEFAULT_SETTINGS,
			overrides: {
				publications: [PUBLICATION],
				defaultPublication: PUBLICATION.uri,
				...settings,
			},
		}
	);
}

export async function getStore(): Promise<FakeStore> {
	return browser.executeObsidian(
		() => (window as unknown as { leafletTest: FakeStore }).leafletTest
	);
}

export async function getRecords(): Promise<Record<string, StandardDocument>> {
	return (await getStore()).records;
}

/** Wait for a notice matching the pattern, then return its text. */
export async function waitNotice(pattern: RegExp, timeout = 20000): Promise<string> {
	let found = "";
	await browser.waitUntil(
		async () => {
			const texts = await browser.executeObsidian(() =>
				Array.from(activeDocument.querySelectorAll(".notice")).map((n) => n.textContent ?? "")
			);
			found = texts.find((t) => pattern.test(t)) ?? "";
			return found !== "";
		},
		{ timeout, timeoutMsg: `No notice matching ${pattern}` }
	);
	return found;
}

export async function clearNotices(): Promise<void> {
	await browser.executeObsidian(() => {
		activeDocument.querySelectorAll(".notice").forEach((n) => n.remove());
	});
}

export async function runCommand(command: string, file?: string): Promise<void> {
	await clearNotices();
	if (file) {
		await obsidianPage.openFile(file);
		// Opening a note can take a moment to make it the active file (seen on Windows)
		await browser.waitUntil(
			() => browser.executeObsidian(({ app }, p) => app.workspace.getActiveFile()?.path === p, file),
			{ timeout: 10000, timeoutMsg: `${file} never became the active note` }
		);
	}
	// A command whose check fails does nothing: retry, then say why
	let state = "";
	await browser.waitUntil(
		async () => {
			const result = await browser.executeObsidian(({ app }, id) => {
				const ran = (app.commands as unknown as { executeCommandById(id: string): boolean })
					.executeCommandById(id);
				return { ran, active: app.workspace.getActiveFile()?.path ?? "none" };
			}, `${PLUGIN_ID}:${command}`);
			state = `active note: ${result.active}`;
			return result.ran;
		},
		{ timeout: 5000, interval: 250 }
	).catch(() => {
		throw new Error(`Command ${command} could not run (${state})`);
	});
}

/** Publish a note with the command palette and wait for the result notice. */
export async function publish(file: string): Promise<string> {
	await runCommand("publish-note", file);
	return waitNotice(/Published to Leaflet|Updated on Leaflet|^Leaflet: /);
}

export async function confirmModal(): Promise<void> {
	const button = await browser.$(".modal-container .setting-item-control button:last-child");
	await button.waitForClickable();
	await button.click();
}

export async function getFrontmatter(file: string): Promise<Record<string, unknown>> {
	return browser.executeObsidian(({ app }, path) => {
		const target = app.vault.getFileByPath(path);
		return (target && app.metadataCache.getFileCache(target)?.frontmatter) ?? {};
	}, file);
}

/** Wait until the metadata cache sees a frontmatter value. */
export async function waitFrontmatter(file: string, key: string): Promise<unknown> {
	let value: unknown;
	// The metadata cache can be slow to catch up when several Obsidian instances run
	await browser.waitUntil(
		async () => {
			value = (await getFrontmatter(file))[key];
			return value !== undefined;
		},
		{ timeout: 15000, timeoutMsg: `${key} never appeared in ${file}` }
	);
	return value;
}

/** Whether a command of the plugin can run on the given note. */
export async function commandAvailable(command: string, file: string): Promise<boolean> {
	await obsidianPage.openFile(file);
	return browser.executeObsidian(({ app }, id) => {
		const cmd = app.commands.commands[id];
		return cmd?.checkCallback ? cmd.checkCallback(true) === true : !!cmd;
	}, `${PLUGIN_ID}:${command}`);
}

/** Slow down the fake PDS so that progress can be observed. */
export async function setPdsDelay(ms: number): Promise<void> {
	await browser.executeObsidian((_, delay) => {
		(window as unknown as { leafletTest: { delay: number } }).leafletTest.delay = delay;
	}, ms);
}

/** Text and progress value of the status bar item, or null when hidden. */
export async function statusBar(): Promise<{ text: string; value: number | null } | null> {
	return browser.executeObsidian(() => {
		const el = activeDocument.querySelector<HTMLElement>(".status-bar .gazette-status");
		if (!el || el.style.display === "none" || !el.textContent) return null;
		const bar = el.querySelector("progress");
		return {
			text: el.textContent,
			value: bar?.hasAttribute("value") ? bar.value : null,
		};
	});
}

/** Remove the link of a note, as when its properties were lost. */
export async function forgetLink(file: string): Promise<void> {
	await browser.executeObsidian(async ({ app }, path) => {
		await app.fileManager.processFrontMatter(app.vault.getFileByPath(path)!, (fm: Record<string, unknown>) => {
			delete fm.leaflet_uri;
			delete fm.leaflet_url;
		});
	}, file);
	await browser.waitUntil(async () => (await getFrontmatter(file)).leaflet_uri === undefined, {
		timeout: 15000,
	});
}
