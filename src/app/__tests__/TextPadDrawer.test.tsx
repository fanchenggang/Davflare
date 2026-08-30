import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import TextPadDrawer from "../../TextPadDrawer";
import { useUploadEnqueue } from "../transferQueue";
import { setLang, strings } from "../strings";

jest.mock("../transferQueue", () => ({
  useUploadEnqueue: jest.fn(),
}));

const mockEnqueue = useUploadEnqueue as unknown as jest.Mock;

beforeEach(() => {
  setLang("zh");
  mockEnqueue.mockReset();
  mockEnqueue.mockReturnValue(jest.fn());
});

describe("TextPadDrawer", () => {
  test("空内容不能保存", () => {
    const enqueue = jest.fn();
    mockEnqueue.mockReturnValue(enqueue);
    render(<TextPadDrawer open setOpen={jest.fn()} cwd="docs/" onUpload={jest.fn()} />);
    fireEvent.click(screen.getByText(strings.saveAndUpload));
    expect(enqueue).not.toHaveBeenCalled();
  });

  test("输入内容保存并入队", () => {
    const enqueue = jest.fn();
    mockEnqueue.mockReturnValue(enqueue);
    const setOpen = jest.fn();
    render(<TextPadDrawer open setOpen={setOpen} cwd="docs/" onUpload={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(strings.noteContent), {
      target: { value: "hello world" },
    });
    fireEvent.change(screen.getByLabelText(strings.fileName), {
      target: { value: "a/b.txt" },
    });
    fireEvent.click(screen.getByText(strings.saveAndUpload));

    expect(enqueue).toHaveBeenCalledTimes(1);
    const { file, basedir } = enqueue.mock.calls[0][0];
    expect(file.name).toBe("a_b.txt");
    expect(file.type).toBe("text/plain");
    expect(basedir).toBe("docs/");
    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
