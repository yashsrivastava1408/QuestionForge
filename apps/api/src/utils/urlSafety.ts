import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../middleware/errorHandler.js';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],        // "this" network
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // carrier-grade NAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['224.0.0.0', 3],      // multicast + reserved
];

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const value = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return (
    v6 === '::' || v6 === '::1' ||
    v6.startsWith('fc') || v6.startsWith('fd') || // unique local
    /^fe[89ab]/.test(v6) ||                        // link-local
    v6.startsWith('ff')                            // multicast
  );
}

/**
 * Guards outbound requests to customer-supplied URLs (webhooks) against SSRF:
 * the URL must be http(s) — https only in production — and every address the
 * host resolves to must be public. Called when the URL is saved AND again right
 * before each delivery, because DNS can change in between.
 *
 * Known limit: there is still a small gap between this lookup and the lookup
 * `fetch` performs (DNS rebinding). Closing it needs an egress proxy or a
 * pinned-IP HTTP agent; run the worker behind one if that matters to you.
 *
 * Set WEBHOOK_ALLOW_PRIVATE_TARGETS=true to deliver to localhost while developing.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError('Webhook URL is not a valid URL.', 400);
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !isProd)) {
    throw new AppError(isProd ? 'Webhook URL must use https.' : 'Webhook URL must use http or https.', 400);
  }
  if (url.username || url.password) {
    throw new AppError('Webhook URL must not contain credentials.', 400);
  }

  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true' && !isProd;
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new AppError(`Webhook host '${host}' could not be resolved.`, 400);
    }
  }

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new AppError('Webhook URL must point to a public internet address.', 400);
  }
  return url;
}
