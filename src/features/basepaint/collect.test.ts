import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionData, getAddress, zeroAddress } from "viem";
import {
  BASEPAINT_ADDRESS,
  BASEPAINT_COLLECT_QUANTITY,
  BASEPAINT_REWARDS_ABI,
  BASEPAINT_REWARDS_ADDRESS,
  basePaintCollectCallsId,
  basePaintCollectQuoteChanged,
  basePaintCollectValueText,
  buildBasePaintCollectCall,
  classifyBasePaintCollectError,
  parseBasePaintCollectCallsStatus,
  type BasePaintCollectQuote
} from "./collect";

const account = getAddress("0x000488429Af0fe9B62F61e3F33638d3970a3CeC9");
const quote: BasePaintCollectQuote = {
  basePaintAddress: BASEPAINT_ADDRESS,
  chainId: 8453,
  checkedAt: 1234,
  eligible: true,
  eligibleDay: 1088,
  openEditionPriceWei: 2_600_000_000_000_000n,
  rewardsAddress: BASEPAINT_REWARDS_ADDRESS,
  sourceBlock: 49_442_026n,
  totalContributions: 123_205n,
  totalValueWei: 2_600_000_000_000_000n
};

const call = buildBasePaintCollectCall(account, quote);
assert.equal(call.address, BASEPAINT_REWARDS_ADDRESS);
assert.equal(call.functionName, "mintLatest");
assert.equal(call.value, quote.totalValueWei);
assert.deepEqual(call.args, [account, BASEPAINT_COLLECT_QUANTITY, zeroAddress]);

const encoded = encodeFunctionData({
  abi: call.abi,
  functionName: call.functionName,
  args: call.args
});
const decoded = decodeFunctionData({ abi: BASEPAINT_REWARDS_ABI, data: encoded });
assert.equal(decoded.functionName, "mintLatest");
assert.deepEqual(decoded.args, [account, 1n, zeroAddress]);

assert.equal(basePaintCollectValueText(quote.totalValueWei), "0.0026 ETH");
assert.equal(basePaintCollectQuoteChanged(quote, { ...quote, checkedAt: 9999 }), false);
assert.equal(basePaintCollectQuoteChanged(quote, { ...quote, eligibleDay: 1089 }), true);
assert.equal(basePaintCollectQuoteChanged(quote, { ...quote, totalValueWei: 3n }), true);
assert.equal(basePaintCollectQuoteChanged(quote, { ...quote, eligible: false }), true);

const callsId = `0x${"12".repeat(32)}` as const;
const transactionHash = `0x${"34".repeat(32)}` as const;
assert.equal(basePaintCollectCallsId(callsId), callsId);
assert.equal(basePaintCollectCallsId({ id: callsId }), callsId);
assert.equal(basePaintCollectCallsId({ batchId: callsId }), callsId);
assert.throws(
  () => basePaintCollectCallsId({ code: -32090, message: "Unable to prepare" }),
  (error: unknown) =>
    error instanceof Error &&
    (error as Error & { code?: number }).code === -32090 &&
    error.message === "Unable to prepare"
);

assert.equal(parseBasePaintCollectCallsStatus({ status: 100, receipts: [] }), null);
assert.deepEqual(
  parseBasePaintCollectCallsStatus({ status: 200, receipts: [{ transactionHash }] }),
  { outcome: "success", transactionHash }
);
assert.deepEqual(parseBasePaintCollectCallsStatus({ status: 400, receipts: [] }), {
  outcome: "failed",
  transactionHash: null
});
assert.deepEqual(parseBasePaintCollectCallsStatus({ status: 500, receipts: [] }), {
  outcome: "reverted",
  transactionHash: null
});

assert.deepEqual(classifyBasePaintCollectError({ code: 4001 }), {
  kind: "rejected",
  message: "Transaction rejected. Nothing was sent."
});
assert.equal(classifyBasePaintCollectError(new Error("insufficient funds")).kind, "insufficient_funds");
assert.equal(
  classifyBasePaintCollectError({
    code: -32090,
    message: "Unable to prepare",
    data: { type: "INSUFFICIENT_FUNDS" }
  }).kind,
  "insufficient_funds"
);
assert.equal(classifyBasePaintCollectError(new Error("execution reverted: Invalid price")).kind, "invalid_price");
assert.equal(classifyBasePaintCollectError(new Error("execution reverted: Empty canvas")).kind, "empty_canvas");
assert.equal(classifyBasePaintCollectError(new Error("request timeout")).kind, "timeout");
assert.equal(classifyBasePaintCollectError(new Error("unexpected")).kind, "unknown");

console.log("BasePaint collect tests passed");
