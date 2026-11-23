/**
 * Load an image and decode it, so that its first draw does not stall a frame. Rejects when it cannot be loaded.
 *
 * `afterFailure` is for a second try. The browser may have kept what the address returned the first
 * time, even when that was not an image (the sign-in page of a public network, for example), so the
 * server is asked afresh and the image is decoded from exactly that answer.
 */
export async function loadImage(url: string, afterFailure = false): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  if (!afterFailure) {
    image.src = url;
    await image.decode();
    return image;
  }
  const response = await fetch(url, { cache: "reload" });
  if (!response.ok) throw new Error(`${url} could not be loaded: HTTP ${response.status}`);
  const answer = URL.createObjectURL(await response.blob());
  try {
    image.src = answer;
    await image.decode();
  } finally {
    URL.revokeObjectURL(answer); // the decoded image no longer needs it
  }
  return image;
}
