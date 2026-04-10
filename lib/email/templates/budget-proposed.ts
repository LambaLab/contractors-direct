type BudgetProposedInput = {
  amount: number
  projectName: string
  clientNotes: string | null
  budgetUrl: string
}
type EmailOutput = { subject: string; html: string }

export function buildBudgetProposedEmail({ amount, projectName, clientNotes, budgetUrl }: BudgetProposedInput): EmailOutput {
  const subject = `Budget proposal for ${projectName} — $${amount.toLocaleString()}`

  const notesSection = clientNotes
    ? `<p style="margin:0 0 24px;font-size:14px;color:#a0a0a0;line-height:1.6;">${clientNotes.replace(/\n/g, '<br/>')}</p>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;padding:48px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.05em;text-transform:uppercase;">CONTRACTORS DIRECT</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:14px;color:#727272;text-transform:uppercase;letter-spacing:0.1em;">Budget Proposal</p>
            <p style="margin:0 0 24px;font-size:14px;color:#a0a0a0;line-height:1.6;">
              We've prepared a budget for <strong style="color:#ffffff;">${projectName}</strong>.
            </p>

            <!-- Amount -->
            <div style="text-align:center;background:#242424;border-radius:12px;padding:32px;margin:0 0 24px;">
              <span style="font-size:48px;font-weight:700;color:#02ba6f;font-family:'Courier New',monospace;">$${amount.toLocaleString()}</span>
            </div>

            ${notesSection}

            <!-- CTA -->
            <a href="${budgetUrl}" style="display:block;text-align:center;background:#7F77DD;color:#ffffff;font-weight:600;font-size:14px;padding:14px 24px;border-radius:10px;text-decoration:none;margin:0 0 24px;">
              Review & Respond
            </a>

            <p style="margin:0;font-size:12px;color:#555555;line-height:1.6;">
              You can accept, counter-propose, or request a call to discuss further.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:12px;color:#444444;">
              Contractors Direct &middot; Renovation Services
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}
