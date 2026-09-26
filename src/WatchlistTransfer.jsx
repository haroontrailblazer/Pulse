import { useMemo, useRef, useState } from "react";
import { Copy, Download, Check } from "./icons.jsx";
import {
  decodeTransfer,
  describeTransfer,
  encodeTransfer,
  transferLink,
} from "../shared/watchlist-transfer.js";
import { qrMatrix, qrSvg } from "../shared/qr.js";

// Carrying a watchlist between the website, the EXE and the APK.
//
// The panel is two halves because the job is two halves, and it says which
// device it is talking about in each: readers get this wrong with sync UIs, and
// there is no server here to correct them afterwards.
export default function WatchlistTransfer({
  watchlist,
  custom,
  known,
  handedCode = "",
  onApply,
}) {
  // A code scanned on this device, or handed to it by Windows, starts in the field
  // already read -- but not applied. The reader still sees what it would add, and
  // still has to agree, because arriving from a camera is not consent.
  const [paste, setPaste] = useState(handedCode);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(null);
  const fileInput = useRef(null);

  const code = useMemo(
    () => encodeTransfer({ watchlist, custom }),
    [watchlist, custom],
  );

  // Fixed black on white whatever the theme is doing. Inverted codes are within
  // the specification and many readers cope, but "many" is the wrong word for the
  // one step a reader cannot work around, and a dark-theme square that some
  // phones refuse would look like a broken feature rather than a contrast
  // problem. The white plate in the stylesheet is part of the same decision.
  //
  // The square is drawn at four CSS pixels per module rather than one fixed width,
  // because the module count is not fixed: four watched services is 29 modules
  // across and the whole catalogue is 97, and rendering both at 280px would leave
  // the second at under three pixels a module, which is below what a camera can
  // separate. Bounded at both ends so a small code is not a postage stamp and a
  // large one still fits a phone-width sheet.
  //
  // Past 1,059 bytes no version this encoder draws can hold the code, so it
  // refuses rather than truncate and the panel says so. A full catalogue plus a
  // dozen added pages is still inside that.
  const square = useMemo(() => {
    try {
      // The square holds the link, not the bare code: a phone with Pulse
      // installed offers to open it and the code lands in the field, and a phone
      // without still shows it as text that this panel accepts back.
      const link = transferLink(code);
      const { size } = qrMatrix(link);
      return {
        svg: qrSvg(link, { dark: "#000000", light: "#ffffff" }),
        modules: size,
        width: Math.min(420, Math.max(240, size * 4)),
      };
    } catch {
      return { tooLong: true };
    }
  }, [code]);

  // Parsed on every keystroke so the reader is told what a code contains before
  // they agree to it, rather than after it has changed their watchlist.
  const reading = useMemo(() => {
    if (!paste.trim()) return null;
    try {
      const incoming = decodeTransfer(paste, known);
      return {
        incoming,
        summary: describeTransfer(incoming, { watchlist, custom }),
      };
    } catch (problem) {
      return { error: problem?.message || "That code could not be read." };
    }
  }, [paste, known, watchlist, custom]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission is not guaranteed. The code is on screen and
      // selectable, so there is nothing to recover from.
    }
  };

  const download = () => {
    const blob = new Blob([`${code}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pulse-watchlist.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const openFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => setPaste(text.trim()))
      .catch(() => setPaste(""));
    event.target.value = "";
  };

  const apply = () => {
    if (!reading?.incoming) return;
    setApplied(onApply(reading.incoming));
    setPaste("");
  };

  return (
    <div className="prose">
      <p>
        Pulse has no account, so nothing you star is sent anywhere. To carry a
        watchlist to another device, move this code across yourself.
      </p>

      <h3>From this device</h3>
      <p className="transfer-count">
        {watchlist.length} watched{" "}
        {watchlist.length === 1 ? "service" : "services"}
        {custom.length > 0 &&
          ` and ${custom.length} added ${custom.length === 1 ? "page" : "pages"}`}
        .
      </p>
      <textarea
        className="transfer-code"
        readOnly
        rows={3}
        value={code}
        aria-label="This device's transfer code"
        onFocus={(event) => event.target.select()}
      />
      <div className="transfer-actions">
        <button className="button" type="button" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy code"}
        </button>
        <button className="button secondary" type="button" onClick={download}>
          <Download size={16} /> Save as a file
        </button>
      </div>

      {square.svg ? (
        <figure className="transfer-qr">
          <div
            className="transfer-qr-plate"
            style={{ width: square.width }}
            // The encoder's output, built from this device's own watchlist. No
            // reader input reaches it: the only variable is the code above, which
            // this app generated.
            dangerouslySetInnerHTML={{ __html: square.svg }}
          />
          <figcaption>
            Point the other device's camera at this to read the code, then paste
            it into Pulse there. It holds the code itself, not a link, so
            nothing is fetched and no server sees your watchlist.
          </figcaption>
        </figure>
      ) : (
        <p className="transfer-note">
          This watchlist is too long to fit in a scannable square. Copy the code
          or save it as a file instead.
        </p>
      )}

      <h3>From another device</h3>
      <label className="custom-field">
        <span>Transfer code</span>
        <textarea
          rows={3}
          className="transfer-code"
          placeholder="PULSE1;…"
          value={paste}
          onChange={(event) => {
            setPaste(event.target.value);
            setApplied(null);
          }}
          aria-invalid={reading?.error ? "true" : undefined}
        />
      </label>
      <div className="transfer-actions">
        <button
          className="button secondary"
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          Open a saved file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          hidden
          onChange={openFile}
        />
      </div>

      {reading?.error && (
        <p className="custom-error" role="alert">
          {reading.error}
        </p>
      )}

      {reading?.summary && (
        <>
          <p className="transfer-preview">
            Adds <strong>{reading.summary.services}</strong>{" "}
            {reading.summary.services === 1 ? "service" : "services"} and{" "}
            <strong>{reading.summary.pages}</strong>{" "}
            {reading.summary.pages === 1 ? "page" : "pages"} to this device.
            Nothing you already watch is removed.
          </p>
          {reading.summary.unknown > 0 && (
            <p className="transfer-note">
              {reading.summary.unknown}{" "}
              {reading.summary.unknown === 1 ? "service" : "services"} in that
              code {reading.summary.unknown === 1 ? "is" : "are"} not in this
              build's catalogue and will be skipped.
            </p>
          )}
          {reading.summary.refused > 0 && (
            <p className="transfer-note">
              {reading.summary.refused} added{" "}
              {reading.summary.refused === 1 ? "page" : "pages"} could not be
              used and {reading.summary.refused === 1 ? "was" : "were"} skipped.
            </p>
          )}
          <button
            className="button"
            type="button"
            onClick={apply}
            disabled={!reading.summary.services && !reading.summary.pages}
          >
            Add to this device
          </button>
        </>
      )}

      {applied && (
        <p className="transfer-applied" role="status">
          Added {applied.services}{" "}
          {applied.services === 1 ? "service" : "services"} and {applied.pages}{" "}
          {applied.pages === 1 ? "page" : "pages"}.
        </p>
      )}

      <h3>What a code is, and what it is not</h3>
      <p>
        A code is a snapshot of one device at one moment. It carries the
        services you watch and the addresses of pages you added, and nothing
        else: no history, no settings, and no way back to you.
      </p>
      <p>
        Applying one <strong>merges</strong>. It never removes anything, so a
        code made before you starred something new cannot undo that. Added pages
        are rebuilt through the same check as a typed address, so a code cannot
        introduce a page Pulse would have refused.
      </p>
    </div>
  );
}
