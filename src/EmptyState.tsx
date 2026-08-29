import React from "react";
import { Box, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

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

// 分层浮动画风的空状态插画：暖橙圆底 + 倾斜底卡 + 悬浮图标卡 + 圆点点缀，
// 颜色全部走主题 token（亮暗自适应），动效尊重系统减弱动态偏好。
function EmptyState({
  icon,
  title,
  description,
  actions,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
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
            backgroundColor: "rgba(243, 128, 32, 0.10)",
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
            transform: "rotate(-8deg)",
            boxShadow: "0 2px 8px rgba(26, 23, 20, 0.06)",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: 34,
            top: 22,
            width: 64,
            height: 54,
            borderRadius: 2,
            backgroundColor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 6px 16px rgba(26, 23, 20, 0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "primary.main",
            animation: `${floatY} 5s ease-in-out infinite`,
            ...noMotion,
            "& .MuiSvgIcon-root": { fontSize: 30 },
          }}
        >
          {icon ?? <InboxOutlinedIcon />}
        </Box>
        <Box
          sx={{
            position: "absolute",
            left: 4,
            top: 14,
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "rgba(243, 128, 32, 0.5)",
            animation: `${floatY} 3.2s ease-in-out infinite`,
            ...noMotion,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            right: 2,
            top: 34,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "rgba(243, 128, 32, 0.35)",
            animation: `${floatYSoft} 3.8s ease-in-out infinite`,
            ...noMotion,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            right: 20,
            bottom: 2,
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: "rgba(243, 128, 32, 0.45)",
            animation: `${floatY} 4.4s ease-in-out infinite`,
            ...noMotion,
          }}
        />
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
