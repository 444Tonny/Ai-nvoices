"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MiniTimer } from "./mini-timer";

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

/** Copie les feuilles de style de la page dans la fenêtre PiP. */
function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = target.document.createElement("style");
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
  target.document.documentElement.className = document.documentElement.className;
  target.document.body.className = "bg-page text-text";
}

/**
 * Bouton ⤢ : ouvre un mini-timer toujours au premier plan via la
 * Document Picture-in-Picture API, sinon une popup réduite (/mini-timer).
 */
export function CompactButton() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const open = useCallback(async () => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    if (window.documentPictureInPicture) {
      try {
        const pip = await window.documentPictureInPicture.requestWindow({ width: 360, height: 130 });
        copyStyles(pip);
        pip.document.title = "AI-nvoices";
        pip.addEventListener("pagehide", () => setPipWindow(null));
        setPipWindow(pip);
        return;
      } catch {
        // Repli sur la popup classique.
      }
    }
    window.open("/mini-timer", "ainv-mini-timer", "popup=yes,width=380,height=170");
  }, [pipWindow]);

  useEffect(() => () => pipWindow?.close(), [pipWindow]);

  return (
    <>
      <button type="button" className="btn btn-icon" onClick={open} title="Mode compact (mini-timer flottant)" aria-label="Mode compact">
        ⤢
      </button>
      {pipWindow && createPortal(<MiniTimer />, pipWindow.document.body)}
    </>
  );
}
