import os from "node:os";

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split(".").map((part) => Number.parseInt(part, 10));
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Returns non-internal IPv4 addresses, private ranges first. */
export function getLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses.sort((a, b) => Number(isPrivateIpv4(b)) - Number(isPrivateIpv4(a)));
}

export function getPrimaryLanAddress(): string | undefined {
  return getLanAddresses()[0];
}
