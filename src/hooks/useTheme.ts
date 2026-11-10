import { useCallback, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "arc-theme";

const THEME_COLORS: Record<Theme, string> = {
  dark: "#05080f",
  light: "#f2f6fc"
};

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light"
    ? "light"
    : "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  if (theme === "light") {
    root.dataset.theme = "light";
  } else {
    delete root.dataset.theme;
  }

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sem acesso ao armazenamento: o tema vale só até fechar a aba
  }
}

/**
 * Tema claro/escuro do sistema. O claro é o padrão; a escolha fica salva
 * neste navegador. O tema salvo é aplicado no index.html, antes do React.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggleTheme = useCallback(() => {
    const next: Theme = readTheme() === "light" ? "dark" : "light";

    applyTheme(next);
    setTheme(next);
  }, []);

  return { theme, toggleTheme };
}
