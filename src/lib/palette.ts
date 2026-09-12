/** Paleta de cores persistida (system_settings -> chave "color_palette"). */
export interface ColorPalette {
  /** Cor principal (botões, links, destaques) — ex.: "#CE1E29" */
  primary: string;
  /** Acento azul (sidebar/cabeçalhos) — ex.: "#182332" */
  accent: string;
  /** Verde de sucesso — ex.: "#44CE55" */
  success: string;
  /** Amarelo de alerta — ex.: "#E1C333" */
  warning: string;
  /** Vermelho escuro de perigo/estorno — ex.: "#A22E2E" */
  danger: string;
}

export const DEFAULT_PALETTE: ColorPalette = {
  primary: "#CE1E29",
  accent: "#182332",
  success: "#44CE55",
  warning: "#E1C333",
  danger: "#A22E2E",
};

/** Presets para escolha rápida no painel administrativo. */
export const PALETTE_PRESETS: { name: string; palette: ColorPalette }[] = [
  {
    name: "N&L padrão (vermelho + azul marinho)",
    palette: DEFAULT_PALETTE,
  },
  {
    name: "N&L claro (vermelho + azul médio)",
    palette: {
      primary: "#D31A27",
      accent: "#2B5A8C",
      success: "#44CE55",
      warning: "#E1C333",
      danger: "#A22E2E",
    },
  },
  {
    name: "Azul corporativo",
    palette: {
      primary: "#0F245B",
      accent: "#0F245B",
      success: "#16a34a",
      warning: "#f59e0b",
      danger: "#dc2626",
    },
  },
];

/** Converte hex (#RRGGBB) para a string HSL usada nos tokens CSS. */
export function hexToHsl(hex: string): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return "0 0% 0%";
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  const d = max - min;
  if (d !== 0) {
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        hue = ((b - r) / d + 2) * 60;
        break;
      default:
        hue = ((r - g) / d + 4) * 60;
    }
  }
  const H = Math.round(hue);
  const S = Math.round(sat * 100);
  const L = Math.round(l * 100);
  return `${H} ${S}% ${L}%`;
}

/** Aplica a paleta nas variáveis CSS do documento (runtime). */
export function applyPalette(palette: ColorPalette): void {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  root.style.setProperty("--primary", hexToHsl(palette.primary));
  root.style.setProperty("--ring", hexToHsl(palette.primary));
  // Sidebar usa o azul de acento (fundo escuro).
  root.style.setProperty(
    "--sidebar-background",
    isDark ? hexToHsl(palette.accent) : hexToHsl(palette.accent),
  );
  root.style.setProperty("--sidebar-primary", hexToHsl(palette.primary));
  root.style.setProperty("--sidebar-ring", hexToHsl(palette.primary));
  // Acento claro para hover usa uma versão suavizada do azul (modo claro);
  // no escuro mantém o tom neutro escuro.
  root.style.setProperty(
    "--accent",
    isDark ? "217.2 32.6% 17.5%" : hexToHsl(lighten(palette.accent, 0.88)),
  );
  root.style.setProperty(
    "--accent-foreground",
    isDark ? "210 40% 98%" : "223 47.4% 11.2%",
  );
  root.style.setProperty("--success", hexToHsl(palette.success));
  root.style.setProperty("--warning", hexToHsl(palette.warning));
  root.style.setProperty("--danger", hexToHsl(palette.danger));
  root.style.setProperty("--destructive", hexToHsl(palette.danger));
}

/** Mistura um hex com branco (amount 0..1) — para hovers claros. */
export function lighten(hex: string, amount: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return "#ffffff";
  const mix = (c: number) =>
    Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix((num >> 16) & 255)}${mix((num >> 8) & 255)}${mix(num & 255)}`;
}
