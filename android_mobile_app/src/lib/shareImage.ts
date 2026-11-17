import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

// "Share as image" on the site hands the app a PNG as a data URL (the WebView can't open a share
// sheet or save downloads). Save it to the cache and open the phone's share sheet.
export async function shareImageFromDataUrl(dataUrl: string, fileName: string, title: string): Promise<void> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  if (base64 === dataUrl) throw new Error("Not a PNG image");

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_") || "tier-list.png";

  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone");
  await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: title });
}
