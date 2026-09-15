/* Builds the three offline test copies. Each is the live app with a harness bolted
   on in FRONT of it, so the app's own code is untouched -- a redesign of a variant
   never has to work around the harness, and a diff against index.html shows only
   design changes. Re-runnable: it rebuilds from index.html every time. */
const fs = require("fs"), path = require("path");
const ROOT = "C:/Users/Tim Salinas/Desktop/Repository/spend-tracker";
const LAB  = path.join(ROOT, "design-lab");
const src  = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "seed-data.json"), "utf8");

const VARIANTS = [
  { file: "unai-only.html", ns: "LAB_UNAI_",     label: "un-ai only",     note: "/unai — the video corpus is the sole authority" },
  { file: "unai-team.html", ns: "LAB_UNAITEAM_", label: "un-ai + others", note: "/unai-team — corpus at layer 3, other skills fill the rest" },
  { file: "ui-only.html",   ns: "LAB_UI_",       label: "others only",    note: "/ui — the nine-skill stack, no un-ai-ify" }
];

const harness = v => `
<!-- ===========================================================================
     OFFLINE TEST HARNESS — not part of the live app, and not part of the design.
     Generated; do not hand-edit. Everything here exists so this copy can be opened,
     poked at and thrown away without touching the real Spendly.
     ======================================================================== -->
<script>
(function(){
  "use strict";
  var NS = ${JSON.stringify(v.ns)};

  /* 1. Storage namespace. localStorage is scoped to the ORIGIN, not the path, so a
        copy served from the same site would read and WRITE the real records. Keys
        are prefixed here rather than in 25 places, which also catches the direct
        getItem calls that never went through makeStore. */
  var _get = Storage.prototype.getItem,
      _set = Storage.prototype.setItem,
      _del = Storage.prototype.removeItem;
  function ns(k){ return (typeof k === "string" && k.indexOf("spendly_") === 0) ? NS + k : k; }
  Storage.prototype.getItem    = function(k){ return _get.call(this, ns(k)); };
  Storage.prototype.setItem    = function(k, v){ return _set.call(this, ns(k), v); };
  Storage.prototype.removeItem = function(k){ return _del.call(this, ns(k)); };

  /* 2. No route to GitHub. The namespaced token key is empty so sync is already off,
        but a pasted token would otherwise reach the real account and the real gist.
        Impossible beats unlikely. */
  var _fetch = window.fetch;
  window.fetch = function(input){
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    if (/api\.github\.com|gist\.githubusercontent\.com/.test(url)){
      return Promise.reject(new Error("Sync is disabled in the design lab."));
    }
    return _fetch.apply(this, arguments);
  };

  /* 3. No service worker. The live one has scope over the whole site and would cache
        these pages, which is the opposite of what a test copy is for. */
  try{
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, get: function(){ return undefined; } });
  }catch(e){}

  /* 4. Seed, written once. Invented data shaped like four months of ordinary use --
        the real backup is financial records and this repo is public. A redesign
        judged against empty tables is not judged at all. */
  var SEED = ${SEED};
  try{
    if (localStorage.getItem("spendly_expenses_v1") === null){
      for (var k in SEED){
        if (Object.prototype.hasOwnProperty.call(SEED, k)) localStorage.setItem(k, JSON.stringify(SEED[k]));
      }
    }
  }catch(e){}

  /* 5. Start over, for when a variant has been edited into a corner. Wipes only this
        variant's namespace, never the others and never the live app's keys. */
  window.__labReset = function(){
    var doomed = [];
    for (var i = 0; i < localStorage.length; i++){
      var key = localStorage.key(i);
      if (key && key.indexOf(NS) === 0) doomed.push(key);
    }
    doomed.forEach(function(key){ _del.call(localStorage, key); });
    location.reload();
  };
})();
<\/script>
`;

const badge = v => `
<div id="lab-badge" role="note">
  <strong>TEST BUILD</strong>
  <span>${v.label}</span>
  <small>${v.note}</small>
  <button type="button" onclick="__labReset()" title="Wipe this variant's test data and reload">reset</button>
</div>
<style>
  /* Deliberately not using the app's tokens: a redesign must not be able to restyle
     this by accident, or nobody can tell which build they are looking at. */
  #lab-badge{
    position: fixed; z-index: 99999; left: 10px; bottom: 10px;
    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
    max-width: calc(100vw - 20px);
    padding: 6px 10px; border-radius: 999px;
    background: #2b1d00; color: #ffd479; border: 1px solid #7a5a12;
    font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: .02em; pointer-events: none;
  }
  #lab-badge strong{ letter-spacing: .08em; }
  #lab-badge small{ opacity: .65; font-weight: 500; }
  #lab-badge button{
    pointer-events: auto; cursor: pointer;
    background: transparent; border: 1px solid #7a5a12; color: inherit;
    border-radius: 999px; padding: 1px 7px; font: inherit; font-size: 10px;
  }
  @media (max-width: 720px){
    #lab-badge{ bottom: auto; top: 6px; left: 6px; font-size: 10px; padding: 4px 8px; }
    #lab-badge small{ display: none; }
  }
<\/style>
`;

const SW_BLOCK = `if ("serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}`;

fs.mkdirSync(LAB, { recursive: true });
for (const v of VARIANTS){
  let out = src;

  const at = out.indexOf("<script>");
  if (at < 0) throw new Error("no script tag");
  out = out.slice(0, at) + harness(v) + out.slice(at);

  if (out.indexOf(SW_BLOCK) < 0) throw new Error("sw block not found for " + v.file);
  out = out.replace(SW_BLOCK, "/* Service worker registration removed: this is an offline test copy. */");

  const end = out.lastIndexOf("</body>");
  if (end < 0) throw new Error("no </body>");
  out = out.slice(0, end) + badge(v) + out.slice(end);

  fs.writeFileSync(path.join(LAB, v.file), out);
  console.log("  built  design-lab/" + v.file.padEnd(16) + " ns=" + v.ns);
}
console.log("\n" + VARIANTS.length + " copies rebuilt from index.html");
