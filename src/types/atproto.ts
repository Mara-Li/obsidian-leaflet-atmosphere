export interface Credentials {
	identifier: string;
	password: string;
	pdsUrl?: string;
}

export interface ListedRecord<T> {
	uri: string;
	cid: string;
	value: T;
}

export interface DidDocument {
	id: string;
	alsoKnownAs?: string[];
	service?: { id: string; type: string; serviceEndpoint: string }[];
}
