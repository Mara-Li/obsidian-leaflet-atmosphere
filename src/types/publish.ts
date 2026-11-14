import type { App } from "obsidian";
import type { AtpClient } from "../atproto/client";
import type { ListedRecord } from "./atproto";
import type { StandardDocument } from "./lexicons";
import type { GazetteSettings } from "./settings";

export interface PublishResult {
	uri: string;
	url: string;
	title: string;
	/** Publication AT-URI, or the personal page address. */
	site: string;
	created: boolean;
	/** The note had lost its link: the existing post was found and updated. */
	recovered: boolean;
	/** DataviewJS queries left out because DataviewJS is disabled in Dataview. */
	skippedDataviewJs: number;
	warnings: string[];
}

export interface PublishOptions {
	/** Publication AT-URI, or "" for a standalone document. */
	site?: string;
}

export interface FoundPost {
	rkey: string;
	record: ListedRecord<StandardDocument>;
	/** How the post was matched to the note. */
	by: "key" | "title";
}

export interface RecoveryContext {
	app: App;
	client: AtpClient;
	settings: GazetteSettings;
	/** Documents of the repository, listed once per run. */
	listDocuments: () => Promise<ListedRecord<StandardDocument>[]>;
	/** Note that already owns a record key in the current run. */
	ownerOf: (rkey: string) => string | undefined;
}

export interface PostToLink {
	uri: string;
	rkey: string;
	title: string;
	url: string;
}

/** A post of a note: its record, its address and the site it belongs to (when known). */
export interface PostLink {
	uri: string;
	url?: string;
	site?: string;
}
