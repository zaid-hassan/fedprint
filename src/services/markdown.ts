import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { Lexer, type Token, type Tokens } from "marked";
import PDFDocument from "pdfkit";
import { createTempPath, ensureUploadDir, removeFile } from "./file-manager.js";
import type { SupportedPageSize } from "../validation/print-options.js";

type PdfDoc = PDFKit.PDFDocument;

const PDF_SIZES: Record<SupportedPageSize, string> = { A4: "A4", A5: "A5", Letter: "LETTER" };
const MARGIN = 56;
const BODY_SIZE = 11;
const INK = "#111827";
const MUTED = "#6b7280";
const CODE_BG = "#f3f4f6";
const RULE = "#d1d5db";
const LINK = "#1d4ed8";

interface InlineStyle {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link?: string;
}

interface Run {
  text: string;
  style: InlineStyle;
}

interface InlineLayout {
  x?: number;
  width?: number;
  color?: string;
}

function fontFor(style: InlineStyle): string {
  if (style.code) return "Courier";
  if (style.bold && style.italic) return "Helvetica-BoldOblique";
  if (style.bold) return "Helvetica-Bold";
  if (style.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function flattenInline(tokens: Token[] | undefined, style: InlineStyle, runs: Run[]): void {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
        flattenInline((token as Tokens.Strong).tokens, { ...style, bold: true }, runs);
        break;
      case "em":
        flattenInline((token as Tokens.Em).tokens, { ...style, italic: true }, runs);
        break;
      case "del":
        flattenInline((token as Tokens.Del).tokens, style, runs);
        break;
      case "link":
        flattenInline((token as Tokens.Link).tokens, { ...style, link: (token as Tokens.Link).href }, runs);
        break;
      case "codespan":
        runs.push({ text: (token as Tokens.Codespan).text, style: { ...style, code: true } });
        break;
      case "br":
        runs.push({ text: "\n", style });
        break;
      case "text": {
        const text = token as Tokens.Text;
        if (text.tokens && text.tokens.length > 0) flattenInline(text.tokens, style, runs);
        else runs.push({ text: text.text, style });
        break;
      }
      case "escape":
      case "html":
        runs.push({ text: (token as Tokens.Escape).text, style });
        break;
      default: {
        const fallback = token as { text?: string };
        if (typeof fallback.text === "string") runs.push({ text: fallback.text, style });
      }
    }
  }
}

function plainText(tokens: Token[] | undefined): string {
  const runs: Run[] = [];
  flattenInline(tokens, { bold: false, italic: false, code: false }, runs);
  return runs
    .map((run) => run.text)
    .join("")
    .trim();
}

function renderInline(doc: PdfDoc, tokens: Token[] | undefined, style: InlineStyle, layout: InlineLayout = {}): void {
  const runs: Run[] = [];
  flattenInline(tokens, style, runs);

  if (runs.map((run) => run.text).join("").trim().length === 0) {
    return;
  }

  runs.forEach((run, index) => {
    const options: PDFKit.Mixins.TextOptions = { continued: index < runs.length - 1 };
    if (layout.width !== undefined) options.width = layout.width;
    if (run.style.link) {
      options.link = run.style.link;
      options.underline = true;
    }

    doc.font(fontFor(run.style));
    doc.fillColor(layout.color ?? (run.style.link ? LINK : run.style.code ? "#0f172a" : INK));

    if (index === 0 && layout.x !== undefined) {
      doc.text(run.text, layout.x, doc.y, options);
    } else {
      doc.text(run.text, options);
    }
  });
}

