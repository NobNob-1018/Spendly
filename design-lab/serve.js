const http=require("http"),fs=require("fs"),path=require("path");
const T={".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json"};
http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
const f=path.join(__dirname,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end("404");return;}
s.writeHead(200,{"Content-Type":T[path.extname(f)]||"application/octet-stream","Cache-Control":"no-store"});s.end(d);});}).listen(8899,()=>console.log("8899"));
