import React, { useEffect } from "react";
import { Backdrop, Box, Fab, Typography, Zoom } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";

export interface SpeedDialAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function SpeedDial({
  open,
  onToggle,
  onClose,
  actions,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  actions: SpeedDialAction[];
}) {
  useEffect(() => {
    if (!open) return;

    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("hashchange", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("hashchange", close);
    };
  }, [open, onClose]);

  return (
    <>
      <Backdrop
        open={open}
        onClick={onClose}
        sx={{ zIndex: 1100, backgroundColor: "rgba(0, 0, 0, 0.35)" }}
      />
      <Box
        sx={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 1200,
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "flex-end",
          gap: 1,
        }}
      >
        {actions.map((action, index) => (
          <Zoom
            in={open}
            key={action.id}
            style={{
              transformOrigin: "bottom right",
              transitionDelay: open ? `${index * 40}ms` : "0ms",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  backgroundColor: "background.paper",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  boxShadow: 1,
                  opacity: open ? 1 : 0,
                  transition: "opacity 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {action.label}
              </Typography>
              <Fab
                size="medium"
                color="primary"
                disabled={action.disabled}
                onClick={action.onClick}
                aria-label={action.label}
              >
                {action.icon}
              </Fab>
            </Box>
          </Zoom>
        ))}
        <Fab
          color="primary"
          aria-label={open ? "关闭操作菜单" : "更多操作"}
          onClick={onToggle}
          sx={{
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            boxShadow: 4,
          }}
        >
          {open ? <CloseIcon /> : <AddIcon />}
        </Fab>
      </Box>
    </>
  );
}

export default SpeedDial;
