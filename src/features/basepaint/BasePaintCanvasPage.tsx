import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Brush,
  CalendarDays,
  Coins,
  ExternalLink,
  Flame,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Users
} from "lucide-react";
import { loadBasePaintCanvas } from "./client";
import {
  basePaintArtistUrl,
  basePaintArtworkUrl,
  basePaintCanvasScoutUrl,
  basePaintCanvasUrl
} from "./data";
import {
  basePaintDayDateText,
  ethFromWei,
  numberText,
  shortIdentity,
  usdFromUsd8,
  utcDateTimeText
} from "./format";
import type {
  BasePaintCanvasPhase,
  BasePaintCanvasResponse
} from "./types";

type CanvasLoadStatus = "loading" | "success" | "error";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const CURRENT_CANVAS_IMAGE = "https://basepaint.xyz/api/art/image?day=painting&scale=1";

function phaseLabel(phase: BasePaintCanvasPhase) {
  if (phase === "painting") return "Painting";
  if (phase === "collecting") return "Collecting";
  return "Complete";
}

function canvasImageUrl(canvas: BasePaintCanvasResponse) {
  return canvas.phase === "painting"
    ? CURRENT_CANVAS_IMAGE
    : basePaintArtworkUrl(canvas.canvas.day);
}

function proposerContent(proposer?: string) {
  if (!proposer) return "Unknown";
  return ADDRESS_PATTERN.test(proposer) ? (
    <a href={basePaintArtistUrl(proposer)}>{shortIdentity(proposer)}</a>
  ) : (
    proposer
  );
}

