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
  targetToken: DexToken;
  baseScan: BaseScanIntelligence;
  score: number;
  verdict: string;
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
  baseScan: BaseScanIntelligence;
  error?: string;
  errorCode?: ScanErrorCode;
  errors?: {
    dex?: string;
    baseScan?: string;
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
