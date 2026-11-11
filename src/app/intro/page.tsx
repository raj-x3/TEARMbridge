"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./intro.css";

const WORKSPACE = "/workspace/overview";

export default function IntroductionPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const container = containerRef.current;
    if (!container) return;

    const $ = (s: string, r: Element | Document = container) =>
      r.querySelector(s) as HTMLElement | null;
    const $$ = (s: string, r: Element | Document = container) =>
      Array.from(r.querySelectorAll(s)) as HTMLElement[];

    const cp = (id: string, l: string, h: string, p: string, x = "") =>
      `<div class="copy" id="${id}"><small>${l}</small><h2>${h
        .split(" ")
        .map((w) => `<span class="w"><i>${w}</i></span>`)
        .join(" ")}</h2><p>${p}</p>${x}</div>`;

    const row = (a: string, b: string, c = "") =>
      `<div class="r"><span>${a}</span><em${c ? ` class="${c}"` : ""}>${b}</em></div>`;

    const card = (
      c: string,
      w: number,
      l: number,
      t: number,
      tag: string,
      id: string,
      rows: string
    ) =>
      `<div class="card ${c}" style="--w:${w}%;left:${l}%;top:${t}%"><div class="ch"><i>${tag}</i><b>${id}</b></div>${rows}</div>`;

    const sw = (a: string, b: string) =>
      `<em class="x"><s class="o">${a}</s><b class="n">${b}</b></em>`;

    const scn = (id: string, copies: string, body: string) =>
      `<div class="scn" id="${id}">${copies}<div class="cards"><div class="rig"><svg class="ln"></svg>${body}</div></div></div>`;

    const evr = (a: string, b: string, e: string) =>
      `<div class="r"><span>${a}</span><em>${b}<i class="ev">↗ ${e}</i></em></div>`;

    const mini = [
      "Purchase Order|PO-8821",
      "Agreement|AGR-1042",
      "Intelligence|Gemini",
      "Validation|4 issues",
      "Counteroffer|v1",
      "Approval|2 of 2",
      "Invoice|INV-PO8821",
      "Payment|Reconciled",
    ];

    const mob = window.innerWidth < 760;
    const ATM =
      `<div class="atm" aria-hidden="true">` +
      [
        ["8%", "20%", 44, "rgba(49,89,217,.16)"],
        ["62%", "-8%", 38, "rgba(234,240,255,.95)"],
        ["78%", "52%", 46, "rgba(49,89,217,.10)"],
        ["30%", "60%", 40, "rgba(255,255,255,.95)"],
        ["-6%", "44%", 34, "rgba(21,155,112,.08)"],
      ]
        .map(
          (b) =>
            `<i class="blob" style="left:${b[0]};top:${b[1]};width:${b[2]}vw;height:${b[2]}vw;background:radial-gradient(circle,${b[3]},transparent 68%)"></i>`
        )
        .join("") +
      Array.from(
        { length: 14 },
        (_, i) =>
          `<i class="dot" style="left:${(i * 37 + 11) % 96}%;top:${
            (i * 53 + 7) % 90
          }%;width:${8 + (i % 4) * 7}px;height:${8 + (i % 4) * 7}px"></i>`
      ).join("") +
      `</div><div class="bgt" aria-hidden="true">${"<span>TERMBridge</span>".repeat(
        8
      )}</div><div class="bgs" aria-hidden="true">${"<span>Purchase order · Agreement · Validation · Counteroffer · Approval · Invoice · Payment · </span>".repeat(
        6
      )}</div><div class="grain"></div>`;

    const stage = $("#stage", container);
    if (!stage) return;

    stage.innerHTML =
      ATM +
      scn(
        "g1",
        cp(
          "c1",
          "The problem: commercial fragmentation",
          "Every order has a story. Why is it still so hard to follow?",
          "Purchase orders, agreements, amendments, changing terms and payment updates. Commercial information is scattered across documents, inboxes and spreadsheets."
        ) +
          cp(
            "c2",
            "Connected commercial workspace",
            "Bring the entire deal into one place.",
            "TERMBridge connects the documents, parties, terms and transaction history behind every commercial order."
          ),
        `<div class="pan"><span>Agreement summary</span><span>Purchase order</span><span>Document versions</span><span>Buyer · Northstar Supply</span><span>Supplier · Meridian Retail</span><span>Transaction timeline</span></div>` +
          card(
            "po",
            34,
            2,
            6,
            "PURCHASE ORDER",
            "PO-8821",
            row("Supplier", "Northstar Supply") +
              row("Amount", "$4,500") +
              row("Quantity", "45 units") +
              row("Status", "Awaiting verification")
          ) +
          card(
            "ag",
            34,
            46,
            2,
            "MASTER AGREEMENT",
            "AGR-1042",
            row("Payment terms", "Net 45") +
              row("Min. quantity", "50") +
              row("Max. discount", "10%")
          ) +
          card(
            "am",
            30,
            56,
            40,
            "AMENDMENT",
            "v2",
            row("Updated", "Payment terms") +
              row("Updated", "Delivery conditions") +
              row("Effective", "Date")
          ) +
          card(
            "ms",
            30,
            4,
            58,
            "SUPPLIER MESSAGE",
            "INBOX",
            `<p style="padding-top:.4em">“Can we proceed with the revised quantity?”</p>`
          ) +
          `<div class="tlw"><u></u><div style="left:0">Agreement</div><div style="left:44%">Order</div><div style="right:0;text-align:right">Amendment</div></div>`
      ) +
      scn(
        "g3",
        cp(
          "c3",
          "Gemini commercial intelligence",
          "Stop reading the same contract twice.",
          "Gemini extracts commercial terms from purchase orders, master agreements and amendments, with evidence linked to the original source."
        ),
        card(
          "pdf",
          38,
          0,
          4,
          "AGREEMENT PDF",
          "AGR-1042",
          `<div class="bar" style="width:70%"></div>` +
            `<div class="bar h"></div>`.repeat(2) +
            `<div class="bar"></div><div class="bar h" style="width:85%"></div><div class="bar"></div><div class="bar h" style="width:60%"></div><div class="bar"></div><div class="scan"></div>`
        ) +
          card(
            "pp",
            22,
            0,
            62,
            "PO",
            "PO-8821",
            `<div class="bar"></div><div class="bar" style="width:60%"></div>`
          ) +
          card(
            "pa",
            22,
            24,
            66,
            "AMENDMENT",
            "v2",
            `<div class="bar"></div><div class="bar" style="width:60%"></div>`
          ) +
          `<div class="card ex" style="--w:50%;left:44%;top:6%"><div class="ch"><i>EXTRACTED TERMS</i><b>GEMINI</b></div>` +
          evr("Quantity", "Min 50", "AGR-1042") +
          evr("Unit price", "$100.00", "PO-8821") +
          evr("Discount", "Max 10%", "AGR-1042") +
          evr("Payment terms", "Net 45", "AGR-1042") +
          evr("Delivery", "7 business days", "AGR-1042") +
          row("Sources", "3 linked documents") +
          `</div>` +
          ["Min 50", "Max 10%", "Net 45", "7 business days"]
            .map((t) => `<div class="tile">${t}</div>`)
            .join("")
      ) +
      scn(
        "g4",
        cp(
          "c4",
          "Deterministic commercial validation",
          "Catch the mismatch before it becomes a dispute.",
          "TERMBridge compares the requested terms against the operative agreement using deterministic commercial rules."
        ),
        `<div class="cmp">` +
          card(
            "ca",
            38,
            0,
            0,
            "PURCHASE ORDER",
            "PO-8821",
            row("", "45") +
              row("", "15%") +
              row("", "Net 60") +
              row("", "3 business days")
          ) +
          `<div class="col">` +
          ["Quantity", "Discount", "Payment", "Delivery"]
            .map((l) => `<div class="r"><u></u><b>${l}</b></div>`)
            .join("") +
          `</div>` +
          card(
            "cb",
            38,
            0,
            0,
            "AGREED TERMS",
            "AGR-1042",
            row("", "Min 50") +
              row("", "Max 10%") +
              row("", "Net 45") +
              row("", "7 business days")
          ) +
          `</div>` +
          `<div class="card sum" style="--w:50%"><div class="ch"><i>DISCREPANCY SUMMARY</i></div><div class="chips"><div class="chip">QUANTITY MISMATCH</div><div class="chip">DISCOUNT EXCEEDS LIMIT</div><div class="chip">PAYMENT TERM CONFLICT</div><div class="chip">DELIVERY DISCREPANCY</div></div><div class="big">4 ISSUES IDENTIFIED</div></div>`
      ) +
      scn(
        "g5",
        cp(
          "c5",
          "Structured negotiation",
          "Don’t just flag the problem. Move the deal forward.",
          "Convert commercial discrepancies into structured counteroffers that both parties can review and approve."
        ),
        card(
          "or",
          30,
          0,
          30,
          "ORIGINAL ORDER",
          "PO-8821",
          row("Quantity", "45") +
            row("Discount", "15%") +
            row("Payment", "Net 60")
        ) +
          card(
            "ru",
            36,
            36,
            0,
            "COMMERCIAL RULES",
            "AGR-1042",
            row("Quantity requirement", "50") +
              row("Maximum discount", "10%") +
              row("Payment", "Net 45")
          ) +
          card(
            "co",
            40,
            34,
            36,
            "PROPOSED COUNTEROFFER",
            sw("DRAFT", "v1").replace("<em", '<em class="x vc"'),
            row("Quantity", sw("45", "50")) +
              row("Discount", sw("15%", "10%")) +
              row("Payment", sw("Net 60", "Net 45")) +
              row("Delivery", sw("—", "7 business days")) +
              row("Subtotal", "$4,500")
          )
      ) +
      scn(
        "g6",
        cp(
          "c6",
          "Mutual approval",
          "Buyers and suppliers. On the same page.",
          "Both sides review the same counteroffer version before the transaction can be finalized."
        ),
        card(
          "by",
          30,
          0,
          4,
          "BUYER",
          "Northstar Supply",
          row("", "Review counteroffer") +
            row("", "Approve terms") +
            row(
              "Status",
              `<span class="x"><i class="o pill">PENDING</i><i class="n pill">✓ APPROVED</i></span>`
            )
        ) +
          card(
            "su",
            30,
            66,
            4,
            "SUPPLIER",
            "Meridian Retail",
            row("", "Review counteroffer") +
              row("", "Approve terms") +
              row(
                "Status",
                `<span class="x"><i class="o pill">PENDING</i><i class="n pill">✓ APPROVED</i></span>`
              )
          ) +
          card(
            "cc",
            32,
            34,
            2,
            "COUNTEROFFER",
            "VERSION 01",
            row("", "TERMS HASH VERIFIED") + row("Total", "$4,500.00 USD")
          ) +
          `<div class="card fin" style="--w:32%;left:34%;top:54%"><div class="face a"><div class="ch"><i>TRANSACTION</i><b>PO-8821</b></div>${row(
            "Counteroffer",
            "v01"
          )}${row(
            "Amount",
            "$4,500.00 USD"
          )}</div><div class="face b"><div class="ch"><i>TRANSACTION</i><b>PO-8821</b></div><div class="big ok">FINALIZED</div><p class="mono" style="font-size:.85em;color:var(--mu)">Both parties approved v01</p></div></div>`
      ) +
      scn(
        "g7",
        cp(
          "c7",
          "PayPal invoice and payment reconciliation",
          "The deal is agreed. The payment can follow.",
          "Finalized commercial terms become a PayPal invoice. Payment status is reconciled against authoritative PayPal records."
        ),
        card(
          "iv",
          44,
          0,
          4,
          "TERMBridge INVOICE",
          "INV-PO8821",
          row("Reference", "PO-8821") +
            row("Amount", "$4,500.00 USD") +
            row("Payment terms", "Net 45")
        ) +
          card(
            "tx",
            30,
            8,
            34,
            "FINALIZED TRANSACTION",
            "PO-8821",
            row("Amount", "$4,500.00 USD")
          ) +
          card(
            "pv",
            40,
            52,
            4,
            "PAYPAL STATUS",
            "SANDBOX",
            row(
              "Status",
              `<span class="x"><i class="o pill">SENT</i><i class="n pill">PAID</i></span>`
            ) +
              row("Settled", "<span id='amt'>$0.00</span>") +
              row("Source", "PayPal records")
          ) +
          `<div class="cap">PAYPAL SANDBOX DEMONSTRATION<br><span style="color:var(--mu)">Illustrative. Does not initiate a payment.</span></div>` +
          `<div class="flow">` +
          [
            "FINALIZED TRANSACTION",
            "INVOICE CREATED",
            "INVOICE SENT",
            "PAYMENT RECEIVED",
            "STATUS RECONCILED",
          ]
            .map((s) => `<div>${s}</div>`)
            .join("") +
          `</div>`
      ) +
      `<div class="scn" id="gf">` +
      `<div class="copy" id="cf" style="left:0;right:0;width:auto;max-width:none;top:8vh;bottom:auto;align-items:center;text-align:center"><h2 style="font-size:clamp(32px,5.2vw,76px)"><span class="w"><i>From</i></span> <span class="w"><i>agreement</i></span><br><span class="w"><i>to</i></span> <span class="w"><i>payment.</i></span></h2><p>One connected workflow for commercial intelligence, negotiation, approvals and B2B payment.</p><div class="cta"><a class="go" href="${WORKSPACE}">ENTER TERMBridge →</a><a href="#" id="rp">REPLAY EXPERIENCE</a></div></div>` +
      `<div class="cards" style="left:0;right:0;width:100%;top:${
        mob ? 46 : 46
      }%;height:${mob ? "48svh" : "46vh"}"><div class="rig"><svg class="ln"></svg>` +
      mini
        .map((m, i) => {
          const [a, b] = m.split("|");
          const W = mob ? 21 : 11;
          const S = mob ? 24.5 : 12.3;
          const c = mob ? i % 4 : i;
          const r = mob ? (i < 4 ? 0 : 50) : i % 2 ? 32 : 6;
          return `<div class="card mini" style="--w:${W}%;left:${
            1 + c * S
          }%;top:${r}%"><i class="mono" style="font-size:.8em;color:var(--bl);font-style:normal">0${
            i + 1
          }</i><b>${a}</b><span>${b}</span></div>`;
        })
        .join("") +
      `</div></div><div class="ft">COMMERCIAL INTELLIGENCE / NEGOTIATION / PAYMENT</div></div>`;

    // Wire up all .go links for fast router transition or standard click
    $$(".go", container).forEach((a) => {
      a.setAttribute("href", WORKSPACE);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        router.push(WORKSPACE);
      });
    });

    const names = [
      "PROBLEM",
      "WORKSPACE",
      "DOCUMENTS",
      "VALIDATION",
      "NEGOTIATION",
      "APPROVAL",
      "PAYMENT",
      "ECOSYSTEM",
    ];

    const init = () => {
      const NS = "http://www.w3.org/2000/svg";
      const G = (i: string) => $("#" + i, container);
      const Rg = (i: string) => {
        const parent = G(i);
        return parent ? ($(".rig", parent) as HTMLElement) : null;
      };

      const P = (e: HTMLElement, s: string) => {
        const x = e.offsetLeft;
        const y = e.offsetTop;
        const w = e.offsetWidth;
        const h = e.offsetHeight;
        return s === "r"
          ? [x + w, y + h / 2]
          : s === "l"
          ? [x, y + h / 2]
          : s === "b"
          ? [x + w / 2, y + h]
          : s === "t"
          ? [x + w / 2, y]
          : [x + w / 2, y + h / 2];
      };

      const L = (
        rig: HTMLElement | null,
        a: HTMLElement | null,
        b: HTMLElement | null,
        sa = "r",
        sb = "l"
      ) => {
        if (!rig || !a || !b) return null;
        const A = P(a, sa);
        const B = P(b, sb);
        const h = sa === "r" || sa === "l";
        const m1 = h ? [(A[0] + B[0]) / 2, A[1]] : [A[0], (A[1] + B[1]) / 2];
        const m2 = h ? [(A[0] + B[0]) / 2, B[1]] : [B[0], (A[1] + B[1]) / 2];
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", `M${A[0]} ${A[1]} C${m1[0]} ${m1[1]} ${m2[0]} ${m2[1]} ${B[0]} ${B[1]}`);
        p.setAttribute("pathLength", "1");
        p.setAttribute("class", "pl");
        const ln = $(".ln", rig);
        if (ln) ln.appendChild(p);
        return p;
      };

      const R1 = Rg("g1");
      const R3 = Rg("g3");
      const R4 = Rg("g4");
      const R5 = Rg("g5");
      const R6 = Rg("g6");
      const R7 = Rg("g7");
      const RF = Rg("gf");

      if (!R1 || !R3 || !R4 || !R5 || !R6 || !R7 || !RF) return;

      const q = (r: HTMLElement, c: string) => $(c, r);
      const T = gsap.timeline({ defaults: { ease: "power3.out" } });
      timelineRef.current = T;

      // Connectors
      const l1 = [
        L(R1, q(R1, ".po"), q(R1, ".ag")),
        L(R1, q(R1, ".ag"), q(R1, ".am"), "b", "t"),
        L(R1, q(R1, ".ms"), q(R1, ".po"), "t", "b"),
      ].filter(Boolean);

      const l3 = L(R3, q(R3, ".pdf"), q(R3, ".ex"));
      const l6 = [
        L(R6, q(R6, ".by"), q(R6, ".fin"), "b", "l"),
        L(R6, q(R6, ".su"), q(R6, ".fin"), "b", "r"),
      ].filter(Boolean);
      const l7 = L(R7, q(R7, ".iv"), q(R7, ".pv"));

      const mc = $$(".mini", RF);
      const lf = document.createElementNS(NS, "path");
      const pt = mc.map((e) => P(e, "c"));
      if (pt.length > 0) {
        lf.setAttribute(
          "d",
          "M" +
            pt[0][0] +
            " " +
            pt[0][1] +
            pt
              .slice(1)
              .map((p, i) => {
                const a = pt[i];
                const m = (a[0] + p[0]) / 2;
                return ` C${m},${a[1]} ${m},${p[1]} ${p[0]},${p[1]}`;
              })
              .join("")
        );
        lf.setAttribute("pathLength", "1");
        lf.setAttribute("class", "pl");
        const lnF = $(".ln", RF);
        if (lnF) lnF.appendChild(lf);
      }

      const io = (el: HTMLElement | null, a: number | null, b?: number) => {
        if (!el) return;
        if (a !== null) T.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: "none" }, a);
        if (b !== undefined) T.to(el, { autoAlpha: 0, duration: 0.8, ease: "none" }, b);
      };

      const cio = (elSelector: string, a: number | null, b?: number) => {
        const c = $(elSelector, container);
        if (!c) return;
        const w = $$(".w i", c);
        const r = [
          $("small", c),
          $("p", c),
          $(".cta", c),
        ].filter(Boolean) as HTMLElement[];

        if (a !== null) {
          T.fromTo(c, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "none" }, a)
            .fromTo(
              w,
              { yPercent: 115 },
              { yPercent: 0, duration: 1, ease: "power4.out", stagger: 0.045 },
              a
            )
            .fromTo(
              r,
              { autoAlpha: 0, y: 14 },
              { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12 },
              a + 0.3
            );
        } else {
          gsap.set(c, { autoAlpha: 1 });
        }

        if (b !== undefined) {
          T.to(w, { yPercent: -115, duration: 0.6, ease: "power3.in", stagger: 0.025 }, b)
            .to(r, { autoAlpha: 0, duration: 0.4, ease: "none" }, b)
            .to(c, { autoAlpha: 0, duration: 0.1, ease: "none" }, b + 0.8);
        }
      };

      const G1 = G("g1");
      if (G1) gsap.set(G1, { autoAlpha: 1 });

      io(G("g1"), null, 19.2);
      io(G("g3"), 19.8, 29.2);
      io(G("g4"), 29.8, 39.2);
      io(G("g5"), 39.8, 49.2);
      io(G("g6"), 49.8, 59.2);
      io(G("g7"), 59.8, 69.2);
      io(G("gf"), 69.8);

      cio("#c1", null, 9.2);
      cio("#c2", 9.8, 19.2);
      cio("#c3", 19.8, 29.2);
      cio("#c4", 29.8, 39.2);
      cio("#c5", 39.8, 49.2);
      cio("#c6", 49.8, 59.2);
      cio("#c7", 59.8, 69.2);
      cio("#cf", 70.2);

      const bo = "power4.out";

      // S1 — fragmentation
      const poEl = q(R1, ".po");
      const agEl = q(R1, ".ag");
      const amEl = q(R1, ".am");
      const msEl = q(R1, ".ms");

      if (poEl)
        T.fromTo(
          poEl,
          { x: -420, z: -350, rotationY: 24, autoAlpha: 0, filter: "blur(8px)" },
          { x: 0, z: 0, rotationY: 7, autoAlpha: 1, filter: "blur(0px)", duration: 3, ease: bo },
          0.3
        );
      if (agEl)
        T.fromTo(
          agEl,
          { x: 420, z: -650, rotationY: -24, autoAlpha: 0, filter: "blur(8px)" },
          { x: 0, z: -80, rotationY: -6, autoAlpha: 1, filter: "blur(0px)", duration: 3, ease: bo },
          1.2
        );
      if (amEl)
        T.fromTo(
          amEl,
          { z: -900, y: 40, autoAlpha: 0, filter: "blur(8px)" },
          { z: -200, y: 0, rotationY: -3, autoAlpha: 1, filter: "blur(0px)", duration: 2.6 },
          2.6
        );
      if (msEl)
        T.fromTo(
          msEl,
          { y: 160, x: -60, z: 60, autoAlpha: 0, filter: "blur(6px)" },
          { y: 0, x: 0, z: 40, rotationY: 4, autoAlpha: 1, filter: "blur(0px)", duration: 2 },
          4
        );
      if (l1.length > 0)
        T.to(l1, { strokeDashoffset: 0, duration: 2, stagger: 0.3, ease: "none" }, 5.3);

      T.fromTo(R1, { z: -40 }, { z: 90, duration: 10, ease: "none" }, 0);

      // S2 — connected workspace
      const l1Parents = l1.map((p) => p?.parentNode).filter(Boolean);
      if (l1Parents.length > 0) T.to(l1Parents, { autoAlpha: 0, duration: 0.6 }, 10.2);

      const panEl = q(R1, ".pan");
      if (panEl)
        T.fromTo(
          panEl,
          { autoAlpha: 0, z: -140, rotationX: 8 },
          { autoAlpha: 1, z: -30, rotationX: 0, duration: 3 },
          10.4
        );

      [
        ["po", 3],
        ["ag", 27],
        ["am", 51],
        ["ms", 75],
      ].forEach(([c, l], i) => {
        const item = q(R1, "." + c);
        if (item) {
          T.to(
            item,
            {
              left: l + "%",
              top: "30%",
              scale: 0.62,
              z: 0,
              x: 0,
              y: 0,
              rotationY: -3,
              duration: 3.2,
              ease: "power2.inOut",
            },
            10.6 + i * 0.25
          );
        }
      });

      const tlwU = q(R1, ".tlw u");
      if (tlwU) T.fromTo(tlwU, { scaleX: 0 }, { scaleX: 1, duration: 3, ease: "none" }, 13);
      T.fromTo(
        $$(".tlw div", R1),
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, stagger: 1, duration: 0.8 },
        13.6
      );
      T.to(R1, { z: -90, duration: 6, ease: "power2.inOut" }, 10);

      // S3 — document intelligence
      const pdf = q(R3, ".pdf");
      const ex = q(R3, ".ex");
      const exr = ex ? $$(".r", ex) : [];
      const tl = $$(".tile", R3);

      if (pdf)
        T.fromTo(
          pdf,
          { x: -300, z: -200, autoAlpha: 0 },
          { x: 0, z: 0, autoAlpha: 1, duration: 2.5, ease: bo },
          20.2
        );

      const pppa = [q(R3, ".pp"), q(R3, ".pa")].filter(Boolean);
      if (pppa.length > 0)
        T.fromTo(pppa, { y: 120, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 2, stagger: 0.3 }, 21);

      const scanEl = q(R3, ".scan");
      if (scanEl) {
        T.fromTo(scanEl, { top: "0%" }, { top: "92%", duration: 3, ease: "none" }, 22.5);
        T.to(scanEl, { autoAlpha: 0, duration: 0.4 }, 25.5);
      }

      if (pdf)
        T.fromTo(
          $$(".bar.h", pdf),
          { backgroundColor: "#E5E7EB" },
          { backgroundColor: "#BFD0FF", stagger: 0.7, duration: 0.5 },
          22.6
        );

      if (ex)
        T.fromTo(
          ex,
          { autoAlpha: 0, z: -100, rotationY: -14 },
          { autoAlpha: 1, z: 0, rotationY: -4, duration: 3, ease: "power2.out" },
          24
        );

      if (l3) T.fromTo(l3, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2, ease: "none" }, 23.4);

      if (exr.length > 0)
        T.fromTo(exr, { opacity: 0 }, { opacity: 1, stagger: 0.45, duration: 0.5 }, 25);

      if (pdf && ex) {
        tl.forEach((t, i) => {
          const targetIndex = [0, 2, 3, 4][i];
          const tr = exr[targetIndex];
          if (!tr) return;
          const sx = pdf.offsetLeft + pdf.offsetWidth * 0.55;
          const sy = pdf.offsetTop + pdf.offsetHeight * (0.2 + i * 0.18);
          gsap.set(t, { left: sx, top: sy, autoAlpha: 0 });
          T.to(t, { autoAlpha: 1, duration: 0.4 }, 23 + i * 0.5)
            .to(
              t,
              {
                left: ex.offsetLeft + tr.offsetLeft + 10,
                top: ex.offsetTop + tr.offsetTop,
                duration: 1.6,
                ease: "power2.inOut",
              },
              23.4 + i * 0.5
            )
            .to(t, { autoAlpha: 0, duration: 0.3 }, 25.2 + i * 0.5);
        });
      }

      if (ex)
        T.fromTo(
          $$(".ev", ex),
          { scale: 0 },
          { scale: 1, stagger: 0.3, duration: 0.4, transformOrigin: "0 50%" },
          26.4
        );

      T.fromTo(R3, { z: -20 }, { z: 120, duration: 7, ease: "power2.inOut" }, 20).to(
        R3,
        { z: "+=130", duration: 0.8, ease: "power2.in" },
        28.6
      );

      // S4 — validation
      const caEl = q(R4, ".ca");
      const cbEl = q(R4, ".cb");
      if (caEl)
        T.fromTo(
          caEl,
          { x: -380, z: -120, rotationY: 14, autoAlpha: 0 },
          { x: 0, z: 0, rotationY: 5, autoAlpha: 1, duration: 2.6, ease: bo },
          30.2
        );
      if (cbEl)
        T.fromTo(
          cbEl,
          { x: 380, z: -120, rotationY: -14, autoAlpha: 0 },
          { x: 0, z: 0, rotationY: -5, autoAlpha: 1, duration: 2.6, ease: bo },
          30.2
        );

      T.fromTo($$(".col .r", R4), { opacity: 0 }, { opacity: 1, stagger: 0.3, duration: 0.4 }, 32.4);
      T.fromTo($$(".col u", R4), { scaleX: 0 }, { scaleX: 1, stagger: 0.3, duration: 1, ease: "none" }, 32.6);

      [".ca", ".cb"].forEach((c) => {
        const parentCard = q(R4, c);
        if (parentCard) {
          T.fromTo(
            $$(".r", parentCard),
            { z: 0, backgroundColor: "rgba(251,243,227,0)", boxShadow: "inset 0 0 0 #D99A32" },
            {
              z: 22,
              backgroundColor: "rgba(251,243,227,1)",
              boxShadow: "inset 3px 0 0 #D99A32",
              stagger: 0.5,
              duration: 0.8,
            },
            33.8
          );
        }
      });

      const sumEl = q(R4, ".sum");
      if (sumEl)
        T.fromTo(sumEl, { y: 70, z: -40, autoAlpha: 0 }, { y: 0, z: 40, autoAlpha: 1, duration: 2 }, 35.6);
      T.fromTo(
        $$(".chip", R4),
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, stagger: 0.4, duration: 0.5 },
        36.4
      );
      const bigEl = q(R4, ".big");
      if (bigEl) T.fromTo(bigEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 38);

      T.fromTo(R4, { x: -50, rotationY: 3 }, { x: 50, rotationY: -3, duration: 9, ease: "none" }, 30);
      T.fromTo(R4, { z: -180 }, { z: 0, duration: 1.4, ease: "power3.out" }, 29.8).to(
        R4,
        { z: 140, duration: 0.8, ease: "power2.in" },
        38.6
      );

      // S5 — negotiation
      const co = q(R5, ".co");
      const orEl = q(R5, ".or");
      const ruEl = q(R5, ".ru");

      if (orEl)
        T.fromTo(
          orEl,
          { x: -300, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, rotationY: 5, duration: 2.4, ease: bo },
          40.2
        );
      if (ruEl)
        T.fromTo(
          ruEl,
          { y: -260, z: -150, rotationX: -8, autoAlpha: 0 },
          { y: 0, z: 0, rotationX: 0, autoAlpha: 1, duration: 2.4 },
          41.4
        );
      if (co)
        T.fromTo(
          co,
          { autoAlpha: 0, scale: 0.85, z: -250 },
          { autoAlpha: 1, scale: 1, z: 0, duration: 2 },
          43
        );

      if (co) {
        $$(".r", co)
          .slice(0, 4)
          .forEach((r, i) =>
            T.to($(".o", r), { autoAlpha: 0, duration: 0.6 }, 44.6 + i * 0.8).to(
              $(".n", r),
              { opacity: 1, duration: 0.6 },
              44.6 + i * 0.8
            )
          );
        const vcO = $(".vc .o", co);
        const vcN = $(".vc .n", co);
        if (vcO) T.to(vcO, { autoAlpha: 0, duration: 0.6 }, 48.2);
        if (vcN) T.to(vcN, { opacity: 1, duration: 0.6 }, 48.2);

        T.to(co, { z: 120, duration: 2.5, ease: "power2.inOut" }, 47.5);
      }

      const orRu = [orEl, ruEl].filter(Boolean);
      if (orRu.length > 0) T.to(orRu, { z: -40, duration: 2.5 }, 47.5);

      T.fromTo(R5, { rotationY: -5, x: -30 }, { rotationY: 5, x: 30, duration: 9, ease: "none" }, 40);
      T.fromTo(R5, { z: -180 }, { z: 0, duration: 1.4, ease: "power3.out" }, 39.8).to(
        R5,
        { z: 140, duration: 0.8, ease: "power2.in" },
        48.6
      );

      // S6 — approval
      const ap = (c: string) => [$$(".pill.o", q(R6, c)!), $$(".pill.n", q(R6, c)!)];
      const byEl = q(R6, ".by");
      const suEl = q(R6, ".su");
      const ccEl = q(R6, ".cc");
      const finEl = q(R6, ".fin");

      if (byEl)
        T.fromTo(
          byEl,
          { x: -320, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, rotationY: 4, duration: 2, ease: bo },
          50.2
        );
      if (suEl)
        T.fromTo(
          suEl,
          { x: 320, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, rotationY: -4, duration: 2, ease: bo },
          50.2
        );
      if (ccEl)
        T.fromTo(ccEl, { autoAlpha: 0, z: -200 }, { autoAlpha: 1, z: 0, duration: 2 }, 51);

      if (l6.length > 0)
        T.fromTo(l6, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: "none" }, 52.4);

      if (byEl) {
        const [byO, byN] = ap(".by");
        if (byO[0]) T.to(byO[0], { autoAlpha: 0, duration: 0.4 }, 53.6);
        if (byN[0]) T.to(byN[0], { opacity: 1, duration: 0.4 }, 53.6);
      }
      if (suEl) {
        const [suO, suN] = ap(".su");
        if (suO[0]) T.to(suO[0], { autoAlpha: 0, duration: 0.4 }, 55);
        if (suN[0]) T.to(suN[0], { opacity: 1, duration: 0.4 }, 55);
      }

      if (finEl) {
        T.fromTo(finEl, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1.2 }, 55.6);
        T.fromTo(finEl, { rotationY: 0 }, { rotationY: 180, duration: 1.8, ease: "power2.inOut" }, 57.2);
      }

      T.fromTo(R6, { z: 0 }, { z: 40, duration: 9, ease: "none" }, 50);

      // S7 — invoice & payment
      const amt = $("#amt", container);
      const o = { v: 0 };
      const txEl = q(R7, ".tx");
      const ivEl = q(R7, ".iv");
      const pvEl = q(R7, ".pv");

      if (txEl) {
        T.fromTo(txEl, { x: -360, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 2, ease: bo }, 60.2);
        T.to(txEl, { autoAlpha: 0, scale: 0.9, z: -60, duration: 1 }, 63.6);
      }
      if (ivEl) {
        T.fromTo(ivEl, { autoAlpha: 0, z: -120, y: 30 }, { autoAlpha: 1, z: 0, y: 0, duration: 2 }, 62.4);
        T.fromTo($$(".r", ivEl), { opacity: 0 }, { opacity: 1, stagger: 0.3, duration: 0.5 }, 63);
      }
      if (pvEl) {
        T.fromTo(
          pvEl,
          { x: 340, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, rotationY: -4, duration: 2, ease: bo },
          64
        );
      }
      if (l7)
        T.fromTo(l7, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, ease: "none" }, 65.4);

      const capEl = q(R7, ".cap");
      if (capEl) T.fromTo(capEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, 63.4);

      T.fromTo($$(".flow div", R7), { opacity: 0.3 }, { opacity: 1, stagger: 0.7, duration: 0.5 }, 64.2);

      const pvsO = $$(".pill.o", R7);
      const pvsN = $$(".pill.n", R7);
      if (pvsO.length > 0) T.to(pvsO, { autoAlpha: 0, duration: 0.4 }, 67);
      if (pvsN.length > 0) T.to(pvsN, { opacity: 1, duration: 0.4 }, 67);

      T.to(
        o,
        {
          v: 4500,
          duration: 1.2,
          ease: "power2.out",
          onUpdate: () => {
            if (amt) {
              amt.textContent =
                "$" +
                o.v.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
            }
          },
        },
        67
      );

      T.fromTo(R7, { z: -20 }, { z: 100, duration: 4, ease: "none" }, 60).to(
        R7,
        { z: -80, duration: 4, ease: "power2.inOut" },
        65
      );

      // Final — ecosystem
      if (mc.length > 0)
        T.fromTo(
          mc,
          { z: -400, y: 60, autoAlpha: 0 },
          { z: 0, y: 0, autoAlpha: 1, stagger: 0.4, duration: 1.8 },
          70.4
        );

      if (lf)
        T.fromTo(lf, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 4, ease: "none" }, 73);

      T.fromTo(RF, { z: 60 }, { z: -260, duration: 10, ease: "none" }, 70).to(
        {},
        { duration: 0.01 },
        79.99
      );

      $$(".blob", container).forEach((b, i) =>
        T.fromTo(
          b,
          { x: i % 2 ? 60 : -30, y: 80 },
          { x: -(180 + i * 70), y: -(160 + i * 90), duration: 80, ease: "none" },
          0
        )
      );
      $$(".dot", container).forEach((d, i) =>
        T.fromTo(
          d,
          { x: 0, y: 0 },
          { x: -(60 + (i % 5) * 45), y: -(180 + (i % 4) * 160), duration: 80, ease: "none" },
          0
        )
      );

      [
        [19.5, "#F1F5FF"],
        [29.5, "#FBF5E9"],
        [39.5, "#F4F6FB"],
        [49.5, "#EEF7F3"],
        [69.5, "#F7F7F5"],
      ].forEach(([t, c]) => {
        const stageEl = $("#stage", container);
        if (stageEl) {
          T.to(stageEl, { backgroundColor: c as string, duration: 2.2, ease: "none" }, t as number);
        }
      });

      const sn = $("#sn", container);
      const barI = $("#bar i", container);
      let last = -1;

      const pinEl = $("#pin", container);
      const stageEl = $("#stage", container);

      if (pinEl && stageEl) {
        scrollTriggerRef.current = ScrollTrigger.create({
          animation: T,
          trigger: pinEl,
          start: "top top",
          end: () => "+=" + window.innerHeight * 7.5,
          pin: stageEl,
          scrub: 1.1,
          onUpdate: (s) => {
            if (barI) barI.style.width = s.progress * 100 + "%";
            const k = Math.min(7, Math.floor(s.progress * 8));
            if (k !== last) {
              last = k;
              if (sn) sn.textContent = (k < 7 ? "0" + (k + 1) : "07") + " / 07 " + names[k];
            }
          },
        });
      }

      const top = (e: MouseEvent) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      };

      const rp = $("#rp", container);
      const ov = $("#ov", container);
      if (rp) rp.onclick = top;
      if (ov) ov.onclick = top;
    };

    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isReduced) {
      document.documentElement.classList.add("rm");
      container.classList.add("rm");
      const rp = $("#rp", container);
      const ov = $("#ov", container);
      if (rp) {
        rp.onclick = (e) => {
          e.preventDefault();
          window.scrollTo(0, 0);
        };
      }
      if (ov) {
        ov.onclick = (e) => {
          e.preventDefault();
          window.scrollTo(0, 0);
        };
      }
    } else {
      if (document.fonts?.ready) {
        document.fonts.ready.then(init);
      } else {
        init();
      }
    }

    let W = window.innerWidth;
    let rt: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (Math.abs(window.innerWidth - W) > 40) {
          W = window.innerWidth;
          ScrollTrigger.refresh();
        }
      }, 400);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(rt);
      if (scrollTriggerRef.current) {
        scrollTriggerRef.current.kill();
      }
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
      ScrollTrigger.getAll().forEach((st) => st.kill());
      document.documentElement.classList.remove("rm");
    };
  }, [router]);

  return (
    <div ref={containerRef} className="intro-page">
      <header>
        <Link className="logo" href="/workspace/overview">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M2 19c4-11 18-11 22 0" stroke="#3159D9" strokeWidth="2.4" />
            <path d="M2 21h22" stroke="#171A20" strokeWidth="2.4" />
          </svg>
          TERMBridge
        </Link>
        <nav>
          <a href="#" id="ov">
            PRODUCT OVERVIEW
          </a>
          <Link href="/workspace/overview" className="go">
            SKIP INTRODUCTION →
          </Link>
        </nav>
      </header>

      <main id="pin">
        <section id="stage" aria-label="TERMBridge product introduction" />
      </main>

      <div id="ind">
        <b id="sn">01 / 07 PROBLEM</b>
        <div id="bar">
          <i />
        </div>
        <span>SCROLL TO EXPLORE</span>
      </div>
    </div>
  );
}