export function BasePaintCanvasPage({ day }: { day: number | null }) {
  const [canvas, setCanvas] = useState<BasePaintCanvasResponse | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<CanvasLoadStatus>("loading");

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

    document.title = day ? `BasePaint Day #${day} | BaseScout` : "BasePaint Canvas | BaseScout";
    canonical.href = new URL(`/basepaint/canvas/${day ?? ""}`, window.location.origin).toString();
    if (description) {
      description.content =
        "Explore a BasePaint canvas, its public onchain statistics, top contributors, and recent activity.";
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
  }, [day]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError("");

    void loadBasePaintCanvas(day, controller.signal)
      .then((result) => {
        setCanvas(result);
        setStatus("success");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setCanvas(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "BasePaint canvas data could not be loaded."
        );
        setStatus("error");
      });

    return () => controller.abort();
  }, [day, reloadKey]);

  const largestContribution = Math.max(
    1,
    ...(canvas?.topContributors.map((contributor) => contributor.pixelsCount) ?? [])
  );

  return (
    <main className="bp-app">
      <header className="bp-header">
        <nav className="bp-nav" aria-label="BasePaint canvas navigation">
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
            <a className="active" href="/basepaint#gallery">
              Gallery
            </a>
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

      <div className="bp-page bp-canvas-page">
        <div className="bp-context">
          <span>Independent read-only canvas intelligence</span>
          <span className={`bp-provider ${status === "success" ? "available" : "pending"}`}>
            <span aria-hidden="true" />
            Public indexer
          </span>
        </div>

        {status === "loading" ? (
          <section className="bp-artist-loading" aria-live="polite">
            <Loader2 className="spin" size={30} />
            <strong>Loading Canvas Scout</strong>
            <span>Reading public BasePaint canvas and contribution data.</span>
          </section>
        ) : status === "error" ? (
          <section className="bp-artist-error" role="alert">
            <ImageIcon size={34} />
            <div>
              <span>Canvas Scout</span>
              <h1>Canvas unavailable</h1>
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
        ) : canvas ? (
          <>
            <section className="bp-canvas-hero">
              <div className="bp-canvas-hero-art">
                <div className="bp-frame-label">
                  <span>Day #{canvas.canvas.day}</span>
                  <span>{phaseLabel(canvas.phase)}</span>
                </div>
                <div className="bp-canvas-frame">
                  <img
                    alt={`${canvas.canvas.name ?? `BasePaint day ${canvas.canvas.day}`}, BasePaint canvas`}
                    decoding="async"
                    src={canvasImageUrl(canvas)}
                  />
                </div>
              </div>

              <div className="bp-canvas-summary">
                <div className="bp-kicker">
                  <Sparkles size={16} />
                  Canvas Scout
                </div>
                <span className={`bp-canvas-phase ${canvas.phase}`}>{phaseLabel(canvas.phase)}</span>
                <h1>{canvas.canvas.name ?? `Canvas #${canvas.canvas.day}`}</h1>
                <p className="bp-canvas-date">
                  <CalendarDays size={15} />
                  {basePaintDayDateText(canvas.canvas.day)}
                </p>
                <p className="bp-canvas-proposer">
                  Proposed by <strong>{proposerContent(canvas.canvas.proposer)}</strong>
                </p>

                <div className="bp-palette" aria-label="Canvas color palette">
                  {canvas.canvas.palette.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} title={color} />
                  ))}
                </div>

                <div className="bp-canvas-actions">
                  <a
                    className="bp-button primary"
                    href={
                      canvas.phase === "painting"
                        ? "https://basepaint.xyz/paint"
                        : basePaintCanvasUrl(canvas.canvas.day)
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {canvas.phase === "painting" ? "Paint on BasePaint" : "Open on BasePaint"}
                    <ExternalLink size={15} />
                  </a>
                  {canvas.phase === "collecting" ? (
                    <a
                      className="bp-button secondary"
                      href="https://basepaint.xyz/mint"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Collect this canvas
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>

                <nav className="bp-canvas-day-nav" aria-label="Browse BasePaint canvases">
                  {canvas.canvas.day > 1 ? (
                    <a href={basePaintCanvasScoutUrl(canvas.canvas.day - 1)}>
                      <ArrowLeft size={14} />
                      Day #{canvas.canvas.day - 1}
                    </a>
                  ) : (
                    <span />
                  )}
                  {canvas.canvas.day < canvas.currentDay ? (
                    <a href={basePaintCanvasScoutUrl(canvas.canvas.day + 1)}>
                      Day #{canvas.canvas.day + 1}
                      <ArrowRight size={14} />
                    </a>
                  ) : null}
                </nav>
              </div>
            </section>

            <dl className="bp-canvas-stats-grid">
              <div>
                <Users size={19} />
                <dt>Artists</dt>
                <dd>{numberText(canvas.canvas.totalArtists)}</dd>
              </div>
              <div>
                <Brush size={19} />
                <dt>Pixels</dt>
                <dd>{numberText(canvas.canvas.pixelsCount)}</dd>
              </div>
              <div>
                <ImageIcon size={19} />
                <dt>Mints</dt>
                <dd>{numberText(canvas.canvas.totalMints)}</dd>
              </div>
              <div>
                <Flame size={19} />
                <dt>Burns</dt>
                <dd>{numberText(canvas.canvas.totalBurns)}</dd>
              </div>
              <div>
                <Coins size={19} />
                <dt>Earned</dt>
                <dd title={ethFromWei(canvas.canvas.totalEarnedWei)}>
                  {usdFromUsd8(canvas.canvas.totalEarnedUsd8)}
                </dd>
              </div>
              <div>
                <Palette size={19} />
                <dt>Canvas</dt>
                <dd>
                  {canvas.canvas.size} × {canvas.canvas.size}
                </dd>
              </div>
            </dl>

            <div className="bp-canvas-intelligence-grid">
              <section className="bp-canvas-panel">
                <div className="bp-section-heading">
                  <div>
                    <span>Full canvas totals</span>
                    <h2>Top contributors</h2>
                  </div>
                </div>

                {canvas.topContributors.length ? (
                  <ol className="bp-contributor-list">
                    {canvas.topContributors.map((contributor, index) => {
                      const canvasShare = canvas.canvas.pixelsCount
                        ? (contributor.pixelsCount / canvas.canvas.pixelsCount) * 100
                        : 0;
                      return (
                        <li key={contributor.address}>
                          <span className="bp-contributor-rank">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <a href={basePaintArtistUrl(contributor.address)}>
                              {shortIdentity(contributor.address)}
                              <ArrowUpRight size={13} />
                            </a>
                            <span className="bp-contribution-track" aria-hidden="true">
                              <i
                                style={{
                                  width: `${Math.max(3, (contributor.pixelsCount / largestContribution) * 100)}%`
                                }}
                              />
                            </span>
                          </div>
                          <span>
                            <strong>{numberText(contributor.pixelsCount)} px</strong>
                            {canvasShare.toFixed(1)}% of canvas
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="bp-artist-empty">No indexed contributors were returned.</div>
                )}
              </section>

              <section className="bp-canvas-panel">
                <div className="bp-section-heading">
                  <div>
                    <span>Latest indexed transactions</span>
                    <h2>Recent activity</h2>
                  </div>
                </div>

                {canvas.recentStrokes.length ? (
                  <ol className="bp-stroke-list">
                    {canvas.recentStrokes.map((stroke) => (
                      <li key={stroke.id}>
                        <div>
                          <a href={basePaintArtistUrl(stroke.address)}>
                            {shortIdentity(stroke.address)}
                          </a>
                          <span>{utcDateTimeText(stroke.paintedAt)} UTC</span>
                        </div>
                        <div>
                          <span>Brush #{stroke.brushId || "—"}</span>
                          <strong>{numberText(stroke.pixelsCount)} px</strong>
                          <a
                            aria-label={`Open transaction ${stroke.transactionHash} on BaseScan`}
                            href={`https://basescan.org/tx/${stroke.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Transaction
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="bp-artist-empty">No indexed strokes were returned.</div>
                )}

                <p className="bp-canvas-data-note">
                  Showing up to {canvas.recentStrokeLimit} latest indexed strokes. Canvas totals
                  above cover the full day.
                </p>
              </section>
            </div>
          </>
        ) : null}

        <footer className="bp-footer">
          <span>Public BasePaint data. No API key required.</span>
          <span>Artwork is CC0. BaseScout is an independent explorer.</span>
        </footer>
      </div>
    </main>
  );
}
