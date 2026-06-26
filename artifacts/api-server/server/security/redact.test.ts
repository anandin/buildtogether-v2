import { describe, expect, it } from "vitest";
import { redact, redactToString } from "./redact";

describe("redact — keep secrets out of logs", () => {
  it("masks sensitive keys regardless of value", () => {
    const out = redact({
      access_token: "access-production-abc123",
      accessToken: "access-production-abc123",
      password: "hunter2",
      authorization: "Bearer xyz",
      institutionName: "TD Bank",
    }) as Record<string, unknown>;
    expect(out.access_token).toBe("***");
    expect(out.accessToken).toBe("***");
    expect(out.password).toBe("***");
    expect(out.authorization).toBe("***");
    expect(out.institutionName).toBe("TD Bank"); // non-sensitive preserved
  });

  it("scrubs token-shaped strings even as bare values", () => {
    const s = redactToString("got access-production-deadbeef-cafe and sk-or-v1-0123456789abcdef");
    expect(s).not.toContain("deadbeef");
    expect(s).toContain("access-***");
    expect(s).toContain("sk-or-***");
  });

  it("masks long digit runs (card/account numbers)", () => {
    expect(redactToString("acct 4111111111111111 on file")).toContain("<card-or-acct>");
  });

  it("redacts nested Plaid error shapes", () => {
    const err = {
      response: {
        data: { error_code: "INVALID", access_token: "access-production-xyz", request_id: "r1" },
      },
    };
    const out = JSON.stringify(redact(err));
    expect(out).not.toContain("access-production-xyz");
    expect(out).toContain("INVALID"); // useful diagnostic kept
  });

  it("handles Error objects and caps depth without throwing", () => {
    const circular: any = { name: "x" };
    circular.self = circular;
    expect(() => redactToString(circular)).not.toThrow();
    const e = redact(new Error("token=access-production-zzz")) as Record<string, unknown>;
    expect(String(e.message)).toContain("access-***");
  });
});
