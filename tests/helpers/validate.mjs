// Validates document records read as JSON on stdin against the Leaflet lexicons.
// Runs as plain ESM: @atproto/lexicon cannot be loaded by the wdio TypeScript loader.
import { jsonToLex, Lexicons } from "@atproto/lexicon";
import * as fs from "node:fs";
import * as path from "node:path";

function load(dir, out = []) {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) load(full, out);
		else if (name.endsWith(".json")) out.push(JSON.parse(fs.readFileSync(full, "utf8")));
	}
	return out;
}

const lexicons = new Lexicons(load(path.resolve(import.meta.dirname, "../lexicons")));
const records = JSON.parse(fs.readFileSync(0, "utf8"));
const errors = records.map((record) => {
	const lex = jsonToLex(record);
	const result = lexicons.validate("site.standard.document", lex);
	if (!result.success) return result.error.message;
	const content = lexicons.validate("pub.leaflet.content", lex.content);
	return content.success ? "" : content.error.message;
});
process.stdout.write(JSON.stringify(errors));
