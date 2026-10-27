/** Static acceptance server plus the Worker's native TestFlight redirect fixture. */
import { extname, resolve } from "node:path";

export function homeServer(root: string) {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
  return Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      // Real HTTP navigation, without launching a native app or contacting Apple in tests.
      if (pathname === "/download/ios") return Response.redirect(new URL("/__testflight_join", request.url).href, 302);
      if (pathname === "/__testflight_join") return new Response("<h1>Join phux in TestFlight</h1>", { headers: { "content-type": "text/html" } });
      let path = resolve(root, `.${pathname}`);
      if (!path.startsWith(`${root}/`) && path !== root) return new Response(null, { status: 403 });
      if (pathname === "/") path = resolve(root, "index.html");
      if (!extname(path)) path += ".html";
      const file = Bun.file(path);
      if (!(await file.exists())) return new Response(null, { status: 404 });
      return new Response(file, { headers: { "content-type": types[extname(path)] ?? file.type } });
    },
  });
}