function renderList(doc: PdfDoc, list: Tokens.List, depth = 0): void {
  const contentWidth = doc.page.width - MARGIN * 2;
  const indent = MARGIN + depth * 18;
  const markerWidth = list.ordered ? 26 : 16;
  const start = typeof list.start === "number" ? list.start : 1;

  list.items.forEach((item, index) => {
    const marker = list.ordered ? `${start + index}.` : "•";
    const y = doc.y;
    const contentX = indent + markerWidth;
    const itemTokens = item.tokens.filter((token) => token.type !== "list");
    const nested = item.tokens.filter((token) => token.type === "list") as Tokens.List[];

    doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK);
    renderInline(
      doc,
      itemTokens,
      { bold: false, italic: false, code: false },
      { x: contentX, width: contentWidth - markerWidth },
    );

    const afterY = doc.y;
    doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK);
    doc.text(marker, indent, y, { lineBreak: false });
    doc.y = afterY;

    for (const sub of nested) {
      doc.moveDown(0.1);
      renderList(doc, sub, depth + 1);
    }
    doc.moveDown(0.15);
  });

  doc.moveDown(0.3);
}

function isMermaidLang(lang: string | undefined): boolean {
  return (lang ?? "").trim().toLowerCase().startsWith("mermaid");
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPngSize(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length < 24) return undefined;
  if (!PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) return undefined;
  if (buffer.toString("latin1", 12, 16) !== "IHDR") return undefined;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) return undefined;
  return { width, height };
}

/** Places a pre-rasterized diagram, scaled to fit the page and centred. */
function renderDiagram(doc: PdfDoc, buffer: Buffer): void {
  const size = readPngSize(buffer);
  if (!size) throw new Error("Unsupported diagram image");

  const contentWidth = doc.page.width - MARGIN * 2;
  const contentHeight = doc.page.height - MARGIN * 2;
  const scale = Math.min(contentWidth / size.width, contentHeight / size.height);
  const width = size.width * scale;
  const height = size.height * scale;

  if (doc.y + height > doc.page.height - MARGIN) doc.addPage();

  const y = doc.y;
  doc.image(buffer, MARGIN + (contentWidth - width) / 2, y, { width, height });
  doc.y = y + height + 10;
}

function renderCode(doc: PdfDoc, token: Tokens.Code): void {
  const contentWidth = doc.page.width - MARGIN * 2;
  const text = token.text ?? "";
  doc.font("Courier").fontSize(9);
  const height = doc.heightOfString(text, { width: contentWidth - 16 }) + 12;

  if (doc.y + height > doc.page.height - MARGIN) doc.addPage();

  const y = doc.y;
  doc.save();
  doc.roundedRect(MARGIN, y, contentWidth, height, 4).fill(CODE_BG);
  doc.restore();
  doc.fillColor("#0f172a").text(text, MARGIN + 8, y + 6, { width: contentWidth - 16 });
  doc.y = Math.max(doc.y, y + height) + 6;
  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK);
}

function renderBlockquote(doc: PdfDoc, token: Tokens.Blockquote, diagrams: Array<Buffer | null>): void {
  const contentWidth = doc.page.width - MARGIN * 2;
  const startY = doc.y;

  for (const child of token.tokens) {
    if (child.type === "paragraph" || child.type === "text") {
      const inline = (child as Tokens.Paragraph | Tokens.Text).tokens ?? [child];
      doc.font("Helvetica-Oblique").fontSize(BODY_SIZE);
      renderInline(doc, inline, { bold: false, italic: true, code: false }, { x: MARGIN + 16, width: contentWidth - 16, color: MUTED });
      doc.moveDown(0.35);
    } else {
      renderBlocks(doc, [child], diagrams);
    }
  }

  const endY = doc.y;
  if (endY > startY + 4) {
    doc.save();
    doc.rect(MARGIN + 4, startY, 3, endY - startY - 4).fill(RULE);
    doc.restore();
  }
  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK);
  doc.x = MARGIN;
  doc.moveDown(0.4);
}

function renderTable(doc: PdfDoc, table: Tokens.Table): void {
  const contentWidth = doc.page.width - MARGIN * 2;
  const columns = table.header.length || 1;
  const columnWidth = contentWidth / columns;
  const rows = [table.header, ...table.rows];

  rows.forEach((row, rowIndex) => {
    const y = doc.y;
    let maxY = y;
    row.forEach((cell, columnIndex) => {
      doc.font(rowIndex === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(INK);
      doc.text(plainText(cell.tokens), MARGIN + columnIndex * columnWidth, y, { width: columnWidth - 6 });
      maxY = Math.max(maxY, doc.y);
    });
    doc.y = maxY + 4;
  });

  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK).moveDown(0.4);
}

