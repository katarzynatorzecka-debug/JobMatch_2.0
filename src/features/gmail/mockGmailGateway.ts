import { GmailImportError, type GmailMailboxGateway, type GmailMessagePreview, type GmailRawMessage, type GmailSearchRequest } from './gmailContracts'

export type MockGmailMessage = { preview: GmailMessagePreview; raw: string }

export class MockGmailGateway implements GmailMailboxGateway {
  activeDownloads = 0
  maxObservedDownloads = 0
  readonly searchRequests: GmailSearchRequest[] = []
  readonly downloadedMessageIds: string[] = []

  constructor(private readonly messages: MockGmailMessage[]) {}

  async search(request: GmailSearchRequest) {
    this.searchRequests.push(request)
    return { messages: this.messages.slice(0, request.maxResults).map((message) => message.preview) }
  }

  async getRaw(messageId: string): Promise<GmailRawMessage> {
    const message = this.messages.find((candidate) => candidate.preview.id === messageId)
    if (!message) throw new GmailImportError('GMAIL_MESSAGE_NOT_FOUND')
    this.downloadedMessageIds.push(messageId)
    this.activeDownloads += 1
    this.maxObservedDownloads = Math.max(this.maxObservedDownloads, this.activeDownloads)
    await Promise.resolve()
    this.activeDownloads -= 1
    return { id: messageId, raw: message.raw, sizeEstimate: message.preview.sizeEstimate }
  }
}
