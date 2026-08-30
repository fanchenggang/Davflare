import { createTheme, Theme } from "@mui/material/styles";

export const ORANGE = "#f38020";

// 全局层叠顺序（替代散落的魔法数字）：文件卡片内浮层 < 底部导航 < 多选工具栏 < 全屏拖拽遮罩
export const Z_INDEX = {
  cardOverlay: 3,
  listHeader: 1,
  mobileNav: 90,
  multiSelectToolbar: 100,
  dragOverlay: 1400,
  previewPager: 2,
} as const;

export type ThemeMode = "light" | "dark";

/**
 * 暖色调阴影：亮色模式用暖黑低 alpha（与纸面协调，沿用既有视觉）；
 * 暗色模式下暖黑在深底上不可见，改用纯黑并按比例加深补偿。
 * geometry 为阴影的长度部分，如 "0 6px 16px"（底部工具栏可为负 y）。
 */
export function warmShadow(
  dark: boolean,
  geometry: string,
  alpha: number
): string {
  const color = dark
    ? `rgba(0, 0, 0, ${Math.min(0.6, alpha * 3)})`
    : `rgba(26, 23, 20, ${alpha})`;
  return `${geometry} ${color}`;
}

declare module "@mui/material/styles" {
  interface Palette {
    surface: {
      /** 代码/文本预览内嵌面板背景 */
      code: string;
      /** 代码面板行号栏背景 */
      codeGutter: string;
      /** 代码面板文字颜色 */
      codeText: string;
      /** 全屏遮罩的半透明底色 */
      overlay: string;
    };
  }
  interface PaletteOptions {
    surface?: {
      code?: string;
      codeGutter?: string;
      codeText?: string;
      overlay?: string;
    };
  }
}

const palettes: Record<
  ThemeMode,
  {
    backgroundDefault: string;
    backgroundPaper: string;
    divider: string;
    textPrimary: string;
    textSecondary: string;
    textCaption: string;
    hover: string;
    selected: string;
    focusRing: string;
    secondary: string;
    linkColor: string;
    code: string;
    codeGutter: string;
    codeText: string;
    overlay: string;
  }
> = {
  light: {
    backgroundDefault: "#f4f1ec",
    backgroundPaper: "#ffffff",
    divider: "rgba(28, 22, 16, 0.08)",
    textPrimary: "#1a1714",
    textSecondary: "rgba(26, 23, 20, 0.64)",
    textCaption: "rgba(26, 23, 20, 0.62)",
    hover: "rgba(243, 128, 32, 0.06)",
    selected: "rgba(243, 128, 32, 0.12)",
    focusRing: "rgba(243, 128, 32, 0.16)",
    secondary: "#8a5a2b",
    linkColor: "#c45f10",
    code: "#f7f5f1",
    codeGutter: "#f0ece6",
    codeText: "#1f2328",
    overlay: "rgba(244, 241, 236, 0.88)",
  },
  dark: {
    backgroundDefault: "#171310",
    backgroundPaper: "#211c17",
    divider: "rgba(255, 255, 255, 0.09)",
    textPrimary: "#f1ece5",
    textSecondary: "rgba(241, 236, 229, 0.66)",
    textCaption: "rgba(241, 236, 229, 0.6)",
    hover: "rgba(243, 128, 32, 0.12)",
    selected: "rgba(243, 128, 32, 0.22)",
    focusRing: "rgba(243, 128, 32, 0.28)",
    secondary: "#c99b6a",
    linkColor: "#ff9a45",
    code: "#1c1814",
    codeGutter: "#15110e",
    codeText: "#e4ded6",
    overlay: "rgba(23, 19, 16, 0.82)",
  },
};

export function createAppTheme(mode: ThemeMode = "light"): Theme {
  const p = palettes[mode];
  return createTheme({
    palette: {
      mode,
      primary: {
        main: ORANGE,
        dark: "#d96e12",
        light: "#ff9a45",
        contrastText: "#ffffff",
      },
      secondary: { main: p.secondary },
      success: { main: "#2e7d4f" },
      error: { main: "#c4472c" },
      warning: { main: "#c47b1a" },
      info: { main: "#3d6b99" },
      background: {
        default: p.backgroundDefault,
        paper: p.backgroundPaper,
      },
      divider: p.divider,
      text: {
        primary: p.textPrimary,
        secondary: p.textSecondary,
      },
      action: {
        hover: p.hover,
        selected: p.selected,
        focus: p.focusRing,
      },
      surface: {
        code: p.code,
        codeGutter: p.codeGutter,
        codeText: p.codeText,
        overlay: p.overlay,
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: [
        '"Noto Sans SC"',
        '"PingFang SC"',
        '"Hiragino Sans GB"',
        '"Microsoft YaHei"',
        "system-ui",
        "-apple-system",
        "Segoe UI",
        "sans-serif",
      ].join(","),
      h6: {
        fontWeight: 700,
        letterSpacing: "-0.02em",
        fontSize: "1.125rem",
      },
      subtitle1: { fontWeight: 600, fontSize: "1rem" },
      subtitle2: { fontWeight: 600, fontSize: "0.875rem" },
      body2: { lineHeight: 1.5 },
      caption: {
        fontSize: "0.75rem",
        lineHeight: 1.4,
        color: p.textCaption,
      },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": { colorScheme: mode },
          "html, body, #root": { height: "100%" },
          body: {
            backgroundColor: p.backgroundDefault,
            color: p.textPrimary,
          },
          "::selection": {
            backgroundColor: "rgba(243, 128, 32, 0.28)",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            padding: "5px 12px",
            borderRadius: 8,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: 12 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16 },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600 },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: { color: p.linkColor },
        },
      },
    },
  });
}

export const appTheme = createAppTheme();