function renderHr(doc: PdfDoc): void {
  doc.moveDown(0.4);
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).strokeColor(RULE).lineWidth(1).stroke();
  doc.moveDown(0.6);
}

const HEADING_SIZES: Record<number, number> = { 1: 22, 2: 18, 3: 15, 4: 13, 5: 12, 6: 12 };

function renderBlocks(doc: PdfDoc, tokens: Token[], diagrams: Array<Buffer | null>): void {
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        if (doc.y > MARGIN + 8) doc.moveDown(heading.depth <= 2 ? 0.6 : 0.4);
        const size = HEADING_SIZES[heading.depth] ?? 12;
        doc.font("Helvetica-Bold").fillColor(INK).fontSize(size);
        renderInline(doc, heading.tokens, { bold: true, italic: false, code: false });
        doc.font("Helvetica").fontSize(BODY_SIZE);
        doc.moveDown(0.35);
        break;
      }
      case "paragraph": {
        doc.font("Helvetica").fillColor(INK).fontSize(BODY_SIZE);
        renderInline(doc, (token as Tokens.Paragraph).tokens, { bold: false, italic: false, code: false });
        doc.moveDown(0.6);
        break;
      }
      case "text": {
        const text = token as Tokens.Text;
        doc.font("Helvetica").fillColor(INK).fontSize(BODY_SIZE);
        renderInline(doc, text.tokens ?? [text], { bold: false, italic: false, code: false });
        doc.moveDown(0.6);
        break;
      }
      case "list":
        renderList(doc, token as Tokens.List);
        break;
      case "code": {
        const code = token as Tokens.Code;
        if (isMermaidLang(code.lang)) {
          const diagram = diagrams.shift() ?? null;
          if (diagram) {
            try {
              renderDiagram(doc, diagram);
              break;
            } catch {
              // Fall back to printing the source if the image can't be embedded.
            }
          }
        }
        renderCode(doc, code);
        break;
      }
      case "blockquote":
        renderBlockquote(doc, token as Tokens.Blockquote, diagrams);
        break;
      case "table":
        renderTable(doc, token as Tokens.Table);
        break;
      case "hr":
        renderHr(doc);
        break;
      case "space":
        break;
      default:
        break;
    }
  }
}

/** Derives a job/document name from the first non-empty markdown line. */
export function deriveDocumentName(markdown: string, fallback = "document.pdf"): string {
  const line = markdown
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  if (!line) return fallback;

  const cleaned = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;
  return `${cleaned.slice(0, 80).trim()}.pdf`;
}

/**
 * Renders markdown to a temporary PDF file and returns its path. `diagrams`
 * holds pre-rasterized PNG images for mermaid code blocks, in document order;
 * a null entry falls back to printing the block as code.
 */
export async function renderMarkdownToPdf(
  markdown: string,
  pageSize: SupportedPageSize,
  diagrams: Array<Buffer | null> = [],
): Promise<string> {
  ensureUploadDir();
  const filePath = createTempPath(".pdf");
  const doc = new PDFDocument({
    size: PDF_SIZES[pageSize],
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: deriveDocumentName(markdown, "document"), Producer: "FedPrint" },
  });

  const stream = createWriteStream(filePath);
  const completion = finished(stream);
  doc.pipe(stream);

  try {
    const tokens = Lexer.lex(markdown, { gfm: true });
    doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK);
    renderBlocks(doc, [...tokens], diagrams);
  } catch (error) {
    doc.end();
    await completion.catch(() => undefined);
    await removeFile(filePath).catch(() => undefined);
    throw error;
  }

  doc.end();
  await completion;
  return filePath;
}
