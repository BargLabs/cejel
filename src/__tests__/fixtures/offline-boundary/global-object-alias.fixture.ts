const browserRoot = globalThis;
const nodeRoot = global;

export const browserSend = browserRoot.fetch;
export const nodeSend = nodeRoot.fetch;
