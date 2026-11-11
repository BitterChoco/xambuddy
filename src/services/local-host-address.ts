import * as Network from "expo-network";

import type { LocalHostAddress } from "../../modules/local-network-address";

function isUsableIPv4(address: string) {
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every(
      (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
    ) &&
    octets[0] !== 0 &&
    octets[0] !== 127 &&
    !(octets[0] === 169 && octets[1] === 254) &&
    octets[0] < 224
  );
}

export async function getLocalHostAddresses(): Promise<LocalHostAddress[]> {
  try {
    const address = await Network.getIpAddressAsync();
    return isUsableIPv4(address) ? [{ address, interfaceName: "network" }] : [];
  } catch {
    return [];
  }
}
