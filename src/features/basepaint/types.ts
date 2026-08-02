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

export type BasePaintArtistContribution = {
  day: number;
  pixelsCount: number;
};

export type BasePaintArtistBrush = {
  id: number;
  strength: number;
  streak: number;
  lastUsedDay: number | null;
  lastUsedAt: number | null;
};

export type BasePaintArtistResponse = {
  source: "basepaint";
  attribution: "Public onchain data by BasePaint";
  generatedAt: number;
  currentDay: number;
  cacheSeconds: number;
  address: string;
  totalPixels: number;
  totalDaysPainted: number;
  streak: number;
  longestStreak: number;
  lastPaintedDay: number | null;
  totalEarnedWei: string;
  totalWithdrawnWei: string;
  recentContributions: BasePaintArtistContribution[];
  brushes: BasePaintArtistBrush[];
};

export type BasePaintCollectorHolding = {
  day: number;
  editions: number;
  name?: string;
  proposer?: string;
  palette: string[];
  totalArtists: number;
  pixelsCount: number;
  totalMints: number;
  totalBurns: number;
};

export type BasePaintCollectorPaletteColor = {
  color: string;
  canvasCount: number;
  percentage: number;
};

export type BasePaintCollectorPeriod = {
  label: string;
  startDay: number;
  endDay: number;
  canvasCount: number;
  percentage: number;
};

export type BasePaintCollectorThemeProposer = {
  proposer: string;
  canvasCount: number;
  percentage: number;
};

export type BasePaintCollectorCoverageConfidence = "high" | "medium" | "low";

export type BasePaintCollectorCoverage = {
  sampledCanvasDays: number;
  totalCanvasDays: number;
  samplePercentage: number;
  paletteMetadataDays: number;
  proposerMetadataDays: number;
  confidence: BasePaintCollectorCoverageConfidence;
};

export type BasePaintCollectorSignals = {
  longestHeldDayRun: number;
  multipleEditionDays: number;
  periods: BasePaintCollectorPeriod[];
  themeProposers: BasePaintCollectorThemeProposer[];
};

export type BasePaintCollectorRecommendationEvidenceCode =
  | "palette_match"
  | "theme_proposer_match"
  | "near_held_day"
  | "collecting_now";

export type BasePaintCollectorRecommendationEvidence = {
  code: BasePaintCollectorRecommendationEvidenceCode;
  label: string;
  detail: string;
  weight: number;
};

export type BasePaintCollectorRecommendation = {
  day: number;
  name?: string;
  proposer?: string;
  palette: string[];
  phase: BasePaintCanvasPhase;
  matchScore: number;
  evidence: BasePaintCollectorRecommendationEvidence[];
};

export type BasePaintCollectorResponse = {
  source: "basepaint";
  attribution: "Public onchain data by BasePaint";
  artworkLicense: "CC0";
  generatedAt: number;
  currentDay: number;
  cacheSeconds: number;
  address: string;
  totalCanvasDays: number;
  totalEditions: number;
  earliestHeldDay: number | null;
  latestHeldDay: number | null;
  sampledCanvasDays: number;
  sampleLimit: number;
  truncated: boolean;
  coverage: BasePaintCollectorCoverage;
  signals: BasePaintCollectorSignals;
  dominantPalette: BasePaintCollectorPaletteColor[];
  recommendations: BasePaintCollectorRecommendation[];
  collection: BasePaintCollectorHolding[];
};

export type BasePaintCanvasPhase = "painting" | "collecting" | "complete";

export type BasePaintCanvasContributor = {
  address: string;
  pixelsCount: number;
};

export type BasePaintCanvasStroke = {
  id: string;
  address: string;
  brushId: number;
  pixelsCount: number;
  transactionHash: string;
  paintedAt: number;
};

export type BasePaintCanvasResponse = {
  source: "basepaint";
  attribution: "Public onchain data by BasePaint";
  artworkLicense: "CC0";
  generatedAt: number;
  currentDay: number;
  cacheSeconds: number;
  phase: BasePaintCanvasPhase;
  phaseEndsAt: number | null;
  canvas: BasePaintCanvas;
  topContributors: BasePaintCanvasContributor[];
  recentStrokes: BasePaintCanvasStroke[];
  recentStrokeLimit: number;
};

export type BasePaintErrorResponse = {
  error: string;
  errorCode:
    | "provider_error"
    | "method_not_allowed"
    | "invalid_address"
    | "artist_not_found"
    | "invalid_day"
    | "canvas_not_found";
};
