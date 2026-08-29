import React, { useState } from "react";
import { strings, translate } from "./app/strings";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { authFetch, useAuth } from "./app/auth";

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
      const response = await authFetch("/webdav/", {
        method: "PROPFIND",
        headers: {
          Depth: "1",
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
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
    <Dialog open fullWidth maxWidth="xs">
      <DialogTitle>{strings.loginTitle}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <DialogContentText sx={{ marginBottom: 2 }}>
            {strings.loginHint}
          </DialogContentText>
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
            <DialogContentText color="error" sx={{ marginTop: 1 }}>
              {error}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? strings.loading : strings.login}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default LoginDialog;
