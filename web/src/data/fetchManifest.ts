import { parseManifest, type Manifest } from "../lib/manifest.ts";
import { dataUrl } from "./dataUrl.ts";

/**
 * Load and check the manifest. Rejects when it cannot be fetched, and with a ManifestError when it
 * is not what the app was built for.
 *
 * `afterFailure` is for a second try. The browser may have kept what the address returned the first
 * time, even when that was not the file (the sign-in page of a public network, for example), so the
 * server is asked afresh.
 */
export async function fetchManifest(afterFailure = false): Promise<Manifest> {
  const response = await fetch(dataUrl("manifest.json"), { cache: afterFailure ? "reload" : "default" });
  if (!response.ok) throw new Error(`manifest.json could not be loaded: HTTP ${response.status}`);
  return parseManifest(await response.json());
}
