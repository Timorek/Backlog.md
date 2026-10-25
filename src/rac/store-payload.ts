export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const MAX_EVENT_BYTES = 65_536;
export const STORE_ERROR_CODES = [
	"provider_error",
	"process_exited",
	"timeout",
	"policy_mismatch",
	"storage_error",
] as const;
export type StoredErrorCode = (typeof STORE_ERROR_CODES)[number];
export type EventInput =
	| { kind: "text"; text: string }
	| { kind: "user_message" | "agent_message"; text: string; itemId?: string }
	| { kind: "error"; code: StoredErrorCode };

export function redactRacText(text: string, secrets: readonly string[] = []): string {
	let value = text;
	for (const secret of secrets) if (secret) value = value.split(secret).join("[REDACTED]");
	return value
		.replace(
			/-----BEGIN [^-\n]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [^-\n]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
			"[REDACTED PRIVATE KEY]",
		)
		.replace(
			/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
			"[REDACTED]",
		)
		.replace(/\b(Bearer|Basic)\s+[^\s"'<>]+/gi, "$1 [REDACTED]")
		.replace(
			/\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|secret[_-]access[_-]key|authorization|cookie)["']?\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
			"$1[REDACTED]",
		)
		.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

export function canonicalJson(value: unknown): string {
	let nodes = 0;
	function visit(item: unknown, depth: number): JsonValue {
		if (++nodes > 4096 || depth > 16) throw new Error("JSON structure exceeds RAC limits");
		if (item === null || typeof item === "string" || typeof item === "boolean") return item;
		if (typeof item === "number" && Number.isFinite(item)) return item;
		if (Array.isArray(item)) return item.map((entry) => visit(entry, depth + 1));
		if (item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
			return Object.fromEntries(
				Object.keys(item)
					.sort()
					.map((key) => [key, visit((item as Record<string, unknown>)[key], depth + 1)]),
			);
		}
		throw new Error("RAC payload must contain JSON values only");
	}
	const result = JSON.stringify(visit(value, 0));
	if (Buffer.byteLength(result) > MAX_EVENT_BYTES) throw new Error("RAC payload exceeds 64 KiB");
	return result;
}

export function sanitizedJson(value: unknown, secrets: readonly string[]): string {
	const parsed: JsonValue = JSON.parse(canonicalJson(value));
	function visit(item: JsonValue): JsonValue {
		if (typeof item === "string") return redactRacText(item, secrets);
		if (Array.isArray(item)) return item.map(visit);
		if (item && typeof item === "object") {
			for (const key of Object.keys(item)) {
				if (/token|secret|password|authorization|cookie|credential|api[_-]?key|private[_-]?key/i.test(key))
					throw new Error("Credential fields cannot be persisted in RAC payloads");
			}
			return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
		}
		return item;
	}
	return canonicalJson(visit(parsed));
}
