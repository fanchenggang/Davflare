import { createTheme, Theme } from "@mui/material/styles";

export const ORANGE = "#f38020";

export function createAppTheme(): Theme {
  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: ORANGE,
        dark: "#d96e12",
        light: "#ff9a45",
        contrastText: "#ffffff",
      },
      secondary: { main: "#8a5a2b" },
      success: { main: "#2e7d4f" },
      error: { main: "#c4472c" },
      warning: { main: "#c47b1a" },
      info: { main: "#3d6b99" },
      background: {
        default: "#f4f1ec",
        paper: "#ffffff",
      },
      divider: "rgba(28, 22, 16, 0.08)",
      text: {
        primary: "#1a1714",
        secondary: "rgba(26, 23, 20, 0.64)",
      },
      action: {
        hover: "rgba(243, 128, 32, 0.06)",
        selected: "rgba(243, 128, 32, 0.12)",
        focus: "rgba(243, 128, 32, 0.16)",
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
        color: "rgba(26, 23, 20, 0.62)",
      },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": { colorScheme: "light" },
          "html, body, #root": { height: "100%" },
          body: {
            backgroundColor: "#f4f1ec",
            color: "#1a1714",
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
          root: { color: "#c45f10" },
        },
      },
    },
  });
}

export const appTheme = createAppTheme();
