import { readFileSync } from "node:fs";
import vm from "node:vm";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * public/widget.js — executed, not just grepped.
 *
 * tests/widget/loader.test.ts pins the shipped bytes; this file runs the same
 * bytes against a minimal fake DOM, because two behaviours cannot be proven by
 * reading strings: which window may resize the mount (`event.source`), and the
 * down-state watchdog (timers). The loader is dependency-free browser JS, so an
 * element shim is enough — no new test dependency, no jsdom.
 */

const LOADER = readFileSync("public/widget.js", "utf8");
const BASE = "https://fiage.test";
const STORE = "store-A";
const FALLBACK_TEXT = "آزمون عطر فیاژ در دسترس نیست";

type Handler = (event: unknown) => void;

class FakeElement {
  id = "";
  src = "";
  href = "";
  target = "";
  rel = "";
  dir = "";
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  nextSibling: FakeElement | null = null;
  contentWindow: { postMessage: ReturnType<typeof vi.fn> } | null = null;

  private text = "";
  private handlers: Record<string, Handler[]> = {};

  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.text = value;
    this.children.length = 0;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
    const index = reference ? this.children.indexOf(reference) : -1;

    if (index === -1) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }

    child.parentNode = this;
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, handler: Handler): void {
    (this.handlers[type] ??= []).push(handler);
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.handlers[type] ?? []) {
      handler(event);
    }
  }

  getElementsByTagName(): FakeElement[] {
    return [];
  }

  findByText(value: string): FakeElement | undefined {
    if (this.text === value) {
      return this;
    }

    for (const child of this.children) {
      const found = child.findByText(value);

      if (found) {
        return found;
      }
    }

    return undefined;
  }
}

/** Boots the shipped loader the way a merchant page would, then hands back the DOM. */
function mountLoader() {
  const script = new FakeElement("script");

  script.src = `${BASE}/widget.js`;
  script.setAttribute("data-store-id", STORE);

  const host = new FakeElement("div");

  host.appendChild(script);

  const listeners = new Map<string, Handler[]>();

  const windowObject = {
    console: { warn: vi.fn() },
    addEventListener(type: string, handler: Handler) {
      const existing = listeners.get(type) ?? [];

      existing.push(handler);
      listeners.set(type, existing);
    },
  };

  const documentObject = {
    currentScript: script,
    createElement(tag: string) {
      const element = new FakeElement(tag);

      // In a real browser an iframe always has a contentWindow; identity is
      // what the resize bridge checks, so the fake needs one too.
      if (tag === "iframe") {
        element.contentWindow = { postMessage: vi.fn() };
      }

      return element;
    },
    getElementsByTagName: () => [] as FakeElement[],
  };

  const context = vm.createContext({
    window: windowObject,
    document: documentObject,
    URL,
    Number,
    Math,
    encodeURIComponent,
    // Wrapped (not captured) so fake timers installed by the test apply.
    setTimeout: (handler: () => void, ms: number) => setTimeout(handler, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });

  vm.runInContext(LOADER, context);

  const mount = host.children.find((child) => child.id === "fragrance-ai-widget");

  if (!mount) {
    throw new Error("the loader did not mount");
  }

  const iframe = mount.children[0];
  const message = (data: unknown, source: unknown) => {
    for (const handler of listeners.get("message") ?? []) {
      handler({ origin: BASE, source, data });
    }
  };

  return { mount, iframe, message };
}

const resize = (height: unknown) => ({ type: "fragrance-ai:resize", height });

describe("public/widget.js runtime — resize bridge identity and bounds", () => {
  it("ignores a resize from another window even with the right origin and type", () => {
    const { iframe, message } = mountLoader();

    message(resize(640), { postMessage: vi.fn() });
    expect(iframe.style.height).toBe("560px");

    message(resize(640), iframe.contentWindow);
    expect(iframe.style.height).toBe("640px");
  });

  it("ignores 199 and 5001 outright and applies exactly 200 and 5000", () => {
    const { iframe, message } = mountLoader();

    message(resize(199), iframe.contentWindow);
    expect(iframe.style.height).toBe("560px");

    message(resize(200), iframe.contentWindow);
    expect(iframe.style.height).toBe("200px");

    message(resize(5000), iframe.contentWindow);
    expect(iframe.style.height).toBe("5000px");

    message(resize(5001), iframe.contentWindow);
    // Ignored, not clamped to the edge: the last good value survives.
    expect(iframe.style.height).toBe("5000px");
  });

  it("still ignores non-finite heights", () => {
    const { iframe, message } = mountLoader();

    message(resize("tall"), iframe.contentWindow);
    message(resize(Number.POSITIVE_INFINITY), iframe.contentWindow);

    expect(iframe.style.height).toBe("560px");
  });
});

describe("public/widget.js runtime — down-state watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces the mount with a loader-rendered fallback after 12s without load", () => {
    const { mount } = mountLoader();

    vi.advanceTimersByTime(11_999);
    expect(mount.findByText(FALLBACK_TEXT)).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(mount.findByText(FALLBACK_TEXT)).toBeDefined();

    const retry = mount.findByText("تلاش دوباره");

    expect(retry).toBeDefined();
    expect(retry?.href).toBe(`${BASE}/widget?store=${STORE}`);
    expect(retry?.target).toBe("_blank");
    expect(retry?.rel).toBe("noopener");

    // The dead frame is gone, replaced by the loader's own node.
    expect(mount.children).toHaveLength(1);
    expect(mount.children[0].tagName).toBe("DIV");
  });

  it("never shows the fallback once the iframe has loaded", () => {
    const { mount, iframe } = mountLoader();

    iframe.dispatch("load", {});
    vi.advanceTimersByTime(60_000);

    expect(mount.findByText(FALLBACK_TEXT)).toBeUndefined();
    expect(mount.children[0]).toBe(iframe);
  });

  it("shows nothing while the frame is still within its loading window", () => {
    const { mount } = mountLoader();

    vi.advanceTimersByTime(11_000);

    expect(mount.findByText(FALLBACK_TEXT)).toBeUndefined();
    expect(mount.children[0].tagName).toBe("IFRAME");
  });
});
