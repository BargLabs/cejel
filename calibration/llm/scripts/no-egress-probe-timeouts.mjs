export const DEFAULT_SURFACE_TIMEOUT_MS = 1_000;

function probeError(message, cause) {
  return new Error(message, cause === undefined ? undefined : { cause });
}

function validTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw new Error(`no-egress probe timeout must be a positive integer, got ${timeoutMs}`);
  return timeoutMs;
}

/**
 * Calls one declared egress surface and accepts only the runtime policy's explicit denial.
 * Every invocation races against a bounded timer so a new Node API or a broken hook cannot
 * silently consume a one-shot calibration authorization by blocking the complete probe.
 */
export async function assertSurfaceDenied(descriptor, { timeoutMs = DEFAULT_SURFACE_TIMEOUT_MS } = {}) {
  const boundedTimeout = validTimeout(timeoutMs);
  const surfaceId = descriptor?.id;
  if (!surfaceId || !descriptor?.target || typeof descriptor.method !== 'string')
    throw new Error('no-egress probe descriptor is invalid');

  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => descriptor.target[descriptor.method]()),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(probeError(`no-egress probe surface timed out: ${surfaceId} after ${boundedTimeout}ms`)),
          boundedTimeout,
        );
      }),
    ]);
  } catch (error) {
    if (String(error?.message ?? error).includes('Cejel calibration no-egress policy denied '))
      return surfaceId;
    if (String(error?.message ?? error).startsWith('no-egress probe surface timed out:')) throw error;
    throw probeError(
      `no-egress probe surface did not report policy denial: ${surfaceId}: ${String(error?.message ?? error)}`,
      error,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  throw new Error(`no-egress probe surface completed without policy denial: ${surfaceId}`);
}

export async function assertAllSurfacesDenied(
  descriptors,
  { timeoutMs = DEFAULT_SURFACE_TIMEOUT_MS } = {},
) {
  const deniedSurfaceIds = [];
  for (const descriptor of descriptors)
    deniedSurfaceIds.push(await assertSurfaceDenied(descriptor, { timeoutMs }));
  return deniedSurfaceIds;
}
