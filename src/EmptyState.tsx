import React from "react";
import { Box, Typography } from "@mui/material";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

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
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(243, 128, 32, 0.1)",
          color: "primary.main",
          mb: 0.5,
          "& .MuiSvgIcon-root": { fontSize: 36 },
        }}
      >
        {icon ?? <InboxOutlinedIcon />}
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
