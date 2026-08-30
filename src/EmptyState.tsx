import React from "react";
import { Box, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import { warmShadow } from "./app/theme";

const floatY = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;

const floatYSoft = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;

const noMotion = {
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
};

// 场景变体：空目录 / 无搜索结果 / 回收站空 / 无分享。
// 每个场景用不同的圆底色调、卡片倾角与圆点排布区分构图，颜色均可在亮暗主题下保持柔和。
export type EmptyVariant = "folder" | "search" | "trash" | "shares";

interface VariantStyle {
  circleColor: string;
  backCardRotate: number;
  iconCardRotate: number;
  /** 图标卡相对圆底的横向偏移（正数右移） */
  iconCardShift: number;
  dots: "default" | "sparse";
}

const VARIANTS: Record<EmptyVariant, VariantStyle> = {
  folder: {
    circleColor: "rgba(243, 128, 32, 0.10)",
    backCardRotate: -8,
    iconCardRotate: 0,
    iconCardShift: 0,
    dots: "default",
  },
  search: {
    circleColor: "rgba(61, 107, 153, 0.10)",
    backCardRotate: 8,
    iconCardRotate: 8,
    iconCardShift: -6,
    dots: "sparse",
  },
  trash: {
    circleColor: "rgba(196, 71, 44, 0.08)",
    backCardRotate: 10,
    iconCardRotate: -6,
    iconCardShift: 4,
    dots: "sparse",
  },
  shares: {
    circleColor: "rgba(46, 125, 79, 0.09)",
    backCardRotate: -10,
    iconCardRotate: 5,
    iconCardShift: 0,
    dots: "default",
  },
};

// 分层浮动画风的空状态插画：色调圆底 + 倾斜底卡 + 悬浮图标卡 + 圆点点缀，
// 颜色全部走主题 token（亮暗自适应），动效尊重系统减弱动态偏好。
function EmptyState({
  icon,
  title,
  description,
  actions,
  variant = "folder",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  variant?: EmptyVariant;
}) {
  const v = VARIANTS[variant];
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 1.25,
        px: 3,
        py: 8,
        minHeight: 280,
        flexGrow: 1,
      }}
    >
      <Box sx={{ position: "relative", width: 124, height: 100, mb: 0.5 }}>
        <Box
          sx={{
            position: "absolute",
            left: 18,
            top: 16,
            width: 88,
            height: 88,
            borderRadius: "50%",
            backgroundColor: v.circleColor,
            animation: `${floatYSoft} 4.5s ease-in-out infinite`,
            ...noMotion,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: 16,
            top: 38,
            width: 64,
            height: 44,
            borderRadius: 2,
            backgroundColor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            transform: `rotate(${v.backCardRotate}deg)`,
            boxShadow: (theme) =>
              warmShadow(theme.palette.mode === "dark", "0 2px 8px", 0.06),
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: 34 + v.iconCardShift,
            top: 22,
            width: 64,
            height: 54,
            borderRadius: 2,
            backgroundColor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: (theme) =>
              warmShadow(theme.palette.mode === "dark", "0 6px 16px", 0.1),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "primary.main",
            animation: `${floatY} 5s ease-in-out infinite`,
            ...noMotion,
            "& .MuiSvgIcon-root": { fontSize: 30 },
          }}
        >
          {icon ?? <FolderOpenOutlinedIcon />}
        </Box>
        {(v.dots === "default"
          ? [
              { left: 4, top: 14, size: 8, alpha: 0.5, dur: 3.2 },
              { left: 116, top: 34, size: 6, alpha: 0.35, dur: 3.8 },
              { left: 99, top: 93, size: 5, alpha: 0.45, dur: 4.4 },
            ]
          : [
              { left: 2, top: 40, size: 6, alpha: 0.4, dur: 3.6 },
              { left: 109, top: 12, size: 7, alpha: 0.5, dur: 4.2 },
            ]
        ).map((dot, index) => (
          <Box
            key={index}
            sx={{
              position: "absolute",
              left: dot.left,
              top: dot.top,
              width: dot.size,
              height: dot.size,
              borderRadius: "50%",
              backgroundColor: `rgba(243, 128, 32, ${dot.alpha})`,
              animation: `${floatY} ${dot.dur}s ease-in-out infinite`,
              ...noMotion,
            }}
          />
        ))}
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
          {description}
        </Typography>
      ) : null}
      {actions ? (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            mt: 1,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {actions}
        </Box>
      ) : null}
    </Box>
  );
}

export default EmptyState;
