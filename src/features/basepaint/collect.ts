import type { ProviderInterface } from "@base-org/account";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  isAddress,
  isHex,
  numberToHex,
  zeroAddress,
  type Address,
  type Hash
} from "viem";
import { base } from "viem/chains";

export const BASEPAINT_ADDRESS = "0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83" as const;
export const BASEPAINT_REWARDS_ADDRESS =
  "0xaff1A9E200000061fC3283455d8B0C7e3e728161" as const;
export const BASEPAINT_COLLECT_QUANTITY = 1n;
export const BASEPAINT_REWARDS_RECIPIENT = zeroAddress;
export const BASEPAINT_RPC_URL = "https://mainnet.base.org";

export const BASEPAINT_ABI = [
  {
    type: "function",
    name: "today",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "openEditionPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "canvases",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "totalContributions", type: "uint256" },
      { name: "totalRaised", type: "uint256" }
    ]
  }
] as const;

export const BASEPAINT_REWARDS_ABI = [
  {
    type: "function",
    name: "basepaint",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "mintLatest",
    stateMutability: "payable",
    inputs: [
      { name: "sendMintsTo", type: "address" },
      { name: "count", type: "uint256" },
      { name: "sendRewardsTo", type: "address" }
    ],
    outputs: []
  }
] as const;

export type BasePaintCollectQuote = {
  basePaintAddress: typeof BASEPAINT_ADDRESS;
  chainId: typeof base.id;
  checkedAt: number;
  eligible: boolean;
  eligibleDay: number;
  openEditionPriceWei: bigint;
  rewardsAddress: typeof BASEPAINT_REWARDS_ADDRESS;
  sourceBlock: bigint;
  totalContributions: bigint;
  totalValueWei: bigint;
};

export type BasePaintCollectErrorKind =
  | "empty_canvas"
  | "insufficient_funds"
  | "invalid_price"
  | "rejected"
  | "timeout"
  | "wrong_chain"
  | "unknown";

export type BasePaintCollectError = {
  kind: BasePaintCollectErrorKind;
  message: string;
};

export type BasePaintCollectConfirmation = {
  outcome: "failed" | "reverted" | "success";
  transactionHash: Hash | null;
};

const publicClient = createPublicClient({
  chain: base,
  transport: http(BASEPAINT_RPC_URL, { retryCount: 1, timeout: 12_000 })
});

let providerPromise: Promise<ProviderInterface> | null = null;

function contractCodeAvailable(value?: `0x${string}`) {
  return Boolean(value && value !== "0x");
}

function chainIdFromRpc(value: unknown) {
  if (typeof value !== "string") return Number.NaN;
  return Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
}

function errorCode(value: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  return (
    errorCode(record.cause, depth + 1) ??
    errorCode(record.error, depth + 1) ??
    errorCode(record.data, depth + 1)
  );
}

function errorText(value: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (depth > 5 || typeof value !== "object" || value === null || seen.has(value)) {
    return typeof value === "string" ? value : "";
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  return [
    record.shortMessage,
    record.details,
    record.message,
    record.type,
    errorText(record.cause, depth + 1, seen),
    errorText(record.error, depth + 1, seen),
    errorText(record.data, depth + 1, seen)
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" ");
}

function throwResolvedProviderError(value: Record<string, unknown>): never {
  const error = new Error(
    typeof value.message === "string" ? value.message : "Base Account returned an error response."
  ) as Error & { code?: number; data?: unknown };
  if (typeof value.code === "number") error.code = value.code;
  if (value.data !== undefined) error.data = value.data;
  throw error;
}

export function basePaintCollectCallsId(value: unknown): `0x${string}` {
  if (typeof value === "string" && isHex(value) && value.length >= 66) return value;

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.code === "number" || record.error) throwResolvedProviderError(record);

    const candidate = [record.id, record.batchId].find(
      (entry): entry is `0x${string}` =>
        typeof entry === "string" && isHex(entry) && entry.length >= 66
    );
    if (candidate) return candidate;
  }

  throw new Error("Base Account returned an invalid call bundle identifier.");
}

