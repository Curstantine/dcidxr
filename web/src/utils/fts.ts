const FTS_OPERATORS = new Set(["AND", "OR", "NOT"]);

export function buildFtsQuery(input: string): string | null {
	const normalized = input.normalize("NFKC");

	// Split on whitespace, keep only letters/numbers per token (any language),
	// this also kills column-filter syntax like `name:foo` since ':' is dropped,
	// and kills NEAR/^/*  since those chars are dropped too.
	const rawTokens = normalized
		.split(/\s+/)
		.map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
		.filter(Boolean);

	if (rawTokens.length === 0) return null;

	const parts: string[] = [];
	let lastWasOperator = true; // true at start so a leading AND/OR gets dropped, not treated as op

	for (const token of rawTokens) {
		const isOperator = FTS_OPERATORS.has(token); // case-sensitive: FTS5 only treats UPPERCASE as operators

		if (isOperator) {
			// Don't allow two operators in a row, or an operator with nothing before it
			if (lastWasOperator || parts.length === 0) continue;
			parts.push(token);
			lastWasOperator = true;
		} else {
			parts.push(`"${token}"`); // literal phrase, can't be reinterpreted as syntax
			lastWasOperator = false;
		}
	}

	// Drop a trailing dangling operator
	if (lastWasOperator && FTS_OPERATORS.has(parts.at(-1) ?? "")) {
		parts.pop();
	}

	return parts.length > 0 ? parts.join(" ") : null;
}
