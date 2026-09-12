import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyPalette, DEFAULT_PALETTE, type ColorPalette } from "@/lib/palette";

const STORAGE_KEY = "converge.palette.v1";

function loadLocal(): ColorPalette {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PALETTE;
    const p = JSON.parse(raw) as Partial<ColorPalette>;
    return { ...DEFAULT_PALETTE, ...p };
  } catch {
    return DEFAULT_PALETTE;
  }
}

function saveLocal(p: ColorPalette) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable — paleta segue apenas no estado
  }
}

/** Lê a paleta de cores persistida (system_settings -> color_palette). */
export function useColorPaletteQuery() {
  return useQuery({
    queryKey: ["color-palette"],
    queryFn: async (): Promise<ColorPalette | null> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "color_palette")
        .maybeSingle();
      if (error) throw error;
      if (data && typeof data.value === "object" && data.value !== null) {
        return { ...DEFAULT_PALETTE, ...(data.value as Partial<ColorPalette>) };
      }
      return null;
    },
    staleTime: 60_000,
  });
}

/**
 * Hook global: aplica a paleta persistida nas variáveis CSS assim que carrega.
 * Também expõe `savePalette` (admin) para gravar a nova paleta no banco.
 */
export function usePalette() {
  const qc = useQueryClient();
  const query = useColorPaletteQuery();

  useEffect(() => {
    // Aplica imediatamente a paleta local (rápido), depois a do banco se houver.
    applyPalette(loadLocal());
    if (query.data) {
      applyPalette(query.data);
      saveLocal(query.data);
    }
  }, [query.data]);

  const savePalette = useMutation({
    mutationFn: async (p: ColorPalette) => {
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key: "color_palette", value: p }, { onConflict: "key" });
      if (error) throw error;
      saveLocal(p);
    },
    onSuccess: (_, p) => {
      applyPalette(p);
      qc.invalidateQueries({ queryKey: ["color-palette"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  return { query, savePalette };
}
