/**
 * Exporta um gráfico (SVG do recharts) como PNG com título, subtítulo e legenda,
 * pronto para envio em canais externos (WhatsApp, e-mail, etc.).
 *
 * O SVG renderizado não inclui o título/legenda (o recharts desenha a legenda em
 * HTML). Por isso compomos o PNG manualmente em um canvas: fundo branco,
 * título, subtítulo, o gráfico e a legenda.
 */
import { toPng } from "html-to-image";

function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** "hsl(240 3.7% 15.9%)" → "hsl(240, 3.7%, 15.9%)" (sintaxe aceita por todos os navegadores). */
function convertHslSpace(value: string): string {
  if (!value.startsWith("hsl(") || value.includes(",")) return value;
  const inner = value.slice(4, -1).trim();
  if (inner.includes("/")) return value;
  const parts = inner.split(/\s+/).filter(Boolean);
  return parts.length === 3 ? `hsl(${parts.join(", ")})` : value;
}

export interface ChartExportOptions {
  filename: string;
  title: string;
  sub?: string;
  legend?: { name: string; color: string }[];
}

export function downloadChartPng(
  container: HTMLElement | null,
  options: ChartExportOptions,
): void {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;

  // Clona para não mutar a árvore viva e resolve variáveis CSS
  // (hsl(var(--border)) etc.) para valores concretos — o SVG exportado não
  // herda o CSS da página.
  const clone = svg.cloneNode(true) as SVGElement;
  const fixElement = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes("var(")) {
        const resolved = attr.value.replace(
          /var\((--[a-z0-9-]+)\)/gi,
          (_m, name: string) => resolveVar(name),
        );
        el.setAttribute(attr.name, convertHslSpace(resolved));
      }
    }
    for (const child of Array.from(el.children)) fixElement(child);
  };
  fixElement(clone);
  clone.setAttribute(
    "style",
    `font-family: ${getComputedStyle(document.body).fontFamily};`,
  );

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );

  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const chartW = svg.clientWidth || 900;
    const chartH = svg.clientHeight || 300;

    const pad = 24;
    const legend = options.legend ?? [];
    const titleH = 24;
    const subH = options.sub ? 18 : 0;
    const legendH = legend.length > 0 ? 30 : 0;
    const W = chartW + pad * 2;
    const H = pad + titleH + subH + chartH + legendH + pad;

    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    let y = pad;
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "700 17px Inter, system-ui, sans-serif";
    ctx.fillText(options.title, pad, y + 16);
    y += titleH;

    if (options.sub) {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillText(options.sub, pad, y + 14);
      y += subH;
    }

    ctx.drawImage(img, pad, y, chartW, chartH);
    y += chartH;

    if (legend.length > 0) {
      ctx.fillStyle = "#334155";
      ctx.font = "12px Inter, system-ui, sans-serif";
      let x = pad;
      let rowY = y + 20;
      for (const item of legend) {
        const w = ctx.measureText(item.name).width + 34;
        if (x + w > W - pad) {
          x = pad;
          rowY += 22;
        }
        ctx.fillStyle = item.color;
        ctx.fillRect(x, rowY - 11, 13, 13);
        ctx.fillStyle = "#334155";
        ctx.fillText(item.name, x + 19, rowY);
        x += w;
      }
    }

    URL.revokeObjectURL(url);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = options.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/**
 * Exporta o dashboard inteiro (título, filtros, cards e gráficos) como um único
 * PNG. Elementos com o atributo `data-export-hide` (ex.: botões de download)
 * ficam de fora da imagem.
 */
export async function downloadDashboardPng(
  node: HTMLElement | null,
  filename: string,
): Promise<void> {
  if (!node) return;
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    filter: (el) =>
      !(el instanceof HTMLElement && el.hasAttribute("data-export-hide")),
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
