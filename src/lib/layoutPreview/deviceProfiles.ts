export interface DeviceProfile {
  id: string;
  label: string;
  wdp: number;       // 너비(dp)
  hdp: number;       // 높이(dp)
  density: number;   // dpi/160
  statusBar: number; // 상태바 높이(dp)
}

export const DEVICE_PROFILES: DeviceProfile[] = [
  { id: "pixel", label: "Pixel (411×891)", wdp: 411, hdp: 891, density: 2.625, statusBar: 24 },
  { id: "compact", label: "Compact (360×800)", wdp: 360, hdp: 800, density: 2.75, statusBar: 24 },
  { id: "tablet", label: "Tablet (800×1280)", wdp: 800, hdp: 1280, density: 2.0, statusBar: 24 },
];

export const DEFAULT_PROFILE = DEVICE_PROFILES[0];
