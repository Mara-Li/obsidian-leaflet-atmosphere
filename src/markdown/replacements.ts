import type { TextReplacement } from "../types";

/** Regex of a rule: `/pattern/flags`, or a bare pattern replaced everywhere. */
export function compileRule(pattern: string): RegExp | null {
	if (!pattern) return null;
	const literal = /^\/(.+)\/([a-z]*)$/s.exec(pattern);
	try {
		if (!literal) return new RegExp(pattern, "g");
		return new RegExp(literal[1]!, literal[2]);
	} catch {
		return null;
	}
}

/** `\n` and `\t` written in a replacement stand for a line break and a tab. */
function spaceUnescape(replacement: string): string {
	return replacement.replace(/\\([nt\\])/g, (_, c: string) =>
		c === "n" ? "\n" : c === "t" ? "\t" : "\\"
	);
}

/** Apply the rules in order; invalid ones are skipped. */
export function applyReplacements(text: string, rules: TextReplacement[]): string {
	for (const rule of rules) {
		const regex = compileRule(rule.regex);
		if (regex) text = text.replace(regex, spaceUnescape(rule.replacement));
	}
	return text;
}
