export async function publishRelease(sendRequest) {
  try {
    await sendRequest();
    return { ok: true, message: 'Release published.' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Release publication failed: ${detail}` };
  }
}
