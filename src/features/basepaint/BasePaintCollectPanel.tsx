import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  XCircle
} from "lucide-react";
import type { Address, Hash } from "viem";
import {
  BASEPAINT_REWARDS_ADDRESS,
  BASEPAINT_REWARDS_RECIPIENT,
  basePaintCollectQuoteChanged,
  basePaintCollectValueText,
  classifyBasePaintCollectError,
  connectBaseAccount,
  disconnectBaseAccount,
  loadBasePaintCollectQuote,
  submitBasePaintCollect,
  waitForBasePaintCollect,
  type BasePaintCollectQuote
} from "./collect";
import { basePaintArtworkUrl, basePaintCanvasScoutUrl } from "./data";
import { numberText, shortIdentity, utcDateTimeText } from "./format";

type CollectStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error"
  | "pending"
  | "rejected"
  | "requesting"
  | "reverted"
  | "review"
  | "success";

export function BasePaintCollectPanel({ inspectedAddress }: { inspectedAddress: string }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<BasePaintCollectQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [status, setStatus] = useState<CollectStatus>("disconnected");
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);

  useEffect(() => {
    let active = true;
    setQuoteLoading(true);
    void loadBasePaintCollectQuote()
      .then((nextQuote) => {
        if (!active) return;
        setQuote(nextQuote);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setQuote(null);
        setError("Live BasePaint contract terms could not be loaded.");
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshQuote() {
    setQuoteLoading(true);
    try {
      const nextQuote = await loadBasePaintCollectQuote();
      setQuote(nextQuote);
      setError("");
      return nextQuote;
    } catch {
      setQuote(null);
      setError("Live BasePaint contract terms could not be loaded.");
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }

  async function connect() {
    setStatus("connecting");
    setError("");
    setTransactionHash(null);
    try {
      const connectedAccount = await connectBaseAccount();
      setAccount(connectedAccount);
      setStatus("connected");
      if (!quote) await refreshQuote();
    } catch (connectionError) {
      const classified = classifyBasePaintCollectError(connectionError);
      setError(classified.message);
      setStatus(classified.kind === "rejected" ? "rejected" : "error");
    }
  }

  async function disconnect() {
    try {
      await disconnectBaseAccount();
    } finally {
      setAccount(null);
      setAcknowledged(false);
      setError("");
      setStatus("disconnected");
      setTransactionHash(null);
    }
  }

  async function openReview() {
    setAcknowledged(false);
    setError("");
    setTransactionHash(null);
    const nextQuote = await refreshQuote();
    if (!nextQuote) {
      setStatus("error");
      return;
    }
    if (!nextQuote.eligible) {
      setError("The latest completed canvas has no contributions and cannot be collected.");
      setStatus("error");
      return;
    }
    setStatus("review");
  }

  async function confirmCollect() {
    if (!account || !quote || !acknowledged) return;
    setError("");
    setStatus("requesting");

    try {
      const freshQuote = await loadBasePaintCollectQuote();
      setQuote(freshQuote);
      if (basePaintCollectQuoteChanged(quote, freshQuote)) {
        setAcknowledged(false);
        setError("Contract terms changed. Review the updated day and value before continuing.");
        setStatus("review");
        return;
      }

      const hash = await submitBasePaintCollect(account, freshQuote);
      setTransactionHash(hash);
      setStatus("pending");

      try {
        const receiptStatus = await waitForBasePaintCollect(hash);
        setStatus(receiptStatus === "success" ? "success" : "reverted");
        if (receiptStatus !== "success") {
          setError("The transaction was included but reverted. No edition was collected.");
        }
      } catch (confirmationError) {
        setError(classifyBasePaintCollectError(confirmationError).message);
        setStatus("pending");
      }
    } catch (transactionError) {
      const classified = classifyBasePaintCollectError(transactionError);
      setError(classified.message);
      setStatus(classified.kind === "rejected" ? "rejected" : "error");
    }
  }

  async function checkConfirmation() {
    if (!transactionHash) return;
    setError("");
    setStatus("pending");
    try {
      const receiptStatus = await waitForBasePaintCollect(transactionHash);
      setStatus(receiptStatus === "success" ? "success" : "reverted");
      if (receiptStatus !== "success") {
        setError("The transaction was included but reverted. No edition was collected.");
      }
    } catch (confirmationError) {
      setError(classifyBasePaintCollectError(confirmationError).message);
      setStatus("pending");
    }
  }

  const accountDiffers =
    account && inspectedAddress.toLowerCase() !== account.toLowerCase();
  const transactionUrl = transactionHash
    ? `https://basescan.org/tx/${transactionHash}`
    : null;

  return (
    <section className="bp-collect" aria-labelledby="basepaint-collect-title">
      <div className="bp-section-heading">
        <div>
          <span>One explicit onchain action</span>
          <h2 id="basepaint-collect-title">Collect the latest canvas</h2>
        </div>
        <p>
          Optional Base Account connection. Public Collector Scout remains fully usable while
          disconnected.
        </p>
      </div>

      <div className="bp-collect-layout">
        <div className="bp-collect-art" aria-hidden="true">
          {quote ? (
            <img
              src={basePaintArtworkUrl(quote.eligibleDay)}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <WalletCards size={42} />
          )}
          <span>{quote ? `Day #${numberText(quote.eligibleDay)}` : "Live contract check"}</span>
        </div>

        <div className="bp-collect-copy">
          <div className="bp-collect-status-line">
            <span className={quote?.eligible ? "available" : "pending"}>
              <i aria-hidden="true" />
              {quoteLoading
                ? "Checking canonical contracts"
                : quote?.eligible
                  ? "Eligible now"
                  : "Eligibility unavailable"}
            </span>
            {quote ? (
              <small>
                Block {quote.sourceBlock.toString()} · checked {utcDateTimeText(quote.checkedAt)} UTC
              </small>
            ) : null}
          </div>

          <h3>Canonical BasePaint open edition</h3>
          <p>
            BaseScout prepares one call to BasePaintRewards. It cannot connect or send until you
            choose to, and Base Account shows the final approval.
          </p>

          {account ? (
            <div className="bp-collect-account">
              <WalletCards size={17} />
              <div>
                <span>Connected Base Account</span>
                <strong>{shortIdentity(account)}</strong>
              </div>
              <button type="button" onClick={disconnect} disabled={status === "requesting" || status === "pending"}>
                Disconnect
              </button>
            </div>
          ) : null}

          {accountDiffers ? (
            <div className="bp-collect-notice">
              <CircleAlert size={16} />
              <span>
                The connected account differs from the inspected collector. The new edition will
                go only to <strong>{shortIdentity(account)}</strong>.
              </span>
            </div>
          ) : null}

          {status === "review" && account && quote ? (
            <div className="bp-collect-review">
              <div className="bp-collect-review-heading">
                <ShieldCheck size={18} />
                <div>
                  <span>Transaction review</span>
                  <strong>Verify every field before opening Base Account</strong>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Network</dt>
                  <dd>Base mainnet · 8453</dd>
                </div>
                <div>
                  <dt>Contract</dt>
                  <dd>
                    <a href={`https://basescan.org/address/${BASEPAINT_REWARDS_ADDRESS}`} target="_blank" rel="noopener noreferrer">
                      {shortIdentity(BASEPAINT_REWARDS_ADDRESS)} <ExternalLink size={12} />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Function</dt>
                  <dd>mintLatest(address,uint256,address)</dd>
                </div>
                <div>
                  <dt>Canvas</dt>
                  <dd>
                    <a href={basePaintCanvasScoutUrl(quote.eligibleDay)}>
                      Day #{numberText(quote.eligibleDay)} <ArrowUpRight size={12} />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>{shortIdentity(account)}</dd>
                </div>
                <div>
                  <dt>Quantity</dt>
                  <dd>1 edition</dd>
                </div>
                <div>
                  <dt>ETH value</dt>
                  <dd>{basePaintCollectValueText(quote.totalValueWei)}</dd>
                </div>
                <div>
                  <dt>Network fee</dt>
                  <dd>Shown by Base Account</dd>
                </div>
                <div>
                  <dt>Rewards recipient</dt>
                  <dd>{shortIdentity(BASEPAINT_REWARDS_RECIPIENT)} · no referral</dd>
                </div>
              </dl>
              <label className="bp-collect-confirmation">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  I reviewed the Base network, recipient, quantity, contract, and exact ETH value.
                </span>
              </label>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="bp-collect-result success" role="status">
              <CheckCircle2 size={21} />
              <div>
                <strong>Edition collected</strong>
                <span>The Base transaction is confirmed.</span>
              </div>
            </div>
          ) : status === "pending" ? (
            <div className="bp-collect-result pending" role="status">
              <Clock3 size={21} />
              <div>
                <strong>Transaction pending</strong>
                <span>{error || "Waiting for one Base mainnet confirmation."}</span>
              </div>
            </div>
          ) : status === "reverted" ? (
            <div className="bp-collect-result error" role="alert">
              <XCircle size={21} />
              <div>
                <strong>Transaction reverted</strong>
                <span>{error}</span>
              </div>
            </div>
          ) : error ? (
            <div className="bp-collect-result error" role="alert">
              <CircleAlert size={21} />
              <div>
                <strong>{status === "rejected" ? "Request rejected" : "Action unavailable"}</strong>
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <div className="bp-collect-actions">
            {!account ? (
              <button type="button" className="primary" onClick={connect} disabled={status === "connecting"}>
                {status === "connecting" ? <Loader2 className="spin" size={16} /> : <WalletCards size={16} />}
                {status === "connecting" ? "Connecting…" : "Connect Base Account"}
              </button>
            ) : status === "review" ? (
              <button type="button" className="primary" onClick={confirmCollect} disabled={!acknowledged || quoteLoading}>
                <Check size={16} />
                Confirm in Base Account
              </button>
            ) : status === "requesting" ? (
              <button type="button" className="primary" disabled>
                <Loader2 className="spin" size={16} />
                Waiting for approval…
              </button>
            ) : status === "pending" ? (
              <button type="button" className="primary" onClick={checkConfirmation} disabled={!error}>
                {error ? <RefreshCw size={16} /> : <Loader2 className="spin" size={16} />}
                {error ? "Check confirmation" : "Confirming on Base…"}
              </button>
            ) : status === "success" ? (
              <button type="button" onClick={openReview} disabled={quoteLoading}>
                <RefreshCw size={16} />
                Start a new review
              </button>
            ) : (
              <button type="button" className="primary" onClick={openReview} disabled={quoteLoading || !quote?.eligible}>
                {quoteLoading ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
                Review collect
              </button>
            )}

            {transactionUrl ? (
              <a href={transactionUrl} target="_blank" rel="noopener noreferrer">
                View transaction <ExternalLink size={14} />
              </a>
            ) : quote ? (
              <a href={basePaintCanvasScoutUrl(quote.eligibleDay)}>
                Open Canvas Scout <ArrowUpRight size={14} />
              </a>
            ) : (
              <button type="button" onClick={refreshQuote} disabled={quoteLoading}>
                <RefreshCw size={15} /> Retry contract check
              </button>
            )}
          </div>

          <small className="bp-collect-safety">
            BaseScout never holds funds, requests spend permission, or retries a rejected action.
          </small>
        </div>
      </div>
    </section>
  );
}
