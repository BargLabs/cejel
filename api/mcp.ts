import { readFileSync } from 'node:fs';

import { handleCejelHttpRequest } from '../src/http/server.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function identity(): { packageName: string; version: string } {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    name: string;
    version: string;
  };
  return { packageName: manifest.name, version: manifest.version };
}

export async function GET(request: Request): Promise<Response> {
  return handleCejelHttpRequest(request, identity());
}

export async function POST(request: Request): Promise<Response> {
  return handleCejelHttpRequest(request, identity());
}

export async function DELETE(request: Request): Promise<Response> {
  return handleCejelHttpRequest(request, identity());
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleCejelHttpRequest(request, identity());
}
