/**
 * Load an image and decode it, so that its first draw does not stall a frame. Rejects when it cannot be loaded.
 *
 * `afterFailure` is for a second try. The browser may have kept what the address returned the first
 * time, even when that was not an image (the sign-in page of a public network, for example), so the
 * server is asked afresh before the image is tried again.
 */
export async function loadImage(url: string, afterFailure = false): Promise<HTMLImageElement> {
  if (afterFailure) await fetch(url, { cache: "reload" });
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}
