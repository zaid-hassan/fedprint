import { Lexer, type Token, type Tokens } from "marked";

export const MAX_DIAGRAMS = 20;

const MAX_IMAGE_CHARS = 2_000_000;
const MERMAID_LANG = "mermaid";
const PNG_DATA_URL = "image/png";

type MermaidApi = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidApi> | undefined;

/** Loads and configures mermaid on first use so it stays out of the main bundle. */
async function getMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      } as Parameters<MermaidApi["initialize"]>[0]);
      return mermaid;
    });
  }
  return mermaidPromise;
}

function randomId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Mermaid code blocks in the same order the PDF renderer consumes them. */
export function collectMermaidBlocks(markdown: string): string[] {
  const tokens = Lexer.lex(markdown, { gfm: true });
  const blocks: string[] = [];

  const visit = (list: Token[]): void => {
    for (const token of list) {
      if (token.type === "code") {
        const code = token as Tokens.Code;
        if ((code.lang ?? "").trim().toLowerCase().startsWith(MERMAID_LANG)) blocks.push(code.text);
      } else if (token.type === "blockquote") {
        visit((token as Tokens.Blockquote).tokens);
      }
    }
  };

  visit(tokens);
  return blocks;
}

function normalizeSvg(svg: string): { markup: string; width: number; height: number } {
  const viewBox = /viewBox="([^"]+)"/i.exec(svg);
  let width = 800;
  let height = 600;
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      width = parts[2] as number;
      height = parts[3] as number;
    }
  }

  const openingTag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!openingTag) return { markup: svg, width, height };

  let tag = openingTag;
  tag = /\bwidth=/.test(tag) ? tag.replace(/\bwidth="[^"]*"/, `width="${width}"`) : tag.replace("<svg", `<svg width="${width}"`);
  tag = /\bheight=/.test(tag) ? tag.replace(/\bheight="[^"]*"/, `height="${height}"`) : tag.replace("<svg", `<svg height="${height}"`);
  tag = tag.replace(/\sstyle="[^"]*"/i, "");
  if (!/xmlns=/.test(tag)) tag = tag.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

  return { markup: svg.replace(openingTag, tag), width, height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize diagram"));
    image.src = url;
  });
}

async function rasterize(svg: string, scale: number): Promise<string> {
  const { markup, width, height } = normalizeSvg(svg);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(PNG_DATA_URL);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Renders one mermaid source to a PNG data URL, or null on failure. */
export async function renderMermaidToPng(source: string, scale = 2): Promise<string | null> {
  const mermaid = await getMermaid();
  const id = randomId("fedprintMmd");
  try {
    const { svg } = await mermaid.render(id, source);
    let dataUrl = await rasterize(svg, scale);
    if (dataUrl.length > MAX_IMAGE_CHARS && scale > 1) {
      dataUrl = await rasterize(svg, 1);
    }
    return dataUrl.length > MAX_IMAGE_CHARS ? null : dataUrl;
  } catch {
    return null;
  } finally {
    document.getElementById(`d${id}`)?.remove();
  }
}

/** Rasterizes every diagram in the document, aligned with the PDF renderer. */
export async function renderMermaidDiagramsToPng(markdown: string): Promise<Array<string | null>> {
  const blocks = collectMermaidBlocks(markdown).slice(0, MAX_DIAGRAMS);
  const results: Array<string | null> = [];
  for (const block of blocks) {
    results.push(await renderMermaidToPng(block));
  }
  return results;
}

/** Renders every `.mermaid` placeholder inside a container (used by the preview). */
export async function renderMermaidInElement(container: HTMLElement): Promise<void> {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(".mermaid:not([data-processed])"));
  if (nodes.length === 0) return;

  const mermaid = await getMermaid();
  for (const node of nodes) {
    const source = node.textContent ?? "";
    const id = randomId("fedprintPrev");
    try {
      const { svg } = await mermaid.render(id, source);
      node.innerHTML = svg;
      node.dataset.processed = "true";
    } catch {
      node.classList.add("mermaid--error");
      node.textContent = "This diagram could not be rendered.";
    } finally {
      document.getElementById(`d${id}`)?.remove();
    }
  }
}
