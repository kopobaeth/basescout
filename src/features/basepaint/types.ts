export type BasePaintProviderStatus = "available" | "unavailable";

export type BasePaintProviderState = {
  status: BasePaintProviderStatus;
  reason?: string;
};

export type BasePaintTheme = {
  day: number;
  theme: string;
  proposer?: string;
  size: number;
  palette: string[];
};

export type BasePaintCanvas = {
  day: number;
  name?: string;
  proposer?: string;
  size: number;
  palette: string[];
  totalArtists: number;
  pixelsCount: number;
  totalMints: number;
  totalBurns: number;
  totalEarnedWei: string;
  totalEarnedUsd8: string;
};

export type BasePaintOverviewResponse = {
  source: "basepaint";
  attribution: "Public onchain data by BasePaint";
  artworkLicense: "CC0";
  generatedAt: number;
  currentDay: number;
  phaseEndsAt: number;
  cacheSeconds: number;
  partial: boolean;
  providers: {
    indexer: BasePaintProviderState;
    theme: BasePaintProviderState;
  };
  theme: BasePaintTheme | null;
  canvases: BasePaintCanvas[];
};

export type BasePaintPulseWindow = {
  minutes: 5 | 30 | 60;
  artists: number;
  strokes: number;
  pixels: number;
};

export type BasePaintPulseArtist = {
  address: string;
  pixels: number;
  strokes: number;
  lastActiveAt: number;
};

export type BasePaintHeatCell = {
  x: number;
  y: number;
  pixels: number;
};

export type BasePaintPulseResponse = {
  source: "basepaint";
  attribution: "Public onchain data by BasePaint";
  generatedAt: number;
  currentDay: number;
  rangeMinutes: 60;
  refreshSeconds: number;
  stale: boolean;
  truncated: boolean;
  latestStrokeAt: number | null;
  dominantPaletteIndex: number | null;
  windows: [BasePaintPulseWindow, BasePaintPulseWindow, BasePaintPulseWindow];
  topArtists: BasePaintPulseArtist[];
  heatmap: {
    gridSize: 8;
    canvasSize: number;
    cells: BasePaintHeatCell[];
  };
};

export type BasePaintErrorResponse = {
  error: string;
  errorCode: "provider_error" | "method_not_allowed";
};
