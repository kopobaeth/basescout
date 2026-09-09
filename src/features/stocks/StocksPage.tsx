import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  Copy,
  Search,
  RefreshCw,
  ShieldCheck,
  Layers,
} from "lucide-react";
import {
  STOCKS,
  STOCK_SOURCE,
  CATALOG_CHECKED,
  findStock,
  stockPath,
  type StockSnapshot,
} from "./catalog";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "../../theme";
import { trackEvent } from "../../analytics";
import "./stocks.css";
const SAVE_KEY = "basescout.stocks.saved";
function readSaved(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter(
          (a): a is string => typeof a === "string" && !!findStock(a),
        )
      : [];
  } catch {
    return [];
  }
}
const money = (n?: number) =>
  n === undefined
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n < 1 ? 6 : 2,
      }).format(n);

const STOCK_LOGOS: Record<
  string,
  { color: string; path?: string; label?: string; tiles?: boolean }
> = {
  AAPLc: {
    color: "#8e99a8",
    path: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  },
  AMZNc: { color: "#ff9900", label: "a" },
  COINc: { color: "#1652f0", label: "C" },
  CRCLc: {
    color: "#00d395",
    path: "M20.788 3.832A11.903 11.903 0 0 0 12 0a12 12 0 1 0 8.788 3.832ZM12 4.589A7.411 7.411 0 1 1 4.589 12 7.42 7.42 0 0 1 12 4.589Zm0 1.75A5.661 5.661 0 1 0 17.661 12 5.667 5.667 0 0 0 12 6.339Z",
  },
  GOOGLc: {
    color: "#4285f4",
    path: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  },
  INTCc: { color: "#00c7fd", label: "intel" },
  METAc: {
    color: "#0866ff",
    path: "M6.915 4.03C2.724 4.03 0 9.695 0 14.449c0 3.323 1.305 5.521 4.439 5.521 2.799 0 4.073-2.351 6.628-6.764l.942-1.664c.061.1.121.196.183.3l2.152 3.595c1.878 3.139 3.312 4.534 5.53 4.534C22.456 19.971 24 18.128 24 14.41c0-5.254-2.746-10.38-6.8-10.38-2.156 0-3.937 1.836-5.853 4.358-1.952-2.477-3.103-4.358-4.432-4.358Zm.041 2.606c1.265 0 2.375 1.326 3.827 3.026-1.734 2.662-3.634 6.72-5.057 7.536-1.518.87-3.133-.135-3.133-2.656 0-3.62 1.716-7.906 4.363-7.906Zm10.12-.553c2.517 0 4.638 4.039 4.638 8.399 0 2.016-.624 2.9-1.839 2.9-1.279 0-2.312-1.827-5.113-6.39 1.574-2.486 2.618-4.909 4.314-4.909Z",
  },
  MSFTc: { color: "#00a4ef", tiles: true },
  MSTRc: { color: "#ff3b30", label: "M" },
  NVDAc: {
    color: "#76b900",
    path: "M8.948 8.798v-1.43c4.243-.251 6.917 3.356 6.917 3.356s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952c-.273 0-.54.012-.796.035Zm0-4.735v2.138C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936s2.164-3.197 6.492-3.533V4.063Zm0 15.874H24V4.063H8.948v2.138c5.876-.406 9.434 4.443 9.434 4.443s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097l-.009 4.426Z",
  },
  SNDKc: { color: "#ed1c24", label: "S" },
  SPCXc: {
    color: "#8b9bb4",
    path: "M24 7.417C8.882 8.287 1.89 14.75.321 16.28L0 16.583h2.797C10.356 9.005 21.222 7.663 24 7.417Zm-17.046 6.35c-.472.321-.945.68-1.398 1.02l2.457 1.796h2.778zM2.948 10.8H.189l3.25 2.381c.473-.321 1.02-.661 1.512-.945Z",
  },
  TSLAc: {
    color: "#e82127",
    path: "M12 5.362 14.475 2.336s4.245.09 8.471 2.054c-1.082 1.636-3.231 2.438-3.231 2.438-.146-1.439-1.154-1.79-4.354-1.79L12 24 8.619 5.034c-3.18 0-4.188.354-4.335 1.792 0 0-2.146-.795-3.229-2.43C5.28 2.431 9.525 2.34 9.525 2.34L12 5.362ZM12 1.463c3.415-.03 7.326.528 11.328 2.28.535-.968.672-1.395.672-1.395C19.625.612 15.528.015 12 0 8.472.015 4.375.61 0 2.349c0 0 .195.525.672 1.396C4.674 1.989 8.585 1.435 12 1.46Z",
  },
};

