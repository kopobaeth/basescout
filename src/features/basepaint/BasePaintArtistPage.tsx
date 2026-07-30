import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Brush,
  CalendarDays,
  Check,
  CircleUserRound,
  Coins,
  Copy,
  ExternalLink,
  Flame,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { loadBasePaintArtist } from "./client";
import {
  basePaintArtworkUrl,
  basePaintCanvasScoutUrl
} from "./data";
import {
  basePaintDayDateText,
  ethFromWei,
  numberText,
  shortIdentity
} from "./format";
import type { BasePaintArtistResponse } from "./types";

type ArtistLoadStatus = "loading" | "success" | "error";

function dayLabel(day: number | null) {
  return day ? `Day #${day}` : "—";
}

export function BasePaintArtistPage({ address }: { address: string }) {
  const [artist, setArtist] = useState<BasePaintArtistResponse | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<ArtistLoadStatus>("loading");

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

    document.title = `${shortIdentity(address)} BasePaint Artist | BaseScout`;
    canonical.href = new URL(`/basepaint/artist/${encodeURIComponent(address)}`, window.location.origin).toString();
    if (description) {
      description.content = "Explore a BasePaint artist’s public onchain contributions, streaks, brushes, and recent canvases.";
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

    void loadBasePaintArtist(address, controller.signal)
      .then((result) => {
        setArtist(result);
        setStatus("success");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setArtist(null);
        setError(requestError instanceof Error ? requestError.message : "BasePaint artist data could not be loaded.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [address, reloadKey]);

  const averagePixels = artist?.totalDaysPainted
    ? Math.round(artist.totalPixels / artist.totalDaysPainted)
    : 0;
  const profilePixels = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => {
        const offset = 2 + (index % 8) * 2;
        const byte = Number.parseInt(address.slice(offset, offset + 2), 16);
        return Number.isFinite(byte) ? byte % 3 : 0;
      }),
    [address]
  );

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(artist?.address ?? address);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_500);
    } catch {
      setCopyState("idle");
    }
  }

  return (
    <main className="bp-app">
      <header className="bp-header">
        <nav className="bp-nav" aria-label="BasePaint artist navigation">
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
            <a className="active" href="/basepaint#pulse">
              Artists
            </a>
            <a href="/basepaint#gallery">Gallery</a>
            <a href="https://basepaint.xyz/" target="_blank" rel="noopener noreferrer">
              BasePaint <ExternalLink size={14} />
            </a>
          </div>

          <a className="bp-back" href="/basepaint#pulse">
            <ArrowLeft size={15} />
            Canvas Pulse
          </a>
        </nav>
      </header>

      <div className="bp-page bp-artist-page">
        <div className="bp-context">
          <span>Independent read-only artist profile</span>
          <span className={`bp-provider ${status === "success" ? "available" : "pending"}`}>
            <span aria-hidden="true" />
            Public indexer
          </span>
        </div>

        {status === "loading" ? (
          <section className="bp-artist-loading" aria-live="polite">
            <Loader2 className="spin" size={30} />
            <strong>Loading Artist Scout</strong>
            <span>Reading public BasePaint contributions and brushes.</span>
          </section>
        ) : status === "error" ? (
          <section className="bp-artist-error" role="alert">
            <CircleUserRound size={34} />
            <div>
              <span>Artist Scout</span>
              <h1>Profile unavailable</h1>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw size={15} />
              Retry
            </button>
            <a href="/basepaint#pulse">
              Return to Canvas Pulse
              <ArrowUpRight size={15} />
            </a>
          </section>
        ) : artist ? (
          <>
            <section className="bp-artist-hero">
              <div className="bp-artist-identity">
                <div className="bp-artist-avatar" aria-hidden="true">
                  {profilePixels.map((tone, index) => (
                    <span className={`tone-${tone}`} key={index} />
                  ))}
                </div>

                <div>
                  <div className="bp-kicker">
                    <Sparkles size={16} />
                    Artist Scout
                  </div>
                  <h1>{shortIdentity(artist.address)}</h1>
                  <p>{artist.address}</p>
                  <div className="bp-artist-actions">
                    <button type="button" onClick={copyAddress}>
                      {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}
                      {copyState === "copied" ? "Copied" : "Copy address"}
                    </button>
                    <a
                      href={`https://basescan.org/address/${artist.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      BaseScan
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>

              <dl className="bp-artist-primary-stats">
                <div>
                  <ImageIcon size={20} />
                  <dt>Total pixels</dt>
                  <dd>{numberText(artist.totalPixels)}</dd>
                </div>
                <div>
                  <CalendarDays size={20} />
                  <dt>Days painted</dt>
                  <dd>{numberText(artist.totalDaysPainted)}</dd>
                </div>
                <div>
                  <Flame size={20} />
                  <dt>Current streak</dt>
                  <dd>{numberText(artist.streak)}</dd>
                </div>
                <div>
                  <Sparkles size={20} />
                  <dt>Longest streak</dt>
                  <dd>{numberText(artist.longestStreak)}</dd>
                </div>
              </dl>
            </section>

            <dl className="bp-artist-secondary-stats">
              <div>
                <dt>Last painted</dt>
                <dd>{dayLabel(artist.lastPaintedDay)}</dd>
              </div>
              <div>
                <dt>Average per day</dt>
                <dd>{averagePixels ? `${numberText(averagePixels)} px` : "—"}</dd>
              </div>
              <div>
                <dt>Indexed earnings</dt>
                <dd>{ethFromWei(artist.totalEarnedWei)}</dd>
              </div>
              <div>
                <dt>Withdrawn</dt>
                <dd>{ethFromWei(artist.totalWithdrawnWei)}</dd>
              </div>
            </dl>

            <section className="bp-artist-section">
              <div className="bp-section-heading">
                <div>
                  <span>Public contribution history</span>
                  <h2>Recent canvases</h2>
                </div>
              </div>

              {artist.recentContributions.length ? (
                <div className="bp-contribution-grid">
                  {artist.recentContributions.map((contribution) => (
                    <article className="bp-contribution-card" key={contribution.day}>
                      <a
                        href={basePaintCanvasScoutUrl(contribution.day)}
                      >
                        <img
                          alt={`BasePaint day ${contribution.day}`}
                          decoding="async"
                          loading="lazy"
                          src={basePaintArtworkUrl(contribution.day)}
                        />
                      </a>
                      <div>
                        <span>{basePaintDayDateText(contribution.day)}</span>
                        <strong>Day #{contribution.day}</strong>
                        <p>{numberText(contribution.pixelsCount)} pixels contributed</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="bp-artist-empty">No indexed canvas contributions were returned.</div>
              )}
            </section>

            <section className="bp-artist-section">
              <div className="bp-section-heading">
                <div>
                  <span>Onchain painting tools</span>
                  <h2>Artist brushes</h2>
                </div>
              </div>

              {artist.brushes.length ? (
                <div className="bp-brush-grid">
                  {artist.brushes.map((brush) => (
                    <article className="bp-brush-card" key={brush.id}>
                      <Brush size={22} />
                      <div>
                        <span>Brush #{brush.id}</span>
                        <strong>{numberText(brush.strength)} px strength</strong>
                      </div>
                      <dl>
                        <div>
                          <dt>Streak</dt>
                          <dd>{numberText(brush.streak)}</dd>
                        </div>
                        <div>
                          <dt>Last used</dt>
                          <dd>{dayLabel(brush.lastUsedDay)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="bp-artist-empty">
                  <Coins size={20} />
                  No currently owned brushes were returned by the indexer.
                </div>
              )}
            </section>
          </>
        ) : null}

        <footer className="bp-footer">
          <span>Public BasePaint data. No API key required.</span>
          <span>BaseScout is an independent explorer.</span>
        </footer>
      </div>
    </main>
  );
}
