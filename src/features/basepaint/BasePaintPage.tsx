import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Brush,
  Clock3,
  ExternalLink,
  Grid3X3,
  Image as ImageIcon,
  Loader2,
  Palette,
  Radio,
  RefreshCw,
  Sparkles,
  Users,
  Zap
} from "lucide-react";
import { BasePaintArtistPage } from "./BasePaintArtistPage";
import { loadBasePaintOverview, loadBasePaintPulse } from "./client";
import {
  basePaintArtistRouteAddress,
  basePaintArtistUrl,
  basePaintArtworkUrl,
  basePaintCanvasUrl
} from "./data";
import { ethFromWei, numberText, shortIdentity } from "./format";
import type {
  BasePaintCanvas,
  BasePaintOverviewResponse,
  BasePaintPulseResponse
} from "./types";
import "./basepaint.css";

type BasePaintLoadStatus = "loading" | "success" | "error";

const CURRENT_CANVAS_IMAGE = "https://basepaint.xyz/api/art/image?day=painting&scale=1";

function usdFromUsd8(value: string) {
  const amount = Number(value) / 100_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount < 100 ? 2 : 0
  }).format(amount);
}

function timestampText(value?: number | null) {
  if (!value) return "No recent strokes";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(value);
}

function pulseLabel(pulse: BasePaintPulseResponse | null) {
  const fiveMinutes = pulse?.windows.find((window) => window.minutes === 5);
  if (!pulse?.latestStrokeAt || Date.now() - pulse.latestStrokeAt > 10 * 60_000) return "Quiet";
  if ((fiveMinutes?.pixels ?? 0) >= 1_000) return "High activity";
  if ((fiveMinutes?.pixels ?? 0) >= 200) return "Active";
  return "Steady";
}

function phaseLabel(day: number, currentDay: number) {
  if (day === currentDay) return "Painting";
  if (day === currentDay - 1) return "Collecting";
  return "Complete";
}

