const { createHash } = require("node:crypto");
const {
  createWriteStream,
  renameSync,
  rmSync,
  statSync,
  mkdirSync,
} = require("node:fs");
const https = require("node:https");
const path = require("node:path");

// Fetches the new Pulse inside the app rather than sending the reader to a
// browser, and restarts into it.
//
// Node's https rather than Chromium's download stack: this needs no window, pops
// no download shelf, and gives the byte stream directly so the digest can be
// computed while the file is written instead of by reading it back. Electron's
// own net.fetch documents that its `integrity` option is ignored, so nothing on
// this platform will check the file for us -- our SHA-256 is the only thing
// standing between the reader and running a binary this app fetched.
//
// What this cannot do, and the reason is structural rather than a bug: the
// portable .exe the reader launched cannot be replaced while it runs. Measured --
// a running portable build holds its own file open, and both a rename and an
// exclusive write are refused with "The process cannot access the file because it
// is being used by another process." electron-builder's portable stub stays alive
// for the whole session with the image mapped. So the new version is written
// BESIDE the old one and Pulse restarts into it. The old file stays on disk, and
// any shortcut the reader pinned still points at it.
module.exports = function downloads({ app, updates, report }) {
  let active = null;
  let verified = null;

  // Beside the portable exe the reader chose to keep, so the new version lands
  // where they already keep this one. PORTABLE_EXECUTABLE_DIR is set by the
  // portable stub and is absent under `npm run desktop` or any other target, so
  // Downloads is the fallback rather than an assumption.
  const folder = () => {
    const at = process.env.PORTABLE_EXECUTABLE_DIR || app.getPath("downloads");
    try {
      mkdirSync(at, { recursive: true });
    } catch {}
    return at;
  };

  const fail = (error) => {
    // Cleared on every failure: a path left in `verified` from an earlier success
    // must never be spawnable after a later download went wrong.
    verified = null;
    active = null;
    report({ state: "failed", error });
  };

  function start(update) {
    if (active) return;
    if (!update || !update.url || !update.sha256)
      return fail("Nothing to download");
    const target = path.join(folder(), update.name);
    const part = target + ".part";
    active = { update, part, target };
    verified = null;
    report({ state: "downloading", progress: 0 });
    const request = https.get(
      update.url,
      { headers: { "User-Agent": "PulseStatus/1.0" } },
      (answer) => {
        // A binary that can be redirected is a binary that can be substituted.
        if (answer.statusCode !== 200) {
          answer.resume();
          try {
            rmSync(part, { force: true });
          } catch {}
          return fail("Download failed");
        }
        const hash = createHash("sha256");
        const out = createWriteStream(part);
        let received = 0;
        answer.on("data", (chunk) => {
          received += chunk.length;
          // Stop rather than fill the disk when the stream exceeds what the
          // manifest promised.
          if (received > update.bytes) {
            answer.destroy();
            out.destroy();
            try {
              rmSync(part, { force: true });
            } catch {}
            return fail("Download failed");
          }
          hash.update(chunk);
          report({ state: "downloading", progress: received / update.bytes });
        });
        answer.pipe(out);
        out.on("error", () => {
          try {
            rmSync(part, { force: true });
          } catch {}
          fail("Could not save the download");
        });
        out.on("finish", () => {
          if (!active) return;
          report({ state: "verifying", progress: 1 });
          const digest = hash.digest("hex");
          let size = -1;
          try {
            size = statSync(part).size;
          } catch {}
          if (!updates.acceptable(update, size, digest)) {
            try {
              rmSync(part, { force: true });
            } catch {}
            return fail("The download did not match its checksum");
          }
          try {
            rmSync(target, { force: true });
            // Only now does it get the name anything else would run.
            renameSync(part, target);
          } catch {
            try {
              rmSync(part, { force: true });
            } catch {}
            return fail("Could not save the download");
          }
          verified = target;
          active = null;
          report({ state: "ready", path: target });
        });
      },
    );
    request.setTimeout(60_000, () => {
      request.destroy();
      try {
        rmSync(part, { force: true });
      } catch {}
      fail("Download timed out");
    });
    request.on("error", () => {
      try {
        rmSync(part, { force: true });
      } catch {}
      fail("Download failed");
    });
  }

  // relaunch replaces the executable this app will start as, and Electron only
  // acts on it once the current instance exits -- which is also what releases the
  // single-instance lock and frees port 47823 for the new one. execPath is not
  // optional: the default is process.execPath, which inside a portable build is
  // the temporary copy the stub deletes on exit.
  function restart() {
    if (!verified) return false;
    app.relaunch({ execPath: verified });
    app.quit();
    return true;
  }

  return {
    start,
    restart,
    get ready() {
      return verified;
    },
    stop() {
      if (active) {
        try {
          rmSync(active.part, { force: true });
        } catch {}
        active = null;
      }
    },
  };
};
