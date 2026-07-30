import type { RequestOptions } from 'node:https';
import { type IncomingMessage } from 'node:http';

export type FetchCapability = typeof fetch;
export type RequestCapability = RequestOptions;
export type ResponseCapability = IncomingMessage;
export type { AgentOptions } from 'node:https';
export { type ClientRequestArgs } from 'node:http';
