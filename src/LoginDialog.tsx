import React, { useState } from "react";
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
        setError("用户名或密码错误，请重试");
      } else {
        login({ username, password });
      }
    } catch {
      setError("登录失败，请检查网络后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="xs">
      <DialogTitle>登录 FlareDrive</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <DialogContentText sx={{ marginBottom: 2 }}>
            请输入 WebDAV 用户名和密码以访问你的文件。
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="dense"
          />
          <TextField
            fullWidth
            label="密码"
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
            {submitting ? "登录中…" : "登录"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default LoginDialog;
