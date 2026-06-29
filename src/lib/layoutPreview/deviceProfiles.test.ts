import { describe, it, expect } from "vitest";
import { DEVICE_PROFILES, DEFAULT_PROFILE } from "./deviceProfiles";

describe("deviceProfiles", () => {
  it("exposes phone profiles with sane dp sizes", () => {
    expect(DEVICE_PROFILES.length).toBeGreaterThan(0);
    expect(DEFAULT_PROFILE.wdp).toBeGreaterThan(200);
    expect(DEFAULT_PROFILE.hdp).toBeGreaterThan(DEFAULT_PROFILE.wdp);
    expect(DEFAULT_PROFILE.density).toBeGreaterThan(1);
  });
  it("DEFAULT_PROFILE is in the list", () => {
    expect(DEVICE_PROFILES).toContain(DEFAULT_PROFILE);
  });
});
