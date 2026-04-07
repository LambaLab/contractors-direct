type BudgetResponseInput = {
  projectName: string
  status: 'accepted' | 'countered' | 'call_requested'
  amount: number
  counterAmount?: number | null
  counterNotes?: string | null
  clientEmail: string
}
type EmailOutput = { subject: string; html: string }

export function buildBudgetResponseEmail({ projectName, status, amount, counterAmount, counterNotes, clientEmail }: BudgetResponseInput): EmailOutput {
  const statusLabels: Record<string, string> = {
    accepted: 'Accepted',
    countered: 'Counter-Proposed',
    call_requested: 'Call Requested',
  }

  const statusColors: Record<string, string> = {
    accepted: '#02ba6f',
    countered: '#0082fe',
    call_requested: '#727272',
  }

  const label = statusLabels[status] ?? status
  const color = statusColors[status] ?? '#ffffff'
  const subject = `Budget ${label.toLowerCase()} — ${projectName}`

  let detailSection = ''
  if (status === 'countered' && counterAmount) {
    detailSection = `
      <div style="background:#242424;border-radius:12px;padding:24px;margin:0 0 24px;">
        <p style="margin:0 0 8px;font-size:12px;color:#727272;text-transform:uppercase;">Counter-offer</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:#0082fe;">$${counterAmount.toLocaleString()}</p>
        ${counterNotes ? `<p style="margin:12px 0 0;font-size:14px;color:#a0a0a0;">${counterNotes.replace(/\n/g, '<br/>')}</p>` : ''}
      </div>`
  } else if (status === 'call_requested' && counterNotes) {
    detailSection = `
      <div style="background:#242424;border-radius:12px;padding:24px;margin:0 0 24px;">
        <p style="margin:0 0 8px;font-size:12px;color:#727272;text-transform:uppercase;">Client note</p>
        <p style="margin:0;font-size:14px;color:#a0a0a0;line-height:1.6;">${counterNotes.replace(/\n/g, '<br/>')}</p>
      </div>`
  }

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

        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.05em;text-transform:uppercase;">CONTRACTORS DIRECT</span>
          </td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:14px;color:#727272;text-transform:uppercase;letter-spacing:0.1em;">Budget Response</p>
            <p style="margin:0 0 24px;font-size:14px;color:#a0a0a0;line-height:1.6;">
              <strong style="color:#ffffff;">${clientEmail}</strong> has responded to the $${amount.toLocaleString()} budget for <strong style="color:#ffffff;">${projectName}</strong>.
            </p>

            <div style="text-align:center;padding:16px;margin:0 0 24px;">
              <span style="font-size:24px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.05em;">${label}</span>
            </div>

            ${detailSection}
          </td>
        </tr>

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
