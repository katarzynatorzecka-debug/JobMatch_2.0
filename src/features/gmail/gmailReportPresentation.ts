import type { GmailEdgeMessagePreview, GmailImportedReport } from './gmailEdgeContracts'

export type PresentedGmailImportedReport = GmailImportedReport & {
  displayName: string
}

function receivedDate(value: string, locale: 'pl' | 'en') {
  return new Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function presentGmailImportedReports(
  reports: GmailImportedReport[],
  messages: GmailEdgeMessagePreview[],
  locale: 'pl' | 'en',
  reportLabel: string,
): PresentedGmailImportedReport[] {
  const previews = new Map(messages.map((message) => [message.messageRef, message]))
  return reports.map((report) => {
    const preview = previews.get(report.messageRef)
    return { ...report, displayName: preview ? `${reportLabel} · ${receivedDate(preview.receivedAt, locale)}` : reportLabel }
  })
}
