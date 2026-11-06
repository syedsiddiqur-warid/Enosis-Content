/** Readable names for link audit events. */
export const EVENT_LABELS: Record<string, string> = {
  created: "Request created",
  email_sent: "Email sent",
  email_dev_inbox: "Email delivered to dev inbox",
  email_blocked: "Email blocked",
  email_failed: "Email failed",
  opened: "Link opened",
  opened_revoked: "Opened after it was revoked",
  opened_expired: "Opened after it expired",
  opened_completed: "Opened after completion",
  resent: "Resent with a fresh link",
  reminded: "Reminder sent",
  revoked: "Revoked",
  completed: "Completed",
  otp_sent: "Verification code sent",
  otp_verified: "Verification code accepted",
  otp_failed: "Wrong verification code",
};
