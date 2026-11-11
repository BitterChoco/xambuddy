import { requireOptionalNativeModule } from "expo-modules-core";
import * as Network from "expo-network";

import type { LocalHostAddress } from "../../modules/local-network-address";

const nativeAddressModule = requireOptionalNativeModule<{
  getIPv4Addresses: () => LocalHostAddress[];
}>("LocalNetworkAddress");

export async function getLocalHostAddresses(): Promise<LocalHostAddress[]> {
  const addresses = new Map<string, LocalHostAddress>();

  try {
    for (const candidate of nativeAddressModule?.getIPv4Addresses() ?? []) {
      if (candidate.address) {
        addresses.set(candidate.address, candidate);
      }
    }
  } catch {
    // Fall back to Expo Network if interface enumeration is unavailable.
  }

  try {
    const address = await Network.getIpAddressAsync();
    const octets = address.split(".").map(Number);
    const isUsableIPv4 =
      octets.length === 4 &&
      octets.every(
        (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
      ) &&
      octets[0] !== 0 &&
      octets[0] !== 127 &&
      !(octets[0] === 169 && octets[1] === 254) &&
      octets[0] < 224;
    if (isUsableIPv4 && !addresses.has(address)) {
      addresses.set(address, { address, interfaceName: "network" });
    }
  } catch {
    // Keep any addresses returned by the native interface scan.
  }

  return Array.from(addresses.values());
}
