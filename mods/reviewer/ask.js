// Opens the review message for confirmation in the space it came from.
import { focused, notify, openOverlay } from "herdr";

export async function ask({ title, context, sent, folder }) {
  const origin = focused();
  try {
    openOverlay({
      mod: "reviewer", kind: "dialog", modal: true,
      width: context ? 680 : 560, height: context ? 560 : 250,
      props: { dialog: true, title, context, sent, space: origin?.space, folder: folder ?? origin?.cwd },
    });
    return "dialog";
  } catch (e) {
    notify({ title: "Could not open the send dialog", body: String(e).slice(0, 200), level: "error" });
    return "none";
  }
}
