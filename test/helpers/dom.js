import { JSDOM } from "jsdom";

export function installDom(html) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");

  dom.window.document.documentElement.innerHTML = html
    .replace(/^[\s\S]*?<html[^>]*>/, "")
    .replace(/<\/html>\s*$/, "");

  global.window = dom.window;
  global.document = dom.window.document;
  global.CSS = dom.window.CSS;
  global.Event = dom.window.Event;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.MouseEvent = dom.window.MouseEvent;

  return dom.window;
}
