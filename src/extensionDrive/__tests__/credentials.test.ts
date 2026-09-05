import { describe, expect, it } from "vitest";
import {
  credentialsToExtRecord,
  extRecordToCredentials,
} from "../credentials";

// 扩展网盘视图的凭据镜像纯函数:chrome.storage.local 记录 ↔ App 凭据。
describe("extension credentials mapping", () => {
  it("treats missing/empty records as logged out", () => {
    expect(extRecordToCredentials(undefined)).toBeNull();
    expect(extRecordToCredentials({})).toBeNull();
    expect(extRecordToCredentials({ davUsername: "u" })).toBeNull();
    expect(
      extRecordToCredentials({ davUsername: "u", davPassword: "" })
    ).toBeNull();
  });

  it("maps a full record to credentials", () => {
    expect(
      extRecordToCredentials({ davUsername: "u", davPassword: "p" })
    ).toEqual({ username: "u", password: "p" });
  });

  it("round-trips credentials through the ext record", () => {
    const record = credentialsToExtRecord({ username: "u", password: "p" });
    expect(extRecordToCredentials(record)).toEqual({
      username: "u",
      password: "p",
    });
  });

  it("maps null credentials to an empty record", () => {
    expect(credentialsToExtRecord(null)).toEqual({});
  });
});
