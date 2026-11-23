import { parseManifest, type Manifest } from "../lib/manifest.ts";
import { dataUrl } from "./dataUrl.ts";

/** Load and check the manifest. Rejects when it cannot be fetched or is not what the app was built for. */
export async function fetchManifest(): Promise<Manifest> {
  const response = await fetch(dataUrl("manifest.json"));
  if (!response.ok) throw new Error(`manifest.json could not be loaded: HTTP ${response.status}`);
  return parseManifest(await response.json());
}
