export class LocalRequestError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status = 403,
	) {
		super(message);
	}
}

export function checkLocalRequest(request: Request, port: number): void {
	const url = new URL(request.url);
	const hosts = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].map((value) => new URL(value).host);
	const host = request.headers.get("host");
	const matchesHost = host === url.host || (port === 80 && host === `${url.hostname}:80`);
	if (url.protocol !== "http:" || !hosts.includes(url.host) || !matchesHost)
		throw new LocalRequestError("host_forbidden", "Use the displayed local dashboard address");
	const origin = request.headers.get("origin");
	const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
	const stream =
		request.headers.get("upgrade")?.toLowerCase() === "websocket" ||
		request.headers.get("accept")?.includes("text/event-stream");
	if ((origin !== null && origin !== url.origin) || ((mutation || stream) && !origin))
		throw new LocalRequestError("origin_forbidden", "A matching dashboard Origin is required");
	if (request.headers.get("sec-fetch-site") === "cross-site")
		throw new LocalRequestError("origin_forbidden", "Cross-site dashboard requests are forbidden");
	if (mutation && request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
		throw new LocalRequestError("json_required", "Mutations require application/json", 415);
}

export async function readLocalJson(request: Request, limit = 16_384): Promise<Record<string, unknown>> {
	const reader = request.body?.getReader();
	if (!reader) throw new LocalRequestError("invalid_input", "A JSON object is required", 400);
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			size += next.value.byteLength;
			if (size > limit) {
				void reader.cancel().catch(() => {});
				throw new LocalRequestError("payload_too_large", "Request exceeds its size limit", 413);
			}
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	try {
		const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (value && typeof value === "object" && !Array.isArray(value)) return value;
	} catch {}
	throw new LocalRequestError("invalid_input", "A JSON object is required", 400);
}

export function localError(error: unknown): Response {
	const known =
		error instanceof Error &&
		"status" in error &&
		"code" in error &&
		typeof error.status === "number" &&
		typeof error.code === "string";
	return Response.json(
		{ error: known ? error.message : "RAC is unavailable", code: known ? error.code : "rac_unavailable" },
		{ status: known ? (error.status as number) : 503, headers: { "Cache-Control": "no-store" } },
	);
}
