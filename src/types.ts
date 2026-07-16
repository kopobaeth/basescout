export type DexToken = {
  address?: string;
  name?: string;
  symbol?: string;
};

export type DexPair = {
  chainId: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  pairCreatedAt?: number;
  baseToken?: DexToken;
  quoteToken?: DexToken;
  priceUsd?: string;
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  priceChange?: {
    h24?: number;
  };
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
  marketCap?: number;
  fdv?: number;
  info?: {
    imageUrl?: string;
  };
};

export type FindingTone = "positive" | "warning" | "danger" | "neutral";

export type Finding = {
  title: string;
  detail: string;
  delta: number;
  tone: FindingTone;
};

export type ConfidenceLabel = "High" | "Medium" | "Low";

export type ScoreReason = {
  title: string;
  detail: string;
  delta: number;
  tone: FindingTone;
};

export type DataConfidence = {
  score: number;
  label: ConfidenceLabel;
  completedChecks: string[];
  unavailableChecks: string[];
  reasons: ScoreReason[];
};

export type RiskScoreBreakdown = {
  overall: number;
  market: number;
  contract: number;
  confidence: DataConfidence;
  marketReasons: ScoreReason[];
  contractReasons: ScoreReason[];
};

export type SecurityCheckStatus = "pass" | "warning" | "critical" | "unknown";
export type SecurityEvidenceLevel = "confirmed" | "inferred" | "unavailable";
export type SecurityProviderStatus = "available" | "partial" | "unavailable";

export type SecurityCheckKey =
  | "honeypot"
  | "buy_tax"
  | "sell_tax"
  | "transfer_tax"
  | "owner_can_mint"
  | "blacklist"
  | "whitelist"
  | "pausable"
  | "trading_restrictions"
  | "proxy"
  | "ownership_renounced"
  | "owner_privileges"
  | "verified_contract";

export type SecurityFinding = {
  key: SecurityCheckKey;
  label: string;
  status: SecurityCheckStatus;
  summary: string;
  explanation: string;
  evidence: SecurityEvidenceLevel;
  value?: string;
};

export type SecurityIntelligence = {
  status: SecurityProviderStatus;
  provider: "goplus";
  checkedAt: number;
  checks: SecurityFinding[];
  unavailableChecks: SecurityCheckKey[];
  criticalCount: number;
  warningCount: number;
  note?: string;
};

export type BaseScanStatus = "idle" | "loading" | "available" | "unavailable";
export type VerificationStatus = "verified" | "unverified" | "unknown";
export type BaseScanUnavailableReason =
  | "missing-key"
  | "request-failed"
  | "invalid-key"
  | "rate-limited"
  | "endpoint-unavailable"
  | "plan-restricted"
  | "no-data";

export type BaseScanIntelligence = {
  status: BaseScanStatus;
  reason?: BaseScanUnavailableReason;
  verificationStatus: VerificationStatus;
  contractName?: string;
  deployer?: string;
  creationTxHash?: string;
  createdAt?: number;
  tokenSupply?: string;
  holderCount?: number;
  holderCountUnavailableReason?: BaseScanUnavailableReason;
  tokenSupplyUnavailableReason?: BaseScanUnavailableReason;
  creationUnavailableReason?: BaseScanUnavailableReason;
  note?: string;
};

export type ScanResult = {
  pair: DexPair;
  pairs: DexPair[];
  targetToken: DexToken;
  baseScan: BaseScanIntelligence;
  security: SecurityIntelligence;
  score: number;
  verdict: string;
  breakdown: RiskScoreBreakdown;
  findings: Finding[];
};

export type ScanErrorCode =
  | "invalid_address"
  | "no_base_pair"
  | "api_timeout"
  | "rate_limit"
  | "partial_contract_intelligence_failure"
  | "unexpected_server_error";

export type ScanApiResponse = {
  address: string;
  pair: DexPair | null;
  pairs: DexPair[];
  baseScan: BaseScanIntelligence;
  security: SecurityIntelligence;
  error?: string;
  errorCode?: ScanErrorCode;
  errors?: {
    dex?: string;
    baseScan?: string;
    security?: string;
  };
};

export type ScanHistoryItem = {
  address: string;
  shortAddress: string;
  symbol: string;
  timestamp: number;
  riskScore: number;
  tokenLogo?: string;
};

export type WatchlistItem = {
  address: string;
  shortAddress: string;
  symbol: string;
  tokenLogo?: string;
  lastRiskScore: number;
  lastScannedAt: number;
};

export type TrendingTokenSide = "base" | "quote";

export type TrendingToken = {
  side: TrendingTokenSide;
  name?: string;
  symbol?: string;
  address?: string;
  scannable: boolean;
};

export type TrendingPool = {
  id: string;
  pairName: string;
  poolAddress?: string;
  dexName: string;
  priceUsd?: string;
  priceChangeH24?: number;
  volumeH24Usd?: number;
  liquidityUsd?: number;
  buysH24?: number;
  sellsH24?: number;
  poolCreatedAt?: number;
  baseToken: TrendingToken;
  quoteToken: TrendingToken;
};

export type TrendingApiResponse = {
  source: "geckoterminal";
  attribution: "Data by GeckoTerminal";
  updatedAt: number;
  cacheSeconds: number;
  pools: TrendingPool[];
};
