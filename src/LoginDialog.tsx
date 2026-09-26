import React, { useState } from "react";
import { strings, translate } from "./app/strings";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { authFetch, useAuth, utf8ToBase64 } from "./app/auth";

function LoginDialog() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await authFetch("/api/config", {
        headers: {
          Authorization: `Basic ${utf8ToBase64(`${username}:${password}`)}`,
        },
      });
      if (!response.ok) {
        setError(translate("wrongCredentials"));
      } else {
        login({ username, password });
      }
    } catch {
      setError(translate("networkError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="xs" aria-label={strings.loginTitle}>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: { xs: 4, sm: 5 } }}>
          <Box
            sx={{
              display: "grid",
              justifyItems: "center",
              gap: 0.75,
              mb: 3,
              textAlign: "center",
            }}
          >
            <Box
              component="img"
              src="/favicon.png"
              alt=""
              sx={{ width: 46, height: 46, mb: 1 }}
            />
            <Typography
              variant="h6"
              component="div"
              sx={{ fontWeight: 700, letterSpacing: "-0.03em", color: "primary.main" }}
            >
              Davflare
            </Typography>
            <DialogContentText sx={{ maxWidth: 300 }}>
              {strings.loginHint}
            </DialogContentText>
          </Box>
          <TextField
            autoFocus
            fullWidth
            label={strings.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="dense"
          />
          <TextField
            fullWidth
            label={strings.password}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="dense"
          />
          {error && (
            <Alert severity="error" variant="outlined" sx={{ marginTop: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: { xs: 3, sm: 4 }, pt: 0 }}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disableElevation
            disabled={submitting}
          >
            {submitting ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} color="inherit" />
                <span>{strings.loading}</span>
              </Stack>
            ) : (
              strings.login
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default LoginDialog;
