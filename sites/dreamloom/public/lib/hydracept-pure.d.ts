export type CapabilityInput = Record<string, unknown>;

export const ALLOWED_CAPABILITIES: Set<string>;

export function parseImageSize(size?: string): { width: number; height: number };

export function crossOriginRequest(origin: string | null, requestUrl: string): boolean;

export function quoteDisplay(body: Record<string, unknown> | null | undefined): string;

export function validateCapabilityInput(
  capability: string,
  input: unknown,
):
  | { ok: true; input: CapabilityInput }
  | { ok: false; error: string };

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string;
