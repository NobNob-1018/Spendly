/* Static server for the design lab. Serves the REPO ROOT (its own parent), so both
   index.html and design-lab/*.html are reachable at the paths they expect.
   no-store on everything: a cached copy of a file being actively redesigned is worse
   than no server at all. */
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
  ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json",
  ".css":"text/css", ".md":"text/plain" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("403"); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("404 " + p); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    });
    res.end(data);
  });
}).listen(8899, () => console.log("design-lab serving " + ROOT + " on 8899"));