function callsStatusTransactionHash(value: Record<string, unknown>) {
  if (!Array.isArray(value.receipts)) return null;
  for (const receipt of value.receipts) {
    if (typeof receipt !== "object" || receipt === null) continue;
    const candidate = (receipt as Record<string, unknown>).transactionHash;
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(candidate)) {
      return candidate as Hash;
    }
  }
  return null;
}

export function parseBasePaintCollectCallsStatus(
  value: unknown
): BasePaintCollectConfirmation | null {
  if (typeof value !== "object" || value === null) {
    throw new Error("Base Account returned an invalid call status.");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.code === "number" || record.error) throwResolvedProviderError(record);
  if (typeof record.status !== "number") {
    throw new Error("Base Account returned an invalid call status.");
  }

  const transactionHash = callsStatusTransactionHash(record);
  if (record.status >= 100 && record.status < 200) return null;
  if (record.status >= 200 && record.status < 300) {
    return { outcome: "success", transactionHash };
  }
  if (record.status >= 400 && record.status < 500) {
    return { outcome: "failed", transactionHash };
  }
  if (record.status >= 500 && record.status < 700) {
    return { outcome: "reverted", transactionHash };
  }

  throw new Error(`Base Account returned unsupported call status ${record.status}.`);
}

async function baseAccountProvider() {
  if (typeof window === "undefined") throw new Error("Base Account requires a browser.");

  providerPromise ??= import("@base-org/account").then(({ createBaseAccountSDK }) =>
    createBaseAccountSDK({
      appName: "BaseScout",
      appLogoUrl: new URL("/basescout-logo.png?v=2", window.location.origin).toString(),
      appChainIds: [base.id],
      preference: { telemetry: false }
    }).getProvider()
  );

  return providerPromise;
}

