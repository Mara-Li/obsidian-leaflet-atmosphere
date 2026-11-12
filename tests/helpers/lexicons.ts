import { execFileSync } from "child_process";
import * as path from "path";

/** Validation errors of document records (empty string when valid). */
export function validateDocuments(records: unknown[]): string[] {
	const output = execFileSync(process.execPath, [path.resolve("tests/helpers/validate.mjs")], {
		input: JSON.stringify(records),
	});
	return JSON.parse(output.toString()) as string[];
}

export function validateDocument(record: unknown): string {
	return validateDocuments([record])[0] ?? "";
}

/** Substring of a rich text addressed by UTF-8 byte offsets. */
export function sliceBytes(text: string, start: number, end: number): string {
	return Buffer.from(text, "utf8").subarray(start, end).toString("utf8");
}
