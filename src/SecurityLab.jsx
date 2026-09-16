import React, { useRef, useState } from "react";
import {
  ShieldCheck,
  PackageSearch,
  Fingerprint,
  Braces,
  ExternalLink,
  Copy,
} from "./icons";
import {
  packageQuery,
  queryAdvisories,
  decodeJwt,
  sha256,
} from "../shared/security-tools";
import { requestOsv } from "./security-client";
import "./security.css";

export default function SecurityLab() {
  const [tool, setTool] = useState("Package advisories");
  return (
    <div className="security-lab">
      <div className="lab-heading">
        <span className="lab-icon">
          <ShieldCheck size={24} />
        </span>
        <div>
          <h3>Security workbench</h3>
          <p>Investigate dependencies. Inspect tokens. Verify artifacts.</p>
        </div>
        <span className="lab-badge">DEVELOPER UTILITIES</span>
      </div>
      <div className="lab-tabs" role="tablist" aria-label="Security utilities">
        {[
          ["Package advisories", PackageSearch],
          ["JWT inspector", Braces],
          ["SHA-256", Fingerprint],
        ].map(([name, Icon]) => (
          <button
            key={name}
            role="tab"
            aria-selected={tool === name}
            aria-controls="security-tool-panel"
            onClick={() => setTool(name)}
          >
            <Icon size={16} />
            {name}
          </button>
        ))}
      </div>
      <div id="security-tool-panel" role="tabpanel" aria-label={tool}>
        {tool === "Package advisories" ? (
          <Advisories />
        ) : tool === "JWT inspector" ? (
          <JwtInspector />
        ) : (
          <HashTool />
        )}
      </div>
    </div>
  );
}
function Advisories() {
  const [ecosystem, setEcosystem] = useState("npm"),
    [name, setName] = useState(""),
    [version, setVersion] = useState("");
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reset = () => {
    setResult(null);
    setError("");
  };
  async function check(event) {
    event.preventDefault();
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const query = packageQuery(ecosystem, name, version);
      setResult(await queryAdvisories(query, requestOsv));
    } catch (e) {
      setError(
        e.name === "TimeoutError"
          ? "OSV timed out. Try again; no security conclusion is available."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lab-body">
      <h4>Check an installed package version</h4>
      <p>
        Look up known vulnerabilities in the public OSV database. Only the
        package name, ecosystem, and version are sent to OSV.
      </p>
      <form className="advisory-form" onSubmit={check}>
        <label>
          Ecosystem
          <select
            aria-label="Package ecosystem"
            value={ecosystem}
            disabled={busy}
            onChange={(e) => {
              setEcosystem(e.target.value);
              reset();
            }}
          >
            <option>npm</option>
            <option>PyPI</option>
            <option>RubyGems</option>
          </select>
        </label>
        <label className="package-name">
          Package name
          <input
            aria-label="Package name"
            autoComplete="off"
            spellCheck="false"
            placeholder={ecosystem === "PyPI" ? "e.g. requests" : "e.g. lodash"}
            value={name}
            maxLength={214}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              reset();
            }}
            required
          />
        </label>
        <label>
          Exact version
          <input
            autoComplete="off"
            spellCheck="false"
            placeholder="e.g. 4.17.20"
            value={version}
            maxLength={80}
            disabled={busy}
            onChange={(e) => {
              setVersion(e.target.value);
              reset();
            }}
            required
          />
        </label>
        <button className="button primary" disabled={busy}>
          <PackageSearch size={16} />
          {busy ? "Checking OSV…" : "Check advisories"}
        </button>
      </form>
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="advisory-result" aria-live="polite">
          <div className="advisory-summary">
            <strong>
              {result.advisories.length
                ? `${result.advisories.length}${result.incomplete ? "+" : ""} known advisories returned`
                : result.incomplete
                  ? "Lookup incomplete"
                  : "No known advisories returned"}
            </strong>
            <span>
              {result.query.package.name} @ {result.query.version} ·{" "}
              {new Date(result.checkedAt).toLocaleTimeString()}
            </span>
          </div>
          <p>
            {result.incomplete
              ? "Results are partial. Review OSV directly for the complete record."
              : "This checks the named version only, not its dependency tree. No matches do not prove a package exists or is secure."}
          </p>
          <div className="advisory-list">
            {result.advisories.map((v) => (
              <a
                key={v.id}
                href={`https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                <div>
                  <span className="advisory-id">{v.id}</span>
                  <span className="advisory-severity">{v.severity}</span>
                  <ExternalLink size={16} />
                </div>
                <strong>{v.summary}</strong>
                <small>
                  {v.aliases.slice(0, 4).join(" · ") ||
                    "See advisory for affected ranges and fixes"}
                </small>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="lab-source">
        <a href="https://osv.dev" target="_blank" rel="noreferrer">
          OSV vulnerability database <ExternalLink size={16} />
        </a>
        <span>For a whole project, use npm audit or OSV-Scanner.</span>
      </div>
    </div>
  );
}
function JwtInspector() {
  const [token, setToken] = useState("");
  let decoded, error;
  if (token.trim())
    try {
      decoded = decodeJwt(token);
    } catch (e) {
      error = e.message;
    }
  return (
    <div className="lab-body">
      <h4>Read a token without sending it anywhere</h4>
      <p>
        Decoding runs on your device. Tokens are not stored. This does not
        verify a signature or grant access.
      </p>
      <label className="lab-field">
        JSON Web Token
        <textarea
          aria-label="JSON Web Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste a three-part JWT…"
          maxLength={65536}
          autoComplete="off"
          spellCheck="false"
        />
      </label>
      <button className="text-button" onClick={() => setToken("")}>
        Clear token
      </button>
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      {decoded && (
        <>
          <div className="jwt-notes">
            {decoded.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
          <div className="jwt-output">
            <div>
              <h4>Header</h4>
              <pre>{JSON.stringify(decoded.header, null, 2)}</pre>
            </div>
            <div>
              <h4>Payload</h4>
              <pre>{JSON.stringify(decoded.payload, null, 2)}</pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function HashTool() {
  const fileInput = useRef(null);
  const [text, setText] = useState(""),
    [file, setFile] = useState(null),
    [hash, setHash] = useState(""),
    [expected, setExpected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const reset = () => {
    setHash("");
    setError("");
    setCopied(false);
  };
  async function compute() {
    reset();
    setBusy(true);
    try {
      if (file && file.size > 10 * 1024 * 1024)
        throw new Error("Choose a file under 10 MB.");
      const bytes = file
        ? await file.arrayBuffer()
        : new TextEncoder().encode(text);
      setHash(await sha256(bytes));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const validExpected = /^[a-f0-9]{64}$/i.test(expected.trim());
  return (
    <div className="lab-body">
      <h4>Verify a file or text fingerprint</h4>
      <p>
        SHA-256 is computed on your device. Files stay local; maximum file size
        is 10 MB. Text uses UTF-8 with its exact whitespace.
      </p>
      <div className="hash-inputs">
        <label className="lab-field">
          Text
          <textarea
            aria-label="Text to hash"
            value={text}
            disabled={!!file || busy}
            onChange={(e) => {
              setText(e.target.value);
              reset();
            }}
            placeholder="Enter text, or select a file below…"
            maxLength={65536}
            spellCheck="false"
          />
        </label>
        <label className="lab-field">
          Or select a file
          <input
            type="file"
            ref={fileInput}
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              reset();
            }}
          />
        </label>
        {file && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setFile(null);
              fileInput.current.value = "";
              reset();
            }}
          >
            Clear file
          </button>
        )}
        <label className="lab-field">
          Expected SHA-256 (optional)
          <input
            value={expected}
            maxLength={64}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="Paste a trusted checksum to compare"
            spellCheck="false"
          />
        </label>
      </div>
      <button className="button primary" onClick={compute} disabled={busy}>
        <Fingerprint size={16} />
        {busy ? "Calculating…" : "Calculate SHA-256"}
      </button>
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      {hash && (
        <div className="hash-output" aria-live="polite">
          <code>{hash}</code>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(hash);
                setCopied(true);
              } catch {
                setError(
                  "Clipboard unavailable. Select and copy the checksum.",
                );
              }
            }}
          >
            <Copy size={16} />
            {copied ? "Copied" : "Copy checksum"}
          </button>
          {expected && (
            <p
              className={
                validExpected && expected.trim().toLowerCase() === hash
                  ? "hash-match"
                  : "lab-error"
              }
            >
              {!validExpected
                ? "Expected checksum must contain 64 hexadecimal characters."
                : expected.trim().toLowerCase() === hash
                  ? "Checksums match."
                  : "Checksums do not match."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
