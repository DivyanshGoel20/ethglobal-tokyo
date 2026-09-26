"use client";

import React from "react";
import type { X402Trace } from "@lifeline/sui";

const short = (a?: string, n = 6) => (a && a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-4)}` : a ?? "");
const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return { host: x.host, path: x.pathname + x.search };
  } catch {
    return { host: "", path: u };
  }
};

/** One row of a step's details. */
const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <>
    <dt className="ink-3 whitespace-nowrap">{k}</dt>
    <dd className="min-w-0 break-all">{children}</dd>
  </>
);

const Step: React.FC<{ n: number; title: string; aside?: React.ReactNode; last?: boolean; children?: React.ReactNode }> = ({
  n,
  title,
  aside,
  last,
  children,
}) => (
  <li className="relative pl-8 pb-5">
    {!last && <span className="absolute left-[9px] top-6 bottom-0 w-px" style={{ background: "var(--rule)" }} aria-hidden />}
    <span
      className="absolute left-0 top-0 w-[19px] h-[19px] grid place-items-center mono text-[10px]"
      style={{ border: "1px solid var(--ink)", background: "var(--panel)" }}
    >
      {n}
    </span>
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13.5px]">{title}</span>
      {aside && <span className="mono text-[10.5px] ink-3 shrink-0">{aside}</span>}
    </div>
    {children && <div className="mt-2">{children}</div>}
  </li>
);

/**
 * How an x402 purchase happened, step by step - the request, the 402, the
 * quote, what was signed and by whom, the settlement - and what came back.
 */
export const X402Receipt: React.FC<{ trace: X402Trace; data: any; settlementLink?: string | null }> = ({
  trace,
  data,
  settlementLink,
}) => {
  const req = pathOf(trace.request.url);
  const receipt = (trace.settlement.receipt ?? {}) as Record<string, any>;
  const settledTx = receipt.transaction ? String(receipt.transaction) : null;

  return (
    <section className="space-y-4">
      <div className="lab">How it was paid · x402</div>
      <ol className="text-[12.5px]">
        <Step n={1} title="Asked for the resource" aside={req.host}>
          <code className="mono text-[11px] block">
            {trace.request.method} {req.path}
          </code>
          <div className="mono text-[11px] mt-1" style={{ color: "var(--alarm)" }}>
            ← {trace.challenge.status} Payment Required · x402 v{trace.challenge.x402Version}
          </div>
        </Step>

        <Step n={2} title="Read the quote" aside="PAYMENT-REQUIRED">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mono text-[11px]">
            <Row k="price">${trace.quote.amountUsd.toFixed(trace.quote.amountUsd < 0.1 ? 3 : 2)}</Row>
            <Row k="asset">
              {trace.quote.assetLabel} <span className="ink-3">{short(trace.quote.asset, 8)}</span>
            </Row>
            <Row k="network">{trace.quote.network}</Row>
            <Row k="pay to">{short(trace.quote.payTo, 8)}</Row>
            <Row k="scheme">
              {trace.quote.scheme} · {trace.quote.mechanism}
            </Row>
          </dl>
        </Step>

        <Step
          n={3}
          title={trace.payment.signerRole === "agent" ? "The agent signed the payment" : "Lifeline signed, on credit"}
          aside="PAYMENT-SIGNATURE"
        >
          <p className="ink-2 leading-snug">{trace.payment.summary}</p>
          {trace.payment.authorization && (
            <details className="mt-2">
              <summary className="mono text-[10.5px] ink-3 cursor-pointer">what was signed</summary>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mono text-[10.5px] mt-2">
                {Object.entries(trace.payment.authorization).map(([k, v]) => (
                  <Row key={k} k={k}>
                    {k === "from" || k === "to" ? short(v, 8) : k === "nonce" ? short(v, 10) : v}
                  </Row>
                ))}
              </dl>
            </details>
          )}
        </Step>

        <Step n={4} title="The seller settled it" aside="PAYMENT-RESPONSE">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mono text-[11px]">
            <Row k="status">{trace.settlement.status} OK</Row>
            {settledTx && (
              <Row k={trace.rail === "arc" ? "settlement" : "transaction"}>
                {settlementLink ? (
                  <a href={settlementLink} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {short(settledTx, 10)} ↗
                  </a>
                ) : (
                  short(settledTx, 10)
                )}
              </Row>
            )}
            {receipt.payer && <Row k="payer">{short(String(receipt.payer), 8)}</Row>}
            {trace.rail === "arc" && (
              <dd className="col-span-2 ink-3 text-[10.5px] font-sans">Circle Gateway batches settlements; this id is its receipt.</dd>
            )}
          </dl>
        </Step>

        <Step n={5} title="Delivered" aside={trace.response.contentType?.split(";")[0] ?? ""} last />
      </ol>

      <div className="rule-t pt-4 space-y-3">
        <div className="lab">What it returned</div>
        <Artifact data={data} />
        <details>
          <summary className="mono text-[10.5px] ink-3 cursor-pointer">raw response</summary>
          <pre className="mono text-[10.5px] leading-relaxed mt-2 p-3 overflow-auto max-h-64" style={{ background: "var(--ground-2)" }}>
            {JSON.stringify(data, (k, v) => (k === "svg" ? "<svg … (drawn above)>" : v), 2)}
          </pre>
        </details>
      </div>
    </section>
  );
};

/** The purchased content, drawn as what it is. */
const Artifact: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <p className="text-[13px] ink-3">No content.</p>;

  // A chart or report as SVG. Drawn through <img>, which never runs scripts.
  if (typeof data.svg === "string") {
    return (
      <figure className="space-y-2">
        {data.title && <figcaption className="serif text-[18px]">{data.title}</figcaption>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`}
          alt={data.title ?? "Purchased artefact"}
          className="w-full h-auto bg-white"
          style={{ border: "1px solid var(--rule)" }}
        />
      </figure>
    );
  }

  // Rows of records.
  if (Array.isArray(data.records) && data.records.length) {
    const cols = Object.keys(data.records[0]).slice(0, 5);
    return (
      <div className="overflow-x-auto">
        <table className="w-full mono text-[10.5px]">
          <thead>
            <tr className="rule-b">
              {cols.map((c) => (
                <th key={c} className="text-left font-normal ink-3 py-1.5 pr-3 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.records.slice(0, 8).map((r: any, i: number) => (
              <tr key={i} className="hair-b">
                {cols.map((c) => (
                  <td key={c} className="py-1.5 pr-3 whitespace-nowrap">
                    {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.records.length > 8 && <p className="mono text-[10.5px] ink-3 mt-1.5">+ {data.records.length - 8} more in the raw response</p>}
      </div>
    );
  }

  // A result object: its fields, readable.
  const fields = (typeof data.data === "object" && data.data) || data;
  const entries = Object.entries(fields).filter(
    ([k, v]) => !["payment", "success", "svg", "artifact"].includes(k) && (typeof v !== "object" || v === null)
  );
  return (
    <div className="space-y-2">
      {(data.title || data.message) && <p className="serif text-[18px]">{data.title ?? data.message}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 mono text-[11px]">
        {entries.map(([k, v]) => (
          <Row key={k} k={k}>
            {String(v)}
          </Row>
        ))}
      </dl>
    </div>
  );
};
