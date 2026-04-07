type ConfirmationEmailInput = { projectName: string; leadUrl: string }
type EmailOutput = { subject: string; html: string }

export function buildConfirmationEmail({ projectName, leadUrl }: ConfirmationEmailInput): EmailOutput {
  const subject = projectName
    ? `Your project is saved — ${projectName}`
    : 'Your project is saved'

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
            <p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;">
              ${projectName ? `Your <span style="color:#f5e642;">${projectName}</span> project is saved.` : 'Your project is saved.'}
            </p>
            <p style="margin:0 0 32px;font-size:14px;color:#a0a0a0;line-height:1.7;">
              We've saved your progress. Use the button below to come back and continue scoping, or submit when you're ready. The Contractors Direct team will be in touch once you submit.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:10px;background:#f5e642;">
                  <a href="${leadUrl}"
                     style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#111111;text-decoration:none;letter-spacing:0.01em;">
                    Open my project →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:12px;color:#555555;line-height:1.6;">
              Or copy this link: <a href="${leadUrl}" style="color:#f5e642;text-decoration:none;">${leadUrl}</a>
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