function StockLogo({
  symbol,
  large = false,
}: {
  symbol: string;
  large?: boolean;
}) {
  const logo = STOCK_LOGOS[symbol] ?? {
    color: "#0052ff",
    label: symbol.slice(0, 2),
  };
  return (
    <span
      className={`stock-logo${large ? " stock-logo-large" : ""}`}
      style={{ "--stock-color": logo.color } as CSSProperties}
      aria-hidden="true"
    >
      {logo.tiles ? (
        <svg viewBox="0 0 24 24">
          <path d="M2 2h9v9H2V2Zm11 0h9v9h-9V2ZM2 13h9v9H2v-9Zm11 0h9v9h-9v-9Z" />
        </svg>
      ) : logo.path ? (
        <svg viewBox="0 0 24 24">
          <path d={logo.path} />
        </svg>
      ) : (
        <strong>{logo.label}</strong>
      )}
    </span>
  );
}
export function StocksPage() {
  const route = window.location.pathname.split("/").filter(Boolean);
  const selected = route.length === 2 ? findStock(route[1]) : undefined;
  const invalidRoute = route.length > 1 && !selected;
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(readSaved);
  const [onlySaved, setOnlySaved] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [snapshot, setSnapshot] = useState<StockSnapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => applyThemePreference(theme), [theme]);
  useEffect(() => {
    document.title = `${selected?.symbol ?? "Tokenized Stocks"} | BaseScout`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      "Research Coinbase tokenized stocks on Base: official addresses, market context, and B20 mechanics.",
    );
    const canonical = document.querySelector('link[rel="canonical"]');
    canonical?.setAttribute(
      "href",
      new URL(
        selected ? stockPath(selected.address) : "/stocks",
        location.origin,
      ).href,
    );
    trackEvent(
      selected ? "stock_report_opened" : "stocks_opened",
      selected ? { symbol: selected.symbol } : {},
    );
  }, [selected]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let active = true;
    setLoading(true);
    setSnapshot(undefined);
    setError("");
    fetch(`/api/stocks?address=${selected.address}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as StockSnapshot;
      })
      .then((data) => {
        if (!active) return;
        if (
          data.address !== selected.address ||
          !data.market ||
          !data.chain ||
          !Number.isFinite(data.fetchedAt)
        )
          throw new Error();
        setSnapshot(data);
      })
      .catch(() => {
        if (active)
          setError("Could not load the snapshot. Retry to check current data.");
      })
      .finally(() => {
        if (active) setLoading(false);
        clearTimeout(timeout);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [selected, reload]);
  function toggleSave(address: string) {
    const next = saved.includes(address)
      ? saved.filter((a) => a !== address)
      : [...saved, address];
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      setSaved(next);
      setNotice("Saved list updated on this device.");
      trackEvent("stock_saved_changed", { saved: next.includes(address) });
    } catch {
      setNotice(
        "Browser storage is unavailable. The saved list was not changed.",
      );
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied.");
    } catch {
      setNotice(
        "Copy unavailable. Select the address or browser URL to copy manually.",
      );
    }
  }
  const filtered = STOCKS.filter(
    (s) =>
      (!onlySaved || saved.includes(s.address)) &&
      `${s.symbol} ${s.name} ${s.address}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const stale = snapshot && now - snapshot.fetchedAt > 120000;
  return (
    <main className="stocks-page">
      <header className="stocks-nav">
        <a href="/" className="stocks-brand">
          <img src="/basescout.svg" alt="" />
          <span className="stocks-brand-name">BaseScout</span>
          <span className="stocks-brand-section">Stocks</span>
        </a>
        <nav aria-label="Research navigation">
          <a href="/">Token scanner</a>
          <a href="/trending">Trending</a>
          <a href="/stocks" aria-current="page">
            Stocks
          </a>
        </nav>
        <select
          aria-label="Appearance"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemePreference)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </header>
      <div className="stocks-content">
        <div className="stocks-eyebrow">
          <span /> BASE EQUITY RESEARCH
        </div>
        <section className="stocks-hero">
          {selected && <StockLogo symbol={selected.symbol} large />}
          <div className="stocks-hero-copy">
            <h1>{selected ? selected.name : "Stocks, with context."}</h1>
            <p>
              {selected
                ? `${selected.symbol} · Coinbase-issued tokenized equity on Base`
                : "Explore tokenized equities. Check the address, understand the mechanics, and see what the data covers."}
            </p>
          </div>
          {!selected && (
            <div className="stocks-count">
              <Layers size={24} />
              <strong>{STOCKS.length}</strong>
              <span>Listed assets</span>
            </div>
          )}
        </section>
        <p className="stocks-disclosure">
          Research only. Coinbase tokenized stocks are available only to
          eligible users in permitted jurisdictions outside the U.S. BaseScout
          does not execute trades or determine eligibility.
        </p>
        <div role="status" className="stocks-notice">
          {notice}
        </div>
        {invalidRoute ? (
          <section className="stocks-panel">
            <h2>Asset not in this catalog</h2>
            <p>
              This address has not been matched to our supported official list.
              A matching ticker alone does not establish identity.
            </p>
            <a href="/stocks">Browse supported stocks</a>
          </section>
        ) : selected ? (
          <>
            <a className="stocks-back" href="/stocks">
              <ArrowLeft size={16} /> All stocks
            </a>
            <div className="stocks-detail-grid">
              <section className="stocks-panel">
                <div className="stocks-section-heading">
                  <h2>Asset identity</h2>
                  <ShieldCheck size={22} />
                </div>
                <p className="stocks-badge">
                  <CheckCircle2 size={14} /> Official address match
                </p>
                <p className="stocks-address">{selected.address}</p>
                <div className="stocks-actions stocks-action-buttons">
                  <button onClick={() => void copy(selected.address)}>
                    <Copy size={15} /> Copy address
                  </button>
                  <button
                    onClick={() => toggleSave(selected.address)}
                    aria-pressed={saved.includes(selected.address)}
                  >
                    <Bookmark size={15} />
                    {saved.includes(selected.address) ? "Unsave" : "Save asset"}
                  </button>
                  <button onClick={() => void copy(location.href)}>
                    Copy report link
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Issuer</dt>
                    <dd>Coinbase</dd>
                  </div>
                  <div>
                    <dt>Standard</dt>
                    <dd>B20 Asset</dd>
                  </div>
                  <div>
                    <dt>Catalog checked</dt>
                    <dd>{CATALOG_CHECKED}</dd>
                  </div>
                </dl>
                <p>
                  List membership confirms the address mapping, not investment
                  safety or your ability to trade.
                </p>
                <div className="stocks-actions">
                  <a
                    className="stocks-button stocks-button-primary"
                    href={`https://basescan.org/token/${selected.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on BaseScan <ArrowUpRight size={15} />
                  </a>
                </div>
              </section>
              <section className="stocks-panel" aria-busy={loading}>
                <div className="stocks-section-heading">
                  <h2>Market snapshot</h2>
                  <button
                    disabled={loading}
                    onClick={() => setReload((n) => n + 1)}
                    aria-label="Refresh snapshot"
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
                {loading ? (
                  <p role="status">Loading market and onchain data…</p>
                ) : error ? (
                  <p role="alert">{error}</p>
                ) : snapshot ? (
                  <>
                    <p className="stocks-price">
                      {money(snapshot.market.price)}
                    </p>
                    <p>DEX market price per token</p>
                    <dl>
                      <div>
                        <dt>Selected pool liquidity</dt>
                        <dd>{money(snapshot.market.liquidity)}</dd>
                      </div>
                      <div>
                        <dt>Selected pool 24h volume</dt>
                        <dd>{money(snapshot.market.volume)}</dd>
                      </div>
                      <div>
                        <dt>DEX</dt>
                        <dd>{snapshot.market.dex ?? "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>B20 multiplier</dt>
                        <dd>
                          {snapshot.chain.multiplier
                            ? `${snapshot.chain.multiplier}×`
                            : "Unavailable"}
                        </dd>
                      </div>
                    </dl>
                    <p>
                      {snapshot.market.status === "no-data"
                        ? "No matching base-side pool returned by DEX Screener. This does not establish that the asset cannot be traded."
                        : snapshot.market.status === "unavailable"
                          ? "Market provider unavailable. Missing data is not a zero price or zero liquidity."
                          : "Data by DEX Screener · highest-liquidity matching base-side pool. Retrieval time is not the time of the last trade."}
                    </p>
                    <p>
                      {snapshot.chain.status === "available"
                        ? `Multiplier read at Base block ${snapshot.chain.block}.`
                        : "Onchain multiplier unavailable; no 1:1 share conversion assumed."}
                    </p>
                    <p className={stale ? "stocks-warning" : ""}>
                      {stale
                        ? "Snapshot is over 2 minutes old — refresh. "
                        : ""}
                      Retrieved {new Date(snapshot.fetchedAt).toLocaleString()}.
                    </p>
                    {snapshot.market.pairAddress && (
                      <a
                        className="stocks-button stocks-button-primary stocks-market-link"
                        href={`https://dexscreener.com/base/${snapshot.market.pairAddress}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open market on DEX Screener <ArrowUpRight size={15} />
                      </a>
                    )}
                  </>
                ) : null}
              </section>
            </div>
            <section className="stocks-panel stocks-mechanics">
              <h2>Understand B20 before you act</h2>
              <div>
                <article>
                  <h3>Different contract model</h3>
                  <p>
                    B20 uses native precompiles. Missing bytecode or per-token
                    source verification is not, by itself, a scam signal. A
                    generic ERC-20 risk score is not applied here.
                  </p>
                </article>
                <article>
                  <h3>Issuer controls remain relevant</h3>
                  <p>
                    Policies, pause controls, and administrative powers can
                    affect transfers. This report does not check your wallet
                    eligibility, current transfer policies, or pause state.
                  </p>
                </article>
                <article>
                  <h3>Tokens and shares can differ</h3>
                  <p>
                    The multiplier reflects corporate actions. One token does
                    not permanently equal one underlying share. DEX prices shown
                    here are already token prices; they are not multiplied
                    again.
                  </p>
                </article>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="stocks-tools">
              <label>
                <Search size={18} />
                <input
                  aria-label="Search stocks"
                  placeholder="Search company, ticker, or exact address"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                aria-pressed={onlySaved}
                onClick={() => setOnlySaved(!onlySaved)}
              >
                <Bookmark size={16} />
                {onlySaved ? "Show all stocks" : `Saved (${saved.length})`}
              </button>
            </div>
            <div className="stocks-grid">
              {filtered.map((stock) => (
                <article
                  className="stocks-panel stocks-card"
                  key={stock.address}
                >
                  <div className="stocks-card-top">
                    <StockLogo symbol={stock.symbol} />
                    <button
                      aria-label={`${saved.includes(stock.address) ? "Unsave" : "Save"} ${stock.symbol}`}
                      aria-pressed={saved.includes(stock.address)}
                      onClick={() => toggleSave(stock.address)}
                    >
                      <Bookmark size={18} />
                    </button>
                  </div>
                  <h2>
                    <a href={stockPath(stock.address)}>
                      {stock.name}
                      <ArrowUpRight size={19} />
                    </a>
                  </h2>
                  <p>
                    {stock.symbol} <span>· B20 Asset</span>
                  </p>
                  <small className="stocks-address">{stock.address}</small>
                  <a
                    className="stocks-card-link"
                    href={stockPath(stock.address)}
                  >
                    Open research <ArrowUpRight size={16} />
                  </a>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <section className="stocks-panel">
                <h2>No matching assets</h2>
                <p>
                  Try another company or ticker, or turn off the saved filter.
                  An unlisted address is not verified by this catalog.
                </p>
              </section>
            )}
          </>
        )}
        <footer className="stocks-footer">
          <p>
            Official-list snapshot checked {CATALOG_CHECKED}. Names and symbols
            may change.
          </p>
          <div>
            <a href={STOCK_SOURCE} target="_blank" rel="noreferrer">
              Official B20 source <ArrowUpRight size={13} />
            </a>
            <a
              href="https://www.coinbase.com/tokenize"
              target="_blank"
              rel="noreferrer"
            >
              Coinbase product &amp; eligibility <ArrowUpRight size={13} />
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
