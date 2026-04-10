type OtpEmailInput = { code: string }
type EmailOutput = { subject: string; html: string }

export function buildOtpEmail({ code }: OtpEmailInput): EmailOutput {
  const subject = 'Your Contractors Direct verification code'
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
            <p style="margin:0 0 8px;font-size:14px;color:#727272;text-transform:uppercase;letter-spacing:0.1em;">Verification code</p>
            <p style="margin:0 0 32px;font-size:14px;color:#a0a0a0;line-height:1.6;">
              Use the code below to save your project. It expires in 10 minutes.
            </p>

            <!-- OTP Code -->
            <div style="text-align:center;background:#242424;border-radius:12px;padding:32px;margin:0 0 32px;">
              <span style="font-size:56px;font-weight:700;color:#7F77DD;letter-spacing:0.18em;font-family:'Courier New',monospace;">${code}</span>
            </div>

            <p style="margin:0;font-size:12px;color:#555555;line-height:1.6;">
              If you didn't request this, you can ignore this email — your project won't be saved without entering the code.
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
