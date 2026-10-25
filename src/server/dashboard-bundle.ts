import { basename, dirname, isAbsolute, resolve } from "node:path";

export async function dashboardResponses(
	bundle: Bun.HTMLBundle,
): Promise<{ index: Response; assets: Map<string, Response> }> {
	const assets = new Map<string, Response>();
	let index: Response | undefined;
	if (bundle.files) {
		const outputRoot = process.env.BACKLOG_BUNDLE_ASSET_DIR?.trim() || dirname(Bun.main);
		for (const file of bundle.files) {
			const response = new Response(Bun.file(isAbsolute(file.path) ? file.path : resolve(outputRoot, file.path)), {
				headers: file.headers,
			});
			if (file.isEntry && file.loader === "html") index = response;
			else assets.set(`/${basename(file.path)}`, response);
		}
	} else {
		const { default: tailwind } = await import("bun-plugin-tailwind");
		const result = await Bun.build({
			entrypoints: [bundle.index],
			target: "browser",
			publicPath: "/",
			plugins: [tailwind],
			minify: false,
			root: resolve(bundle.index, ".."),
			define: { "process.env.NODE_ENV": JSON.stringify("production") },
		});
		if (!result.success) throw new Error("Dashboard bundle failed");
		for (const file of result.outputs) {
			const response = new Response(file, { headers: { "Content-Type": file.type } });
			if (file.path.endsWith(".html")) index = response;
			else assets.set(`/${basename(file.path)}`, response);
		}
	}
	if (!index) throw new Error("Dashboard entry is missing");
	const rewrite = (element: HTMLRewriterTypes.Element, attribute: string) => {
		const value = element.getAttribute(attribute);
		if (value && !/^(?:[a-z]+:|\/\/|#)/i.test(value)) {
			const path = `/${basename(value)}`;
			if (assets.has(path)) element.setAttribute(attribute, path);
		}
	};
	const rewritten = await new HTMLRewriter()
		.on("script[src]", { element: (element) => rewrite(element, "src") })
		.on("link[href]", { element: (element) => rewrite(element, "href") })
		.transform(index)
		.text();
	index = new Response(rewritten, { headers: index.headers });
	index.headers.delete("etag");
	index.headers.set("Cache-Control", "no-store");
	return { index, assets };
}
