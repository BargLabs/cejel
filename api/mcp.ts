import { readFileSync } from 'node:fs';

import { handleAuthenticatedCejelHttpRequest } from '../src/http/auth.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function identity(): { packageName: string; version: string } {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    name: string;
    version: string;
  };
  return { packageName: manifest.name, version: manifest.version };
}

async function handleAuthenticatedRequest(request: Request): Promise<Response> {
  return handleAuthenticatedCejelHttpRequest(request, identity);
}

export async function GET(request: Request): Promise<Response> {
  return handleAuthenticatedRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleAuthenticatedRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleAuthenticatedRequest(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleAuthenticatedRequest(request);
}
