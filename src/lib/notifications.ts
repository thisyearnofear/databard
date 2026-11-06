/**
 * Notification utility — sends weekly digest notifications via email or webhook.
 *
 * Email delivery uses a configurable approach:
 * 1. If RESEND_API_KEY is set, use Resend's HTTP API (no SMTP port needed)
 * 2. If SMTP_URL is set, use nodemailer
 * 3. If EMAIL_WEBHOOK_URL is set, POST to that URL (e.g. Slack, Zapier, custom service)
 * 4. Otherwise, log and skip (development mode)
 *
 * This keeps the product deployable without an email service while supporting
 * production email delivery when configured. Resend HTTP is preferred over SMTP
 * because many cloud providers block outbound port 465.
 */

import { scoreHex } from "@/lib/product/score-tone";

export interface DigestNotification {
  schemaName: string;
  healthScore: number;
  healthScoreChange?: number;
  episodeUrl: string;
  dashboardUrl: string;
  recipients: string[];
  summary: string;
}

export async function sendDigestEmail(notification: DigestNotification): Promise<{ sent: boolean; method: string }> {
  const { recipients, schemaName, healthScore, healthScoreChange, episodeUrl, dashboardUrl, summary } = notification;

  if (recipients.length === 0) return { sent: false, method: "none" };

  const subject = `DataBard Weekly — ${schemaName}: Health ${healthScore}/100${healthScoreChange ? ` (${healthScoreChange > 0 ? "+" : ""}${healthScoreChange})` : ""}`;
  const textBody = [
    `Your weekly data health briefing for ${schemaName} is ready.`,
    ``,
    `Health score: ${healthScore}/100${healthScoreChange ? ` (${healthScoreChange > 0 ? "up" : "down"} ${Math.abs(healthScoreChange)} from last week)` : ""}`,
    ``,
    `Summary: ${summary}`,
    ``,
    `Listen to the 2-minute briefing: ${episodeUrl}`,
    `View the dashboard: ${dashboardUrl}`,
    ``,
    `— DataBard`,
  ].join("\n");

  // Method 1: Resend HTTP API (preferred — no SMTP port needed)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const from = process.env.EMAIL_FROM || "DataBard <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject,
          text: textBody,
          html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="margin-bottom: 0.5rem;">Your weekly data health briefing</h2>
            <p style="color: #666; margin-bottom: 1rem;">${schemaName}</p>
            <div style="font-size: 2rem; font-weight: bold; color: ${scoreHex(healthScore)};">${healthScore}/100</div>
            ${healthScoreChange ? `<p style="color: ${healthScoreChange > 0 ? "#22c55e" : "#ef4444"}; font-size: 0.875rem;">${healthScoreChange > 0 ? "↑" : "↓"} ${Math.abs(healthScoreChange)} from last week</p>` : ""}
            <p style="margin: 1rem 0; color: #444;">${summary}</p>
            <a href="${episodeUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; margin: 0.5rem 0;">▶ Listen to briefing</a>
            <br>
            <a href="${dashboardUrl}" style="color: #6366f1; font-size: 0.875rem;">View dashboard →</a>
            <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;">
            <p style="font-size: 0.75rem; color: #999;">Sent by DataBard · <a href="${dashboardUrl}" style="color: #999;">Manage subscriptions</a></p>
          </div>`,
        }),
      });
      if (res.ok) {
        return { sent: true, method: "resend" };
      }
      const errText = await res.text();
      console.error("[notifications] Resend API error:", res.status, errText);
    } catch (e) {
      console.error("[notifications] Resend send failed:", e);
    }
  }

  // Method 2: SMTP via nodemailer (if configured and installed)
  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    try {
      // Dynamic import — nodemailer is an optional dependency
      let nodemailer: any;
      try {
        // Use eval to bypass TypeScript module resolution for optional dep
        nodemailer = await (Function("return import('nodemailer')")());
      } catch {
        console.warn("[notifications] SMTP_URL set but nodemailer not installed. Install with: npm install nodemailer");
      }
      if (nodemailer) {
        const transporter = nodemailer.createTransport(smtpUrl);
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || "DataBard <digest@databard.dev>",
          to: recipients.join(", "),
          subject,
          text: textBody,
          html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="margin-bottom: 0.5rem;">Your weekly data health briefing</h2>
            <p style="color: #666; margin-bottom: 1rem;">${schemaName}</p>
            <div style="font-size: 2rem; font-weight: bold; color: ${scoreHex(healthScore)};">${healthScore}/100</div>
            ${healthScoreChange ? `<p style="color: ${healthScoreChange > 0 ? "#22c55e" : "#ef4444"}; font-size: 0.875rem;">${healthScoreChange > 0 ? "↑" : "↓"} ${Math.abs(healthScoreChange)} from last week</p>` : ""}
            <p style="margin: 1rem 0; color: #444;">${summary}</p>
            <a href="${episodeUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; margin: 0.5rem 0;">▶ Listen to briefing</a>
            <br>
            <a href="${dashboardUrl}" style="color: #6366f1; font-size: 0.875rem;">View dashboard →</a>
            <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;">
            <p style="font-size: 0.75rem; color: #999;">Sent by DataBard · <a href="${dashboardUrl}" style="color: #999;">Manage subscriptions</a></p>
          </div>`,
        });
        return { sent: true, method: "smtp" };
      }
    } catch (e) {
      console.error("[notifications] SMTP send failed:", e);
      // Fall through to webhook
    }
  }

  // Method 3: Webhook (Slack, Zapier, custom email service)
  const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (emailWebhookUrl) {
    try {
      await fetch(emailWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipients,
          subject,
          text: textBody,
          schemaName,
          healthScore,
          healthScoreChange,
          episodeUrl,
          dashboardUrl,
          summary,
        }),
      });
      return { sent: true, method: "webhook" };
    } catch (e) {
      console.error("[notifications] Email webhook failed:", e);
    }
  }

  // Method 4: Development mode — log and skip
  console.log(`[notifications] Email not sent (no SMTP_URL or EMAIL_WEBHOOK_URL). Would send to: ${recipients.join(", ")}`);
  console.log(`[notifications] Subject: ${subject}`);
  return { sent: false, method: "dev" };
}

/**
 * Sends a paid audit report (Shipyard `databard_health_*` SKUs).
 * Same delivery ladder: Resend → SMTP → webhook → dev log.
 */
export async function sendAuditReportEmail(opts: {
  email: string;
  report: {
    plan: string;
    orderRef: string;
    generatedAt: string;
    category: string | null;
    score: number | null;
    findings: string[];
    benchmarks: { metric: string; claim: string; source: string }[];
    actions: string[];
    caveats: string[];
  };
}): Promise<{ sent: boolean; method: string }> {
  const { email, report } = opts;
  const tierLabel = report.plan.replace(/^health_/, "");
  const subject = `DataBard ${tierLabel} audit — ${report.category ?? "your data"}`;
  const lines = [
    `Your ${tierLabel} audit is ready (order ${report.orderRef}).`,
    ``,
    report.score !== null ? `Score: ${report.score}/100` : `Score: not assessed (see caveats)`,
    ``,
    ...(report.findings.length ? ["Findings:", ...report.findings.map((f) => `- ${f}`), ``] : []),
    ...(report.benchmarks.length
      ? ["Benchmarks:", ...report.benchmarks.map((b) => `- ${b.metric}: ${b.claim} (${b.source})`), ``]
      : []),
    ...(report.actions.length ? ["Action plan:", ...report.actions.map((a, i) => `${i + 1}. ${a}`), ``] : []),
    ...(report.caveats.length ? ["Caveats:", ...report.caveats.map((c) => `- ${c}`), ``] : []),
    `Generated ${report.generatedAt}.`,
    `— DataBard`,
  ];
  const textBody = lines.join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
    <h2 style="margin-bottom: 0.25rem;">Your ${esc(tierLabel)} audit</h2>
    <p style="color: #666; font-size: 0.8rem;">order ${esc(report.orderRef)} · ${esc(report.category ?? "general")}</p>
    ${report.score !== null ? `<div style="font-size: 2rem; font-weight: bold; color: ${scoreHex(report.score)};">${report.score}/100</div>` : ""}
    ${report.findings.length ? `<h3>Findings</h3><ul>${report.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${report.benchmarks.length ? `<h3>Benchmarks</h3><ul>${report.benchmarks.map((b) => `<li><strong>${esc(b.metric)}</strong>: ${esc(b.claim)} <a href="${esc(b.source)}">source</a></li>`).join("")}</ul>` : ""}
    ${report.actions.length ? `<h3>Action plan</h3><ol>${report.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>` : ""}
    ${report.caveats.length ? `<p style="font-size: 0.75rem; color: #999;">${report.caveats.map(esc).join("<br>")}</p>` : ""}
    <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;">
    <p style="font-size: 0.75rem; color: #999;">DataBard · generated ${esc(report.generatedAt)}</p>
  </div>`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "DataBard <audit@databard.dev>",
          to: [email],
          subject,
          text: textBody,
          html,
        }),
      });
      if (res.ok) return { sent: true, method: "resend" };
      console.error("[notifications] Resend audit-report error:", res.status, await res.text());
    } catch (e) {
      console.error("[notifications] Resend audit-report failed:", e);
    }
  }

  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    try {
      const nodemailer = await (Function("return import('nodemailer')")() as Promise<any>);
      if (nodemailer) {
        const transporter = nodemailer.createTransport(smtpUrl);
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || "DataBard <audit@databard.dev>",
          to: email,
          subject,
          text: textBody,
          html,
        });
        return { sent: true, method: "smtp" };
      }
    } catch (e) {
      console.error("[notifications] SMTP audit-report failed:", e);
    }
  }

  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject, text: textBody, report }),
      });
      return { sent: true, method: "webhook" };
    } catch (e) {
      console.error("[notifications] Email webhook audit-report failed:", e);
    }
  }

  console.log(`[notifications] Audit report for ${email} (no delivery configured — dev mode)`);
  return { sent: false, method: "dev" };
}

/**
 * Sends a passwordless sign-in code for the given email.
 * Uses the same delivery ladder as digests: Resend → SMTP → webhook → dev log.
 */
export async function sendLoginCodeEmail(email: string, code: string): Promise<{ sent: boolean; method: string }> {
  const userLabel = process.env.EMAIL_FROM || "DataBard <onboarding@resend.dev>";
  const subject = "Your DataBard sign-in code";
  const textBody = [
    `Your DataBard sign-in code is: ${code}`,
    ``,
    `It expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    ``,
    `— DataBard`,
  ].join("\n");

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: userLabel,
          to: [email],
          subject,
          text: textBody,
          html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="margin-bottom: 0.5rem;">Your DataBard sign-in code</h2>
            <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.25em; color: #6366f1; margin: 1rem 0;">${code}</div>
            <p style="color: #444;">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
          </div>`,
        }),
      });
      if (res.ok) return { sent: true, method: "resend" };
      console.error("[notifications] Resend login-code error:", res.status, await res.text());
    } catch (e) {
      console.error("[notifications] Resend login-code failed:", e);
    }
  }

  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    try {
      const nodemailer = await (Function("return import('nodemailer')")() as Promise<any>);
      if (nodemailer) {
        const transporter = nodemailer.createTransport(smtpUrl);
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || "DataBard <login@databard.dev>",
          to: email,
          subject,
          text: textBody,
        });
        return { sent: true, method: "smtp" };
      }
    } catch (e) {
      console.error("[notifications] SMTP login-code failed:", e);
    }
  }

  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject, text: textBody, code }),
      });
      return { sent: true, method: "webhook" };
    } catch (e) {
      console.error("[notifications] Email webhook login-code failed:", e);
    }
  }

  console.log(`[notifications] Sign-in code for ${email}: ${code} (no delivery configured — dev mode)`);
  return { sent: false, method: "dev" };
}