function timeRemaining(endsAt: number, now: number) {
  const totalSeconds = Math.max(0, Math.floor((endsAt - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function Countdown({ endsAt }: { endsAt?: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return <>{endsAt ? timeRemaining(endsAt, now) : "--:--:--"}</>;
}

function ProviderBadge({
  label,
  status
}: {
  label: string;
  status: "available" | "unavailable";
}) {
  return (
    <span className={`bp-provider ${status}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

function CanvasCard({ canvas, currentDay }: { canvas: BasePaintCanvas; currentDay: number }) {
  const title = canvas.name ?? `Canvas #${canvas.day}`;

  return (
    <article className="bp-canvas-card">
      <a
        className="bp-canvas-art"
        href={basePaintCanvasUrl(canvas.day)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open BasePaint day ${canvas.day}: ${title}`}
      >
        <img
          alt={`${title}, BasePaint day ${canvas.day}`}
          decoding="async"
          loading="lazy"
          src={basePaintArtworkUrl(canvas.day)}
        />
        <span className={`bp-phase ${phaseLabel(canvas.day, currentDay).toLowerCase()}`}>
          {phaseLabel(canvas.day, currentDay)}
        </span>
      </a>

      <div className="bp-canvas-copy">
        <div>
          <span className="bp-day-label">Day #{canvas.day}</span>
          <h3>{title}</h3>
        </div>
        <ArrowUpRight aria-hidden="true" size={18} />
      </div>

      <dl className="bp-canvas-stats">
        <div>
          <dt>Artists</dt>
          <dd>{numberText(canvas.totalArtists)}</dd>
        </div>
        <div>
          <dt>Pixels</dt>
          <dd>{numberText(canvas.pixelsCount)}</dd>
        </div>
        <div>
          <dt>Mints</dt>
          <dd>{numberText(canvas.totalMints)}</dd>
        </div>
      </dl>
    </article>
  );
}

function CanvasPulse({
  error,
  onRetry,
  palette,
  pulse,
  status
}: {
  error: string;
  onRetry: () => void;
  palette: string[];
  pulse: BasePaintPulseResponse | null;
  status: BasePaintLoadStatus;
}) {
  const fiveMinutes = pulse?.windows.find((window) => window.minutes === 5);
  const thirtyMinutes = pulse?.windows.find((window) => window.minutes === 30);
  const sixtyMinutes = pulse?.windows.find((window) => window.minutes === 60);
  const cells = new Map(pulse?.heatmap.cells.map((cell) => [`${cell.x}:${cell.y}`, cell.pixels]) ?? []);
  const maxPixels = Math.max(1, ...cells.values());
  const dominantColor =
    pulse?.dominantPaletteIndex !== null && pulse?.dominantPaletteIndex !== undefined
      ? palette[pulse.dominantPaletteIndex]
      : undefined;

  return (
    <section className="bp-pulse" id="pulse">
      <div className="bp-section-heading">
        <div>
          <span>Live onchain activity</span>
          <h2>Canvas Pulse</h2>
        </div>
        <div className={`bp-pulse-status ${status}`}>
          <Radio aria-hidden="true" size={14} />
          {status === "loading"
            ? "Connecting"
            : status === "error"
              ? "Pulse unavailable"
              : `${pulseLabel(pulse)} · ${pulse?.stale ? "cached" : "live"}`}
        </div>
      </div>

      {status === "error" ? (
        <div className="bp-pulse-error" role="status">
          <div>
            <Activity size={22} />
            <span>
              <strong>Live activity could not be loaded</strong>
              {error}
            </span>
          </div>
          <button type="button" onClick={onRetry}>
            <RefreshCw size={14} />
            Retry pulse
          </button>
        </div>
      ) : (
        <>
          <dl className="bp-pulse-metrics" aria-busy={status === "loading"}>
            <div>
              <Zap aria-hidden="true" size={18} />
              <dt>Pixels · 5 min</dt>
              <dd>{pulse ? numberText(fiveMinutes?.pixels ?? 0) : "—"}</dd>
            </div>
            <div>
              <Users aria-hidden="true" size={18} />
              <dt>Artists · 30 min</dt>
              <dd>{pulse ? numberText(thirtyMinutes?.artists ?? 0) : "—"}</dd>
            </div>
            <div>
              <Brush aria-hidden="true" size={18} />
              <dt>Strokes · 60 min</dt>
              <dd>{pulse ? numberText(sixtyMinutes?.strokes ?? 0) : "—"}</dd>
            </div>
            <div>
              <Clock3 aria-hidden="true" size={18} />
              <dt>Latest stroke · UTC</dt>
              <dd>{pulse ? timestampText(pulse.latestStrokeAt) : "—"}</dd>
            </div>
          </dl>

          <div className="bp-pulse-grid">
            <article className="bp-heatmap-panel">
              <div className="bp-pulse-card-heading">
                <div>
                  <Grid3X3 size={17} />
                  <span>
                    <strong>Activity heatmap</strong>
                    Last 60 minutes
                  </span>
                </div>
                {dominantColor ? (
                  <span className="bp-dominant-color">
                    <i style={{ backgroundColor: dominantColor }} />
                    Most used
                  </span>
                ) : null}
              </div>

              {status === "loading" ? (
                <div className="bp-pulse-loading">
                  <Loader2 className="spin" size={25} />
                  Reading BasePaint strokes
                </div>
              ) : (
                <div
                  className="bp-heatmap"
                  role="img"
                  aria-label={`Eight by eight activity heatmap for the last hour with ${numberText(
                    sixtyMinutes?.pixels ?? 0
                  )} pixels`}
                >
                  {Array.from({ length: 64 }, (_, index) => {
                    const x = index % 8;
                    const y = Math.floor(index / 8);
                    const pixels = cells.get(`${x}:${y}`) ?? 0;
                    const intensity = pixels ? 0.18 + (pixels / maxPixels) * 0.82 : 0.035;
                    return (
                      <span
                        aria-hidden="true"
                        key={`${x}:${y}`}
                        style={{ opacity: intensity }}
                        title={`${pixels} pixels`}
                      />
                    );
                  })}
                </div>
              )}

              <div className="bp-heatmap-legend">
                <span>Less activity</span>
                <i />
                <span>More activity</span>
              </div>
            </article>

            <article className="bp-artists-panel">
              <div className="bp-pulse-card-heading">
                <div>
                  <Users size={17} />
                  <span>
                    <strong>Active artists</strong>
                    Ranked by pixels · 60 min
                  </span>
                </div>
              </div>

              {status === "loading" ? (
                <div className="bp-pulse-loading">
                  <Loader2 className="spin" size={25} />
                  Finding contributors
                </div>
              ) : pulse?.topArtists.length ? (
                <ol className="bp-artist-list">
                  {pulse.topArtists.map((artist, index) => (
                    <li key={artist.address}>
                      <span className="bp-artist-rank">{String(index + 1).padStart(2, "0")}</span>
                      <a href={basePaintArtistUrl(artist.address)}>
                        {shortIdentity(artist.address)}
                        <ArrowUpRight size={13} />
                      </a>
                      <span>
                        <strong>{numberText(artist.pixels)} px</strong>
                        {numberText(artist.strokes)} strokes
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="bp-pulse-empty">
                  The canvas has been quiet during the last hour. Pulse will update automatically.
                </div>
              )}
            </article>
          </div>

          {pulse?.truncated ? (
            <p className="bp-pulse-note">Very high activity: Pulse is based on the latest 250 strokes.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function BasePaintOverviewPage() {
  const [data, setData] = useState<BasePaintOverviewResponse | null>(null);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState<BasePaintPulseResponse | null>(null);
  const [pulseError, setPulseError] = useState("");
  const [pulseReloadKey, setPulseReloadKey] = useState(0);
  const [pulseStatus, setPulseStatus] = useState<BasePaintLoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<BasePaintLoadStatus>("loading");

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

    document.title = "BasePaint Explorer | BaseScout";
    canonical.href = new URL("/basepaint", window.location.origin).toString();
    if (description) {
      description.content = "Explore today's BasePaint canvas, public onchain activity, and recent CC0 artwork.";
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError("");

    void loadBasePaintOverview(controller.signal)
      .then((overview) => {
        setData(overview);
        setStatus("success");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "BasePaint data could not be loaded.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let requestController: AbortController | null = null;

    const refreshPulse = async (initial: boolean) => {
      if (inFlight) return;
      inFlight = true;
      requestController = new AbortController();
      if (initial) setPulseStatus("loading");
      setPulseError("");

      try {
        const activity = await loadBasePaintPulse(requestController.signal);
        if (!active) return;
        setPulse(activity);
        setPulseStatus("success");
      } catch (requestError: unknown) {
        if (!active || requestController.signal.aborted) return;
        setPulseError(
          requestError instanceof Error ? requestError.message : "BasePaint activity could not be loaded."
        );
        setPulseStatus("error");
      } finally {
        inFlight = false;
      }
    };

    void refreshPulse(true);
    const intervalId = window.setInterval(() => void refreshPulse(false), 30_000);

    return () => {
      active = false;
      requestController?.abort();
      window.clearInterval(intervalId);
    };
  }, [pulseReloadKey]);

  const currentCanvas = data?.canvases.find((canvas) => canvas.day === data.currentDay);
  const collectCanvas = data?.canvases.find((canvas) => canvas.day === data.currentDay - 1);
  const galleryCanvases = data?.canvases.filter((canvas) => canvas.day < data.currentDay).slice(0, 12) ?? [];
  const themeName = data?.theme?.theme ?? currentCanvas?.name ?? "Today's canvas";
  const themePalette = data?.theme?.palette.length ? data.theme.palette : (currentCanvas?.palette ?? []);
  const canvasSize = data?.theme?.size ?? currentCanvas?.size;
  const isLoading = status === "loading";

  return (
    <main className="bp-app">
      <header className="bp-header">
        <nav className="bp-nav" aria-label="BasePaint explorer navigation">
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
            <a className="active" href="#today">
              Today
            </a>
            <a href="#pulse">Pulse</a>
            <a href="#gallery">Gallery</a>
            <a href="https://basepaint.xyz/" target="_blank" rel="noopener noreferrer">
              BasePaint <ExternalLink size={14} />
            </a>
          </div>

          <a className="bp-back" href="/">
            <ArrowLeft size={15} />
            Token scanner
          </a>
        </nav>
      </header>

      <div className="bp-page">
        <div className="bp-context">
          <span>Independent read-only explorer</span>
          <div>
            {data ? (
              <>
                <ProviderBadge label="Indexer" status={data.providers.indexer.status} />
                <ProviderBadge label="Theme API" status={data.providers.theme.status} />
                <ProviderBadge
                  label="Pulse"
                  status={pulseStatus === "success" ? "available" : "unavailable"}
                />
              </>
            ) : (
              <span className="bp-provider pending">
                <span aria-hidden="true" />
                Public data
              </span>
            )}
          </div>
        </div>

        <section className="bp-hero" id="today">
          <div className="bp-current-art">
            <div className="bp-frame-label">
              <span>{data ? `Day #${data.currentDay}` : "Current canvas"}</span>
              <span>Live</span>
            </div>
            <div className="bp-art-frame">
              {isLoading ? (
                <div className="bp-art-placeholder">
                  <Loader2 className="spin" size={32} />
                  <span>Loading today’s canvas</span>
                </div>
              ) : (
                <img
                  alt={`Current BasePaint canvas: ${themeName}`}
                  decoding="async"
                  src={CURRENT_CANVAS_IMAGE}
                />
              )}
            </div>
          </div>

          <div className="bp-today-panel">
            <div className="bp-kicker">
              <Sparkles size={16} />
              The Internet’s Daily Canvas
            </div>

            {status === "error" ? (
              <div className="bp-error" role="alert">
                <ImageIcon size={24} />
                <strong>BasePaint data is unavailable</strong>
                <span>{error}</span>
                <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                  <RefreshCw size={15} />
                  Retry
                </button>
              </div>
            ) : (
              <>
                <h1>{isLoading ? "Loading today’s theme…" : themeName}</h1>
                <p className="bp-theme-meta">
                  Proposed by <strong>{shortIdentity(data?.theme?.proposer ?? currentCanvas?.proposer)}</strong>
                </p>

                <div className="bp-countdown">
                  <span>
                    <Clock3 size={17} />
                    Painting ends in
                  </span>
                  <strong>
                    <Countdown endsAt={data?.phaseEndsAt} />
                  </strong>
                </div>

                <dl className="bp-primary-stats">
                  <div>
                    <Users size={19} />
                    <dt>Artists</dt>
                    <dd>{currentCanvas ? numberText(currentCanvas.totalArtists) : "—"}</dd>
                  </div>
                  <div>
                    <Brush size={19} />
                    <dt>Pixels painted</dt>
                    <dd>{currentCanvas ? numberText(currentCanvas.pixelsCount) : "—"}</dd>
                  </div>
                  <div>
                    <ImageIcon size={19} />
                    <dt>Canvas</dt>
                    <dd>{canvasSize ? `${canvasSize} × ${canvasSize}` : "—"}</dd>
                  </div>
                  <div>
                    <Palette size={19} />
                    <dt>Colors</dt>
                    <dd>{themePalette.length || "—"}</dd>
                  </div>
                </dl>

                <div className="bp-palette" aria-label="Today's color palette">
                  {themePalette.length
                    ? themePalette.map((color) => (
                        <span key={color} style={{ backgroundColor: color }} title={color} />
                      ))
                    : Array.from({ length: 6 }, (_, index) => <span className="placeholder" key={index} />)}
                </div>

                <div className="bp-actions">
                  <a
                    className="bp-button primary"
                    href="https://basepaint.xyz/paint"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Paint on BasePaint
                    <ExternalLink size={16} />
                  </a>
                  <a
                    className="bp-button secondary"
                    href="https://basepaint.xyz/mint"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Collect day #{data ? data.currentDay - 1 : "—"}
                  </a>
                </div>
              </>
            )}
          </div>
        </section>

        {collectCanvas ? (
          <section className="bp-collect-strip" aria-label="Current BasePaint collection">
            <div>
              <span>Now collecting</span>
              <strong>
                Day #{collectCanvas.day}: {collectCanvas.name ?? "Finished canvas"}
              </strong>
            </div>
            <dl>
              <div>
                <dt>Mints</dt>
                <dd>{numberText(collectCanvas.totalMints)}</dd>
              </div>
              <div>
                <dt>Artists</dt>
                <dd>{numberText(collectCanvas.totalArtists)}</dd>
              </div>
              <div>
                <dt>Earned</dt>
                <dd title={ethFromWei(collectCanvas.totalEarnedWei)}>
                  {usdFromUsd8(collectCanvas.totalEarnedUsd8)}
                </dd>
              </div>
            </dl>
            <a href={basePaintCanvasUrl(collectCanvas.day)} target="_blank" rel="noopener noreferrer">
              View canvas
              <ArrowUpRight size={17} />
            </a>
          </section>
        ) : null}

        <CanvasPulse
          error={pulseError}
          onRetry={() => setPulseReloadKey((key) => key + 1)}
          palette={themePalette}
          pulse={pulse}
          status={pulseStatus}
        />

        <section className="bp-gallery" id="gallery">
          <div className="bp-section-heading">
            <div>
              <span>CC0 onchain art</span>
              <h2>Recent canvases</h2>
            </div>
            <a href="https://basepaint.xyz/gallery" target="_blank" rel="noopener noreferrer">
              Full BasePaint gallery
              <ExternalLink size={15} />
            </a>
          </div>

          {isLoading ? (
            <div className="bp-gallery-loading">
              <Loader2 className="spin" size={24} />
              Loading recent canvases
            </div>
          ) : galleryCanvases.length ? (
            <div className="bp-gallery-grid">
              {galleryCanvases.map((canvas) => (
                <CanvasCard canvas={canvas} currentDay={data?.currentDay ?? canvas.day} key={canvas.day} />
              ))}
            </div>
          ) : status !== "error" ? (
            <div className="bp-gallery-loading">No recent canvases were returned.</div>
          ) : null}
        </section>

        <footer className="bp-footer">
          <span>Public BasePaint data. No API key required.</span>
          <span>Artwork is CC0. BaseScout is an independent explorer.</span>
        </footer>
      </div>
    </main>
  );
}

export function BasePaintPage() {
  const artistAddress = basePaintArtistRouteAddress(window.location.pathname);
  return artistAddress !== undefined ? (
    <BasePaintArtistPage address={artistAddress} />
  ) : (
    <BasePaintOverviewPage />
  );
}
