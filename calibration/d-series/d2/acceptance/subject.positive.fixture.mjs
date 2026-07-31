export async function publishRelease(sendRequest) {
  try {
    await sendRequest();
    return { ok: true, message: 'Release published.' };
  } catch (error) {
    return { ok: false, message: 'Release publication failed.' };
  }
}
