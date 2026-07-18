export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isEvmAddress(value: string) {
  return ADDRESS_PATTERN.test(value);
}

export function isTokenContractAddress(value: string) {
  return isEvmAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;
}
