import { type FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  Sparkles,
  Users
} from "lucide-react";
import { loadBasePaintCollector } from "./client";
import { basePaintCollectorUrl } from "./collector";
import { basePaintArtworkUrl, basePaintCanvasScoutUrl } from "./data";
import {
  basePaintDayDateText,
  numberText,
  shortIdentity,
  utcDateTimeText
} from "./format";
import type { BasePaintCollectorResponse } from "./types";

type CollectorLoadStatus = "loading" | "success" | "error";

function heldDayLabel(day: number | null) {
  return day ? `Day #${numberText(day)}` : "—";
}

export function BasePaintCollectorPage({ address }: { address: string }) {
  const [collector, setCollector] = useState<BasePaintCollectorResponse | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState("");
  const [inspectAddress, setInspectAddress] = useState(address);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<CollectorLoadStatus>("loading");

  useEffect(() => setInspectAddress(address), [address]);

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    const existingCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonical = existingCanonical ?? document.createElement("link");
    const previousCanonical = existingCanonical?.href;

    if (!existingCanonical) {
      canonical.rel = "canonical";
      document.head.append(canonical);
    }

    document.title = `${shortIdentity(address)} BasePaint Collector | BaseScout`;
    canonical.href = new URL(basePaintCollectorUrl(address), window.location.origin).toString();
    if (description) {
      description.content =
        "Explore a BasePaint collector’s current public holdings, editions, palette tendencies, and canvases.";
    }

    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
      if (existingCanonical && previousCanonical) {
        existingCanonical.href = previousCanonical;
      } else if (!existingCanonical) {
        canonical.remove();
      }
    };
  }, [address]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError("");

    void loadBasePaintCollector(address, controller.signal)
      .then((result) => {
        setCollector(result);
        setStatus("success");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setCollector(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "BasePaint collector data could not be loaded."
        );
        setStatus("error");
      });

    return () => controller.abort();
  }, [address, reloadKey]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(collector?.address ?? address);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_500);
    } catch {
      setCopyState("idle");
    }
  }

  function inspectCollector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAddress = inspectAddress.trim();
    if (nextAddress) window.location.assign(basePaintCollectorUrl(nextAddress));
  }

  return (
    <main className="bp-app">
      <header className="bp-header">
        <nav className="bp-nav" aria-label="BasePaint collector navigation">
          <a className="bp-brand" href="/">
            <span className="bp-brand-mark" aria-hidden="true">
              <img src="/basescout-logo.png?v=2" alt="" width="34" height="34" />
            </span>
            <span>
              BaseScout
              <small>× BasePaint</small>
            </span>
          </a>

          <div className="bp-nav-links">
            <a href="/basepaint#today">Today</a>
            <a href="/basepaint#pulse">Artists</a>
            <a className="active" href="/basepaint#gallery">Gallery</a>
            <a href="https://basepaint.xyz/" target="_blank" rel="noopener noreferrer">
              BasePaint <ExternalLink size={14} />
            </a>
          </div>

          <a className="bp-back" href="/basepaint#gallery">
            <ArrowLeft size={15} />
            Recent canvases
          </a>
        </nav>
      </header>

      <div className="bp-page bp-collector-page">
        <div className="bp-context">
          <span>Independent read-only collector intelligence</span>
          <span className={`bp-provider ${status === "success" ? "available" : "pending"}`}>
            <span aria-hidden="true" />
            Public indexer
          </span>
        </div>

        {status === "loading" ? (
          <section className="bp-artist-loading" aria-live="polite">
            <Loader2 className="spin" size={30} />
            <strong>Loading Collector Scout</strong>
            <span>Reading current public BasePaint ERC-1155 balances.</span>
          </section>
        ) : status === "error" ? (
          <section className="bp-artist-error" role="alert">
            <Layers3 size={34} />
            <div>
              <span>Collector Scout</span>
              <h1>Profile unavailable</h1>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw size={15} />
              Retry
            </button>
            <a href="/basepaint#gallery">
              Return to recent canvases
              <ArrowUpRight size={15} />
            </a>
          </section>
        ) : collector ? (
          <>
            <section className="bp-collector-hero">
              <div className="bp-collector-identity">
                <div className="bp-kicker">
                  <Sparkles size={16} />
                  Collector Scout
                </div>
                <h1>{shortIdentity(collector.address)}</h1>
                <p>{collector.address}</p>
                <div className="bp-artist-actions">
                  <button type="button" onClick={copyAddress}>
                    {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}
                    {copyState === "copied" ? "Copied" : "Copy address"}
                  </button>
                  <a
                    href={`https://basescan.org/address/${collector.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    BaseScan
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              <dl className="bp-collector-stats">
                <div>
                  <ImageIcon size={20} />
                  <dt>Canvas days held</dt>
                  <dd>{numberText(collector.totalCanvasDays)}</dd>
                </div>
                <div>
                  <Layers3 size={20} />
                  <dt>Total editions</dt>
                  <dd>{numberText(collector.totalEditions)}</dd>
                </div>
                <div>
                  <CalendarDays size={20} />
                  <dt>Earliest held day</dt>
                  <dd>{heldDayLabel(collector.earliestHeldDay)}</dd>
                </div>
                <div>
                  <Sparkles size={20} />
                  <dt>Latest held day</dt>
                  <dd>{heldDayLabel(collector.latestHeldDay)}</dd>
                </div>
              </dl>
            </section>

            <form className="bp-collector-search" onSubmit={inspectCollector}>
              <label htmlFor="bp-collector-address">Inspect another public Base address</label>
              <div>
                <input
                  id="bp-collector-address"
                  value={inspectAddress}
                  onChange={(event) => setInspectAddress(event.target.value)}
                  inputMode="text"
                  spellCheck="false"
                  autoComplete="off"
                  placeholder="0x…"
                />
                <button type="submit">
                  <Search size={15} />
                  Inspect
                </button>
              </div>
            </form>

            {collector.collection.length ? (
              <>
                <section className="bp-collector-palette" aria-labelledby="collector-palette-title">
                  <div className="bp-section-heading">
                    <div>
                      <span>Collection signal</span>
                      <h2 id="collector-palette-title">Held palette</h2>
                    </div>
                    <p>
                      {collector.truncated
                        ? `Based on the latest ${numberText(collector.sampledCanvasDays)} of ${numberText(collector.totalCanvasDays)} held days.`
                        : `Based on all ${numberText(collector.sampledCanvasDays)} currently held days.`}
                    </p>
                  </div>

                  {collector.dominantPalette.length ? (
                    <ol className="bp-collector-colors">
                      {collector.dominantPalette.map((entry) => (
                        <li key={entry.color}>
                          <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
                          <strong>{entry.color}</strong>
                          <span>{numberText(entry.canvasCount)} canvases</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="bp-artist-empty">No palette metadata was returned for this sample.</div>
                  )}
                </section>

                <section className="bp-collector-collection" aria-labelledby="collector-canvases-title">
                  <div className="bp-section-heading">
                    <div>
                      <span>Current public balances</span>
                      <h2 id="collector-canvases-title">Held canvases</h2>
                    </div>
                    <p>
                      Showing {numberText(collector.sampledCanvasDays)} most recent held days
                      {collector.truncated ? ` · capped at ${numberText(collector.sampleLimit)}` : ""}
                    </p>
                  </div>

                  <div className="bp-collector-grid">
                    {collector.collection.map((holding) => (
                      <article className="bp-collector-card" key={holding.day}>
                        <a className="bp-collector-art" href={basePaintCanvasScoutUrl(holding.day)}>
                          <img
                            src={basePaintArtworkUrl(holding.day)}
                            alt={`${holding.name ?? `BasePaint day ${holding.day}`}, held canvas`}
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                        <div className="bp-collector-card-copy">
                          <span>Day #{numberText(holding.day)}</span>
                          <h3>{holding.name ?? `Canvas #${numberText(holding.day)}`}</h3>
                          <p>{basePaintDayDateText(holding.day)}</p>
                        </div>
                        <dl>
                          <div>
                            <Layers3 size={13} />
                            <dt>Held</dt>
                            <dd>{numberText(holding.editions)}</dd>
                          </div>
                          <div>
                            <Users size={13} />
                            <dt>Artists</dt>
                            <dd>{numberText(holding.totalArtists)}</dd>
                          </div>
                          <div>
                            <Palette size={13} />
                            <dt>Colors</dt>
                            <dd>{numberText(holding.palette.length)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <section className="bp-collector-empty">
                <ImageIcon size={30} />
                <div>
                  <span>Valid public address</span>
                  <h2>No BasePaint canvases currently held</h2>
                  <p>The public BasePaint indexer returned no positive canvas balances for this address.</p>
                </div>
                <a href="/basepaint#gallery">
                  Explore recent canvases
                  <ArrowUpRight size={15} />
                </a>
              </section>
            )}

            <aside className="bp-collector-coverage">
              <strong>Coverage</strong>
              <span>Current BasePaint ERC-1155 balances · no acquisition-history claim</span>
              <span>Updated {utcDateTimeText(collector.generatedAt)} UTC</span>
            </aside>

            <footer className="bp-footer">
              <span>Public BasePaint data. No API key or wallet connection required.</span>
              <span>Artwork is CC0. BaseScout is an independent explorer.</span>
            </footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
