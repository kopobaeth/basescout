import { type FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
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
  ShieldCheck,
  Sparkles,
  Target,
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

function confidenceLabel(confidence: BasePaintCollectorResponse["coverage"]["confidence"]) {
  return `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)}`;
}

function recommendationPhaseLabel(phase: BasePaintCollectorResponse["recommendations"][number]["phase"]) {
  if (phase === "painting") return "Painting today";
  if (phase === "collecting") return "Collecting now";
  return "Complete";
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
                <section className="bp-collector-intelligence" aria-labelledby="collector-intelligence-title">
                  <div className="bp-section-heading">
                    <div>
                      <span>Sampled current holdings</span>
                      <h2 id="collector-intelligence-title">Collection intelligence</h2>
                    </div>
                    <p>
                      Periods and proposer signals describe the sampled canvases currently held;
                      they do not reconstruct acquisition history.
                    </p>
                  </div>

                  <div className="bp-collector-signal-cards">
                    <article>
                      <BarChart3 size={18} />
                      <span>Longest held-day run</span>
                      <strong>{numberText(collector.signals.longestHeldDayRun)} days</strong>
                      <small>Consecutive token IDs in the sample</small>
                    </article>
                    <article>
                      <Layers3 size={18} />
                      <span>Multiple-edition days</span>
                      <strong>{numberText(collector.signals.multipleEditionDays)}</strong>
                      <small>Sampled days with more than one edition</small>
                    </article>
                    <article>
                      <CalendarDays size={18} />
                      <span>Leading period</span>
                      <strong>{collector.signals.periods[0]?.label ?? "Unavailable"}</strong>
                      <small>
                        {collector.signals.periods[0]
                          ? `${collector.signals.periods[0].percentage}% of the sample`
                          : "No period metadata"}
                      </small>
                    </article>
                    <article>
                      <ShieldCheck size={18} />
                      <span>Intelligence coverage</span>
                      <strong>{confidenceLabel(collector.coverage.confidence)}</strong>
                      <small>{collector.coverage.samplePercentage}% of held days sampled</small>
                    </article>
                  </div>

                  <div className="bp-collector-signal-panels">
                    <article>
                      <div>
                        <span>Period profile</span>
                        <small>Share of sampled held days</small>
                      </div>
                      <ol>
                        {collector.signals.periods.map((period) => (
                          <li key={period.label}>
                            <div>
                              <strong>{period.label}</strong>
                              <span>
                                Days {numberText(period.startDay)}–{numberText(period.endDay)}
                              </span>
                            </div>
                            <i aria-hidden="true">
                              <b style={{ width: `${period.percentage}%` }} />
                            </i>
                            <em>
                              {numberText(period.canvasCount)} · {period.percentage}%
                            </em>
                          </li>
                        ))}
                      </ol>
                    </article>

                    <article>
                      <div>
                        <span>Recurring theme proposers</span>
                        <small>Share with proposer metadata · not artist attribution</small>
                      </div>
                      {collector.signals.themeProposers.length ? (
                        <ol>
                          {collector.signals.themeProposers.map((entry) => (
                            <li key={entry.proposer}>
                              <div>
                                <strong>{shortIdentity(entry.proposer)}</strong>
                                <span>Public proposer identity</span>
                              </div>
                              <i aria-hidden="true">
                                <b style={{ width: `${entry.percentage}%` }} />
                              </i>
                              <em>
                                {numberText(entry.canvasCount)} · {entry.percentage}%
                              </em>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>No theme-proposer metadata was returned for this sample.</p>
                      )}
                    </article>
                  </div>
                </section>

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
                      {" "}Percentages use canvases with palette metadata.
                    </p>
                  </div>

                  {collector.dominantPalette.length ? (
                    <ol className="bp-collector-colors">
                      {collector.dominantPalette.map((entry) => (
                        <li key={entry.color}>
                          <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
                          <strong>{entry.color}</strong>
                          <span>
                            {numberText(entry.canvasCount)} canvases · {entry.percentage}%
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="bp-artist-empty">No palette metadata was returned for this sample.</div>
                  )}
                </section>

                <section className="bp-collector-recommendations" aria-labelledby="collector-recommendations-title">
                  <div className="bp-section-heading">
                    <div>
                      <span>Deterministic discovery</span>
                      <h2 id="collector-recommendations-title">Recommended canvases</h2>
                    </div>
                    <p>
                      Up to three recent canvases ranked by the evidence shown below. Discovery
                      matches only — not financial advice.
                    </p>
                  </div>

                  {collector.recommendations.length ? (
                    <div className="bp-collector-recommendation-grid">
                      {collector.recommendations.map((recommendation) => (
                        <article className="bp-collector-recommendation" key={recommendation.day}>
                          <a href={basePaintCanvasScoutUrl(recommendation.day)}>
                            <img
                              src={basePaintArtworkUrl(recommendation.day)}
                              alt={recommendation.name ?? `BasePaint day ${recommendation.day}`}
                              loading="lazy"
                              decoding="async"
                            />
                          </a>
                          <div className="bp-collector-recommendation-copy">
                            <div className="bp-collector-recommendation-meta">
                              <span>Day #{numberText(recommendation.day)}</span>
                              <b className={recommendation.phase}>
                                {recommendationPhaseLabel(recommendation.phase)}
                              </b>
                            </div>
                            <h3>{recommendation.name ?? `Canvas #${numberText(recommendation.day)}`}</h3>
                            <div className="bp-collector-match-score">
                              <Target size={15} />
                              <strong>{recommendation.matchScore}/100 evidence match</strong>
                            </div>
                            <h4>Why this canvas</h4>
                            <ul>
                              {recommendation.evidence.map((entry) => (
                                <li key={entry.code}>
                                  <Check size={13} />
                                  <span>
                                    <strong>{entry.label}</strong>
                                    {entry.detail}
                                  </span>
                                  <em>+{entry.weight}</em>
                                </li>
                              ))}
                            </ul>
                            <a className="bp-collector-recommendation-link" href={basePaintCanvasScoutUrl(recommendation.day)}>
                              Open Canvas Scout
                              <ArrowUpRight size={14} />
                            </a>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="bp-artist-empty">
                      No recent canvas has enough visible overlap with this sample to recommend.
                    </div>
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
              <strong>{confidenceLabel(collector.coverage.confidence)} coverage</strong>
              <span>
                Sampled {numberText(collector.coverage.sampledCanvasDays)} of {numberText(collector.coverage.totalCanvasDays)} held days ({collector.coverage.samplePercentage}%)
              </span>
              <span>
                Palette metadata {numberText(collector.coverage.paletteMetadataDays)}/{numberText(collector.coverage.sampledCanvasDays)} · theme proposer {numberText(collector.coverage.proposerMetadataDays)}/{numberText(collector.coverage.sampledCanvasDays)}
              </span>
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
