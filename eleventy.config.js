import { HtmlBasePlugin } from "@11ty/eleventy";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildNominationAssets } from "./award-nominations/dev/build-site.mjs";

// PATH_PREFIX serves the site from a subfolder, e.g. /www.sigmod.org/ on GitHub Pages.
const pathPrefix = process.env.PATH_PREFIX || "/";

export default function (eleventyConfig) {
  if (pathPrefix !== "/") eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addGlobalData("layout", "page.njk");

  // Cache-busting: "/assets/site.css" | v  ->  "/assets/site.css?v=<first 8 hex of the file's MD5>".
  // The link changes only when the file does, so browsers fetch new CSS/JS right after a deploy.
  eleventyConfig.addFilter("v", (url) => {
    const rel = url.replace(/^\/assets\//, "");
    const file = path.join("src/assets", rel);
    if (!fs.existsSync(file)) return url;
    return url + "?v=" + crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
  });

  // Award nominations: the form code (src/assets/nominate.js, .css) is generated
  // from the Apps Script app in award-nominations/ before every build.
  eleventyConfig.on("eleventy.before", () => { buildNominationAssets(); });
  eleventyConfig.addWatchTarget("award-nominations/apps-script/");
  eleventyConfig.addGlobalData("currentYear", new Date().getFullYear());

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  // Files in src/static are copied as they are, never rendered (e.g. the PODS OpenTOC pages)
  eleventyConfig.ignores.add("src/static/**");

  eleventyConfig.addCollection("news", (api) =>
    api.getFilteredByTag("news").sort((a, b) => b.date - a.date));
  eleventyConfig.addCollection("pages", (api) =>
    api.getAll().filter((p) => p.data.wp_type === "page"));

  eleventyConfig.addFilter("date", (d, style = "long") => {
    const dt = new Date(d);
    return style === "iso" ? dt.toISOString().slice(0, 10)
      : dt.toLocaleDateString("en-US", { year: "numeric", month: style === "short" ? "short" : "long", day: "numeric", timeZone: "UTC" });
  });
  eleventyConfig.addFilter("year", (d) => new Date(d).getUTCFullYear());
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  // URL a news item should link to (its canonical page when it is a duplicate)
  eleventyConfig.addFilter("href", (item) => item.data.redirect_to || item.url);
  // nav helpers
  eleventyConfig.addFilter("isActive", (link, url) =>
    !!url && (url === link.url || (link.children || []).some((c) => c.url === url)));
  eleventyConfig.addFilter("findMenu", (menus, url, area) =>
    menus.find((m) => m.url === url || (m.children || []).some((c) => c.url === url)) ||
    menus.find((m) => m.area === area));

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    pathPrefix,
  };
}
