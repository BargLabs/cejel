const send = globalThis.fetch;

export function sendOutboundRequest(): Promise<Response> {
  return send('https://example.invalid');
}
