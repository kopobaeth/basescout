import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
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
          BaseScout<span> / Stocks</span>
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
          <div>
            <h1>{selected ? selected.name : "Stocks, with context."}</h1>
            <p>
              {selected
                ? `${selected.symbol} · Coinbase-issued tokenized equity on Base`
                : "Explore tokenized equities. Check the address, understand the mechanics, and see what the data covers."}
            </p>
          </div>
          <div className="stocks-count">
            <Layers size={24} />
            <strong>{STOCKS.length}</strong>
            <span>Listed assets</span>
          </div>
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
                  Address matches the official list
                </p>
                <p className="stocks-address">{selected.address}</p>
                <div className="stocks-actions">
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
                  <a href={STOCK_SOURCE} target="_blank" rel="noreferrer">
                    Official token list <ArrowUpRight size={15} />
                  </a>
                  <a
                    href={`https://basescan.org/token/${selected.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explorer <ArrowUpRight size={15} />
                  </a>
                  <a
                    href="https://www.coinbase.com/tokenize"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Issuer information <ArrowUpRight size={15} />
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
                    <span className="stocks-monogram">
                      {stock.symbol.slice(0, 2)}
                    </span>
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
          <a href={STOCK_SOURCE} target="_blank" rel="noreferrer">
            Source: Base documentation ↗
          </a>
        </footer>
      </div>
    </main>
  );
}
