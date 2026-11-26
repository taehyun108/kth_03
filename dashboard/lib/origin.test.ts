import { describe, expect, it } from "vitest";
import { isJson, isSameOrigin } from "./origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("isSameOrigin", () => {
  it("브라우저의 Sec-Fetch-Site 가 있으면 그것으로 판단한다", () => {
    expect(isSameOrigin(h({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(h({ "sec-fetch-site": "none" }))).toBe(true);
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "same-site" }))).toBe(false); // 같은 상위 도메인의 다른 사이트도 막는다
  });
  it("Sec-Fetch-Site 가 없으면 Origin 과 Host 를 비교한다", () => {
    expect(isSameOrigin(h({ origin: "https://app.example.com", host: "app.example.com" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "https://app.example.com", "x-forwarded-host": "app.example.com", host: "internal:3000" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "not a url", host: "app.example.com" }))).toBe(false);
  });
  it("Origin 이 아예 없는 비브라우저 호출은 통과시킨다(접속 비밀번호가 막는다)", () => {
    expect(isSameOrigin(h({}))).toBe(true);
  });
});

describe("isJson", () => {
  it("application/json 만 인정", () => {
    expect(isJson(h({ "content-type": "application/json" }))).toBe(true);
    expect(isJson(h({ "content-type": "application/json; charset=utf-8" }))).toBe(true);
    expect(isJson(h({ "content-type": "application/x-www-form-urlencoded" }))).toBe(false);
    expect(isJson(h({ "content-type": "text/plain" }))).toBe(false);
    expect(isJson(h({}))).toBe(false);
  });
});
