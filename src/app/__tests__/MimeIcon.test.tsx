import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import MimeIcon from "../../MimeIcon";

function renderIcon(props: { contentType: string; name?: string }) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MimeIcon {...props} />
    </ThemeProvider>
  );
}

describe("MimeIcon", () => {
  test("各类型渲染 SVG 图标", () => {
    const cases: Array<{ contentType: string; name?: string }> = [
      { contentType: "application/x-directory", name: "d" },
      { contentType: "image/png", name: "a.png" },
      { contentType: "video/mp4", name: "a.mp4" },
      { contentType: "audio/mpeg", name: "a.mp3" },
      { contentType: "application/pdf", name: "a.pdf" },
      { contentType: "", name: "a.pptx" },
      { contentType: "", name: "a.epub" },
      { contentType: "", name: "a.woff2" },
      { contentType: "application/zip", name: "a.zip" },
      { contentType: "application/json", name: "a.json" },
      { contentType: "text/html", name: "a.html" },
      { contentType: "text/css", name: "a.css" },
      { contentType: "", name: "a.js" },
      { contentType: "text/csv", name: "a.csv" },
      { contentType: "", name: "a.sh" },
      { contentType: "", name: "a.txt" },
      { contentType: "", name: "a.py" },
      { contentType: "application/octet-stream", name: "a.bin" },
    ];
    for (const c of cases) {
      const { container, unmount } = renderIcon(c);
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });
});
