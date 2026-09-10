export const STOCK_SOURCE =
  "https://docs.base.org/specifications/b20/tokenized-stocks-on-base";
export const CATALOG_CHECKED = "2026-09-09";
export const STOCKS = [
  ["AAPLc", "Apple", "0xb200000000000000000000C2e324d24d7eEcd1fb"],
  ["AMZNc", "Amazon", "0xb200000000000000000000d9192b6B456483C2E8"],
  ["COINc", "Coinbase", "0xb200000000000000000000c85a31389D71F3ecfb"],
  ["CRCLc", "Circle", "0xB20000000000000000000019f6E7C675b73C2e4D"],
  ["GOOGLc", "Alphabet", "0xb2000000000000000000002D0BA3164cc74f58B7"],
  ["INTCc", "Intel", "0xB2000000000000000000004AFF16039bA04bdFBc"],
  ["METAc", "Meta", "0xb2000000000000000000008bC8786B856E61707C"],
  ["MSFTc", "Microsoft", "0xB200000000000000000000Ab99cFa739E253872B"],
  ["MSTRc", "Strategy", "0xb2000000000000000000004884b426556b92883d"],
  ["NVDAc", "NVIDIA", "0xb20000000000000000000078ee7ce2fE4908108C"],
  ["SNDKc", "SanDisk", "0xb200000000000000000000397293Cb8cda9a10c5"],
  ["SPCXc", "SPCX", "0xb2000000000000000000007b9fcbd005511aCBd5"],
  ["TSLAc", "Tesla", "0xb2000000000000000000001e800a7f5189430cD0"],
].map(([symbol, name, address]) => ({
  symbol,
  name,
  address: address.toLowerCase() as `0x${string}`,
}));
export type Stock = (typeof STOCKS)[number];
export function findStock(value: string) {
  return STOCKS.find((stock) => stock.address === value.trim().toLowerCase());
}
export function stockPath(address: string) {
  return `/stocks/${address.toLowerCase()}`;
}
export type StockSnapshot = {
  address: string;
  fetchedAt: number;
  market: {
    status: "available" | "no-data" | "unavailable";
    price?: number;
    liquidity?: number;
    volume?: number;
    pairAddress?: string;
    dex?: string;
  };
  chain: {
    status: "available" | "unavailable";
    multiplier?: string;
    block?: string;
  };
};
