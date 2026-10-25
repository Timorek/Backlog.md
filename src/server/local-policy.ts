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
	const rac = url.pathname.startsWith("/api/rac/");
	const browser = ["sec-fetch-site", "sec-fetch-dest", "cookie"].some((name) => request.headers.has(name));
	const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
	const stream =
		request.headers.get("upgrade")?.toLowerCase() === "websocket" ||
		request.headers.get("accept")?.includes("text/event-stream");
	if ((origin !== null && origin !== url.origin) || ((stream || (mutation && (rac || browser))) && !origin))
		throw new LocalRequestError("origin_forbidden", "A matching dashboard Origin is required");
	const navigation =
		!mutation &&
		!stream &&
		/^\/(?:tasks(?:\/.*)?|board(?:\/.*)?|documentation(?:\/.*)?|decisions(?:\/.*)?|milestones|drafts|statistics|settings|rac\/pair)?$/.test(
			url.pathname,
		) &&
		request.headers.get("sec-fetch-mode") === "navigate" &&
		request.headers.get("sec-fetch-dest") === "document";
	if (request.headers.get("sec-fetch-site") === "cross-site" && !navigation)
		throw new LocalRequestError("origin_forbidden", "Cross-site dashboard requests are forbidden");
	const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
	const hasBody = request.headers.has("content-length")
		? request.headers.get("content-length") !== "0"
		: request.body !== null;
	const legacyText =
		!rac &&
		request.method === "PUT" &&
		/^\/api\/decisions\/[^/]+$/.test(url.pathname) &&
		(!type || type === "text/plain" || type === "text/markdown");
	if (mutation && (rac || hasBody) && type !== "application/json" && !legacyText)
		throw new LocalRequestError("json_required", "Mutations require application/json", 415);
}

type Handler = (request: Request, context?: unknown) => Response | Promise<Response>;
export function guardLocalRoutes(
	routes: Record<string, unknown>,
	html: unknown,
	render: Handler,
	guard: (request: Request, action: () => Response | Promise<Response>) => Promise<Response>,
): void {
	for (const [path, value] of Object.entries(routes)) {
		if (value === html) routes[path] = (request: Request) => guard(request, () => render(request));
		else if (typeof value === "function")
			routes[path] = (request: Request, context?: unknown) =>
				guard(request, () => (value as Handler)(request, context));
		else if (value instanceof Response) routes[path] = (request: Request) => guard(request, () => value.clone());
		else if (
			value &&
			typeof value === "object" &&
			Object.keys(value).length &&
			Object.entries(value).every(
				([method, handler]) =>
					["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method) &&
					typeof handler === "function",
			)
		) {
			for (const [method, handler] of Object.entries(value))
				(value as Record<string, unknown>)[method] = (request: Request, context?: unknown) =>
					guard(request, () => (handler as Handler)(request, context));
		} else throw new Error(`Unsupported dashboard route shape: ${path}`);
	}
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
