import type { Board } from "./board";
import type { Item } from "./types";

// Draws a tier list as a PNG, for "Share as image". Nothing is sent anywhere: the picture is
// made in the browser from the board that is on screen.

const INK = "#15171e";
const PAPER = "#eef0f5";
const FONT = '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const WIDTH = 1000;
const PAD = 24;
const LABEL_W = 120;
const TILE = 96;
const GAP = 8;
const GAP_LINE = 3;
const SCALE = 2; // draw at 2x so the picture stays sharp on phones

// Item pictures come from other sites. A site that doesn't allow its pictures to be drawn on a
// canvas would "taint" it and make saving impossible, so a picture that can't be loaded safely
// is replaced by the item's name instead of failing the whole image.
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Splits text into lines that fit `maxWidth`, at most `maxLines`, ending with "…" if cut
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth || !line) {
      line = attempt;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  const cut = lines.slice(0, maxLines);
  if (lines.length > maxLines) cut[maxLines - 1] = `${cut[maxLines - 1].replace(/\s*\S*$/, "")}…`;
  // A single long word can still be wider than the tile
  return cut.map((l) => {
    let out = l;
    while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = `${out.slice(0, -2)}…`;
    return out;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderBoardImage(title: string, board: Board, items: Item[]): Promise<Blob> {
  const byId = new Map(items.map((item) => [item._id, item]));
  const placed = board.tiers.flatMap((tier) => tier.itemIds).map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));

  const pictures = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    placed.filter((i) => i.imageUrl).map(async (i) => pictures.set(i._id, await loadImage(i.imageUrl as string)))
  );

  const perRow = Math.floor((WIDTH - PAD * 2 - LABEL_W - GAP) / (TILE + GAP));
  const rowHeights = board.tiers.map((tier) => {
    const rows = Math.max(1, Math.ceil(tier.itemIds.length / perRow));
    return rows * (TILE + GAP) + GAP;
  });
  const titleH = 64;
  const footerH = 36;
  const height = PAD + titleH + rowHeights.reduce((a, b) => a + b + GAP_LINE, 0) + footerH + PAD / 2;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't make images.");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, height);

  // Title
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.font = `800 32px ${FONT}`;
  ctx.textAlign = "left";
  const [titleLine] = wrap(ctx, title, WIDTH - PAD * 2, 1);
  ctx.fillText(titleLine ?? "Tier list", PAD, PAD + titleH / 2 - 4);

  // Tiers: a dark frame with a colored label box and the tier's items
  let y = PAD + titleH;
  board.tiers.forEach((tier, index) => {
    const h = rowHeights[index];
    ctx.fillStyle = INK;
    ctx.fillRect(PAD - 2, y - 1, WIDTH - PAD * 2 + 4, h + 2);

    ctx.fillStyle = tier.color;
    ctx.fillRect(PAD, y, LABEL_W, h);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    let size = 34;
    do {
      ctx.font = `800 ${size}px ${FONT}`;
      size -= 2;
    } while (ctx.measureText(tier.label).width > LABEL_W - 16 && size > 12);
    ctx.fillText(tier.label, PAD + LABEL_W / 2, y + h / 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(PAD + LABEL_W, y, WIDTH - PAD * 2 - LABEL_W, h);

    tier.itemIds.forEach((id, n) => {
      const item = byId.get(id);
      if (!item) return;
      const x = PAD + LABEL_W + GAP + (n % perRow) * (TILE + GAP);
      const top = y + GAP + Math.floor(n / perRow) * (TILE + GAP);
      const picture = pictures.get(id);

      ctx.save();
      roundRect(ctx, x, top, TILE, TILE, 8);
      ctx.clip();
      if (picture) {
        // Fill the square, cropping the edges like CSS object-fit: cover
        const scale = Math.max(TILE / picture.width, TILE / picture.height);
        const w = picture.width * scale;
        const hh = picture.height * scale;
        ctx.drawImage(picture, x + (TILE - w) / 2, top + (TILE - hh) / 2, w, hh);
        ctx.fillStyle = "rgba(21,23,30,0.72)";
        ctx.fillRect(x, top + TILE - 26, TILE, 26);
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 12px ${FONT}`;
        ctx.textAlign = "center";
        const [line] = wrap(ctx, item.name, TILE - 10, 1);
        ctx.fillText(line, x + TILE / 2, top + TILE - 13);
      } else {
        ctx.fillStyle = PAPER;
        ctx.fillRect(x, top, TILE, TILE);
        ctx.fillStyle = INK;
        ctx.font = `700 14px ${FONT}`;
        ctx.textAlign = "center";
        const lines = wrap(ctx, item.name, TILE - 14, 4);
        lines.forEach((line, i) => ctx.fillText(line, x + TILE / 2, top + TILE / 2 + (i - (lines.length - 1) / 2) * 18));
      }
      ctx.restore();
      ctx.strokeStyle = "#dcdfe8";
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, top + 0.5, TILE - 1, TILE - 1, 8);
      ctx.stroke();
    });

    y += h + GAP_LINE;
  });

  // Footer
  ctx.fillStyle = "#5a5f70";
  ctx.font = `600 14px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(`Made on ${window.location.host}`, PAD, height - footerH / 2 - 4);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the image."))), "image/png");
  });
}

export function imageFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `${slug || "tier-list"}.png`;
}