async function ensureBaseChain(provider: ProviderInterface) {
  const currentChainId = chainIdFromRpc(await provider.request({ method: "eth_chainId" }));
  if (currentChainId === base.id) return;

  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${base.id.toString(16)}` }]
  });

  const switchedChainId = chainIdFromRpc(await provider.request({ method: "eth_chainId" }));
  if (switchedChainId !== base.id) throw new Error("Base Account is not connected to Base mainnet.");
}

export async function loadBasePaintCollectQuote(): Promise<BasePaintCollectQuote> {
  const [basePaintCode, rewardsCode, linkedBasePaint, currentDay, price, sourceBlock] =
    await Promise.all([
      publicClient.getCode({ address: BASEPAINT_ADDRESS }),
      publicClient.getCode({ address: BASEPAINT_REWARDS_ADDRESS }),
      publicClient.readContract({
        address: BASEPAINT_REWARDS_ADDRESS,
        abi: BASEPAINT_REWARDS_ABI,
        functionName: "basepaint"
      }),
      publicClient.readContract({
        address: BASEPAINT_ADDRESS,
        abi: BASEPAINT_ABI,
        functionName: "today"
      }),
      publicClient.readContract({
        address: BASEPAINT_ADDRESS,
        abi: BASEPAINT_ABI,
        functionName: "openEditionPrice"
      }),
      publicClient.getBlockNumber()
    ]);

  if (!contractCodeAvailable(basePaintCode) || !contractCodeAvailable(rewardsCode)) {
    throw new Error("Canonical BasePaint contracts are unavailable on Base mainnet.");
  }
  if (linkedBasePaint.toLowerCase() !== BASEPAINT_ADDRESS.toLowerCase()) {
    throw new Error("BasePaintRewards is not linked to the expected BasePaint contract.");
  }
  if (currentDay < 2n || currentDay > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("BasePaint returned an invalid current day.");
  }

  const eligibleDay = currentDay - 1n;
  const [totalContributions] = await publicClient.readContract({
    address: BASEPAINT_ADDRESS,
    abi: BASEPAINT_ABI,
    functionName: "canvases",
    args: [eligibleDay]
  });

  return {
    basePaintAddress: BASEPAINT_ADDRESS,
    chainId: base.id,
    checkedAt: Date.now(),
    eligible: totalContributions > 0n,
    eligibleDay: Number(eligibleDay),
    openEditionPriceWei: price,
    rewardsAddress: BASEPAINT_REWARDS_ADDRESS,
    sourceBlock,
    totalContributions,
    totalValueWei: price * BASEPAINT_COLLECT_QUANTITY
  };
}

export function buildBasePaintCollectCall(account: Address, quote: BasePaintCollectQuote) {
  return {
    account,
    address: BASEPAINT_REWARDS_ADDRESS,
    abi: BASEPAINT_REWARDS_ABI,
    functionName: "mintLatest" as const,
    args: [account, BASEPAINT_COLLECT_QUANTITY, BASEPAINT_REWARDS_RECIPIENT] as const,
    value: quote.totalValueWei
  };
}

export function basePaintCollectQuoteChanged(
  previous: BasePaintCollectQuote,
  current: BasePaintCollectQuote
) {
  return (
    previous.chainId !== current.chainId ||
    previous.eligibleDay !== current.eligibleDay ||
    previous.totalValueWei !== current.totalValueWei ||
    previous.eligible !== current.eligible
  );
}

export function basePaintCollectValueText(value: bigint) {
  return `${formatEther(value)} ETH`;
}

export async function connectBaseAccount() {
  const provider = await baseAccountProvider();
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !accounts.length || !isAddress(accounts[0])) {
    throw new Error("Base Account did not return a valid address.");
  }

  await ensureBaseChain(provider);
  return getAddress(accounts[0]);
}

export async function disconnectBaseAccount() {
  const provider = await baseAccountProvider();
  await provider.disconnect();
  providerPromise = null;
}

export async function submitBasePaintCollect(account: Address, quote: BasePaintCollectQuote) {
  if (!quote.eligible) throw new Error("The latest completed canvas is not eligible to collect.");

  const provider = await baseAccountProvider();
  await ensureBaseChain(provider);
  const call = buildBasePaintCollectCall(account, quote);
  const data = encodeFunctionData({
    abi: call.abi,
    functionName: call.functionName,
    args: call.args
  });
  const response = await provider.request({
    method: "wallet_sendCalls",
    params: [
      {
        version: "2.0.0",
        from: account,
        chainId: numberToHex(base.id),
        atomicRequired: true,
        calls: [
          {
            to: call.address,
            data,
            value: numberToHex(call.value)
          }
        ]
      }
    ]
  });
  return basePaintCollectCallsId(response);
}

export async function waitForBasePaintCollect(callsId: `0x${string}`) {
  const provider = await baseAccountProvider();
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const response = await provider.request({
      method: "wallet_getCallsStatus",
      params: [callsId]
    });
    const confirmation = parseBasePaintCollectCallsStatus(response);
    if (confirmation) return confirmation;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error("Base Account call confirmation timed out.");
}

export function classifyBasePaintCollectError(value: unknown): BasePaintCollectError {
  const code = errorCode(value);
  const text = errorText(value).toLowerCase();

  if (
    code === 4001 ||
    text.includes("user rejected") ||
    text.includes("user denied") ||
    text.includes("user cancelled funding")
  ) {
    return { kind: "rejected", message: "Transaction rejected. Nothing was sent." };
  }
  if (
    code === -32090 ||
    text.includes("insufficient funds") ||
    text.includes("insufficient balance") ||
    text.includes("insufficient_funds")
  ) {
    return {
      kind: "insufficient_funds",
      message: "Insufficient ETH for the edition value and Base network fee."
    };
  }
  if (text.includes("invalid price")) {
    return {
      kind: "invalid_price",
      message: "The live BasePaint price changed before submission. Review the transaction again."
    };
  }
  if (text.includes("empty canvas") || text.includes("not eligible to collect")) {
    return {
      kind: "empty_canvas",
      message: "The latest completed canvas is not currently eligible to collect."
    };
  }
  if (text.includes("chain") || code === 4902) {
    return { kind: "wrong_chain", message: "Switch Base Account to Base mainnet and retry." };
  }
  if (text.includes("timeout") || text.includes("timed out")) {
    return {
      kind: "timeout",
      message: "Confirmation is taking longer than expected. Check the transaction on BaseScan."
    };
  }

  return {
    kind: "unknown",
    message: "Base Account could not prepare the transaction. Nothing was sent."
  };
}
