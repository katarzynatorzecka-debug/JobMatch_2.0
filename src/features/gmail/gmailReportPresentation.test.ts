import { describe, expect, it } from 'vitest'
import type { GmailEdgeMessagePreview, GmailImportedReport } from './gmailEdgeContracts'
import { presentGmailImportedReports } from './gmailReportPresentation'

const technicalFileName = 'gmail-report-123e4567-e89b-42d3-a456-426614174000.eml'
const imported = [{
  receiptId: '123e4567-e89b-42d3-a456-426614174000',
  messageRef: 'opaque-ref',
  report: { version: 2, source: 'rocketjobs-gmail', reportProvider: 'rocketjobs', acquisitionChannel: 'gmail', fileName: technicalFileName, importedAt: '2026-09-06T10:05:00.000Z', warnings: [], offers: [] },
}] satisfies GmailImportedReport[]

const messages = [{ messageRef: 'opaque-ref', senderLabel: 'RocketJobs', subject: 'Raport', receivedAt: '2026-09-06T10:00:00.000Z', sizeEstimate: 512, alreadyImported: false }] satisfies GmailEdgeMessagePreview[]

describe('Gmail report presentation', () => {
  it('uses a readable message date while retaining the technical filename internally', () => {
    const [presented] = presentGmailImportedReports(imported, messages, 'pl', 'Raport Gmail')

    expect(presented.displayName).toContain('Raport Gmail')
    expect(presented.displayName).not.toContain(imported[0].receiptId)
    expect(presented.report.fileName).toBe(technicalFileName)
  })

  it('never exposes the technical filename when preview metadata is unavailable', () => {
    const [presented] = presentGmailImportedReports(imported, [], 'en', 'Gmail report')

    expect(presented.displayName).toBe('Gmail report')
  })
})
