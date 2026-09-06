import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, PrimaryButton, SecondaryButton, SectionCard } from '../../../components/ui'
import type { AppMode } from '../../access/AppModeProvider'
import { useI18n } from '../../../i18n/I18nProvider'
import type { GmailConnectionStatusResponse, GmailEdgeMessagePreview } from '../gmailEdgeContracts'
import { GMAIL_ROCKETJOBS_DEFAULT_SENDER } from '../gmailEdgeContracts'
import type { GmailSearchFilters } from '../gmailContracts'
import { GmailApiError, gmailApiClient, gmailReturnTargetForLocation } from '../gmailApiClient'
import { presentGmailImportedReports, type PresentedGmailImportedReport } from '../gmailReportPresentation'

type GmailApiClient = typeof gmailApiClient
type GmailNotice = { kind: 'connected' } | { kind: 'error'; code: string } | null
type GmailErrorKey =
  | 'import.gmail.error.dateRangeInvalid'
  | 'import.gmail.error.queryInvalid'
  | 'import.gmail.error.messageInvalid'
  | 'import.gmail.error.messageTooLarge'
  | 'import.gmail.error.reportEmpty'
  | 'import.gmail.error.auth'
  | 'import.gmail.error.permission'
  | 'import.gmail.error.rateLimited'
  | 'import.gmail.error.timeout'
  | 'import.gmail.error.provider'
  | 'import.gmail.error.generic'

function oauthNotice(search: string): GmailNotice {
  const params = new URLSearchParams(search)
  if (params.get('gmail') === 'connected') return { kind: 'connected' }
  if (params.get('gmail') === 'error') return { kind: 'error', code: params.get('code') ?? '' }
  return null
}

function errorKey(code: string, operation: 'connection' | 'search' | 'import' = 'connection'): GmailErrorKey {
  if (code === 'GMAIL_NOT_CONNECTED' || code === 'GMAIL_REAUTH_REQUIRED' || code === 'GMAIL_OAUTH_CANCELLED') return 'import.gmail.error.auth'
  if (code === 'GMAIL_PERMISSION_DENIED') return 'import.gmail.error.permission'
  if (code === 'GMAIL_RATE_LIMITED') return 'import.gmail.error.rateLimited'
  if (code === 'GMAIL_TIMEOUT') return 'import.gmail.error.timeout'
  if (code === 'GMAIL_PROVIDER_UNAVAILABLE') return 'import.gmail.error.provider'
  if (code === 'GMAIL_MESSAGE_TOO_LARGE') return 'import.gmail.error.messageTooLarge'
  if (code === 'GMAIL_REPORT_EMPTY') return 'import.gmail.error.reportEmpty'
  if (code === 'GMAIL_MESSAGE_INVALID') return operation === 'search' ? 'import.gmail.error.queryInvalid' : 'import.gmail.error.messageInvalid'
  return 'import.gmail.error.generic'
}

function receivedDate(value: string, locale: 'pl' | 'en') {
  return new Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function mergeMessages(current: GmailEdgeMessagePreview[], incoming: GmailEdgeMessagePreview[]) {
  return [...new Map([...current, ...incoming].map((message) => [message.messageRef, message])).values()]
}

const emptyFilters: GmailSearchFilters = { sender: GMAIL_ROCKETJOBS_DEFAULT_SENDER, subject: '', after: '', before: '' }

export function GmailImportPanel({ mode, onReportsImported, client = gmailApiClient }: { mode: AppMode | null; onReportsImported: (reports: PresentedGmailImportedReport[]) => void; client?: GmailApiClient }) {
  const { t, locale } = useI18n()
  const [connection, setConnection] = useState<GmailConnectionStatusResponse>({ state: 'disconnected' })
  const [loading, setLoading] = useState(mode === 'authenticated')
  const [action, setAction] = useState<'connect' | 'disconnect' | null>(null)
  const [failure, setFailure] = useState<GmailErrorKey | null>(null)
  const [notice] = useState<GmailNotice>(() => oauthNotice(window.location.search))
  const [expanded, setExpanded] = useState(false)
  const [filters, setFilters] = useState<GmailSearchFilters>(emptyFilters)
  const [messages, setMessages] = useState<GmailEdgeMessagePreview[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [searchFailure, setSearchFailure] = useState<GmailErrorKey | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [importing, setImporting] = useState(false)
  const selectedCount = selected.size
  const availableCount = useMemo(() => messages.filter((message) => !message.alreadyImported).length, [messages])

  const refresh = useCallback(async () => {
    if (mode !== 'authenticated') return
    setLoading(true)
    setFailure(null)
    try {
      setConnection(await client.connectionStatus())
    } catch (error) {
      setFailure(errorKey(error instanceof GmailApiError ? error.code : ''))
    } finally {
      setLoading(false)
    }
  }, [client, mode])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!notice) return
    const url = new URL(window.location.href)
    url.searchParams.delete('gmail')
    url.searchParams.delete('code')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [notice])

  async function connect() {
    setAction('connect')
    setFailure(null)
    try {
      const response = await client.startOAuth(gmailReturnTargetForLocation(window.location))
      window.location.assign(response.authorizationUrl)
    } catch (error) {
      setFailure(errorKey(error instanceof GmailApiError ? error.code : ''))
      setAction(null)
    }
  }

  async function disconnect() {
    if (!window.confirm(t('import.gmail.disconnectConfirm'))) return
    setAction('disconnect')
    setFailure(null)
    try {
      await client.disconnect()
      setConnection({ state: 'disconnected' })
      setExpanded(false)
      setMessages([])
      setSelected(new Set())
    } catch (error) {
      setFailure(errorKey(error instanceof GmailApiError ? error.code : ''))
    } finally {
      setAction(null)
    }
  }

  function updateFilter(field: keyof GmailSearchFilters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  async function search(loadMore = false) {
    if (filters.after && filters.before && filters.after >= filters.before) {
      setSearchFailure('import.gmail.error.dateRangeInvalid')
      setSearchState('error')
      return
    }
    setSearchState('loading')
    setSearchFailure(null)
    try {
      const response = await client.search({ ...filters, ...(loadMore && nextPageToken ? { pageToken: nextPageToken } : {}) })
      setMessages((current) => loadMore ? mergeMessages(current, response.messages) : response.messages)
      setNextPageToken(response.nextPageToken)
      if (!loadMore) setSelected(new Set())
      setSearchState('ready')
    } catch (error) {
      const code = error instanceof GmailApiError ? error.code : ''
      if (code === 'GMAIL_REAUTH_REQUIRED') setConnection({ state: 'reauth_required', maskedEmail: connection.maskedEmail })
      if (code === 'GMAIL_NOT_CONNECTED') setConnection({ state: 'disconnected' })
      setSearchFailure(errorKey(code, 'search'))
      setSearchState('error')
    }
  }

  function toggleMessage(message: GmailEdgeMessagePreview) {
    if (message.alreadyImported) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(message.messageRef)) next.delete(message.messageRef)
      else next.add(message.messageRef)
      return next
    })
  }

  async function importSelected() {
    if (!selected.size) return
    setImporting(true)
    setSearchFailure(null)
    try {
      const response = await client.importSelected([...selected])
      onReportsImported(presentGmailImportedReports(response.reports, messages, locale, t('import.gmail.reportLabel')))
      setSelected(new Set())
    } catch (error) {
      const code = error instanceof GmailApiError ? error.code : ''
      if (code === 'GMAIL_REAUTH_REQUIRED') setConnection({ state: 'reauth_required', maskedEmail: connection.maskedEmail })
      setSearchFailure(errorKey(code, 'import'))
    } finally {
      setImporting(false)
    }
  }

  return <SectionCard title={t('import.gmail.title')} className={`import-source-card import-source-card--gmail${expanded ? ' import-source-card--expanded' : ''}`}>
    <div className="import-source-card__body">
      <span className="import-source-icon import-source-icon--gmail" aria-hidden="true">@</span>
      <p>{t('import.gmail.copy')}</p>
      {notice?.kind === 'connected' && <Alert title={t('import.gmail.connectedTitle')} tone="success">{t('import.gmail.connectedCopy')}</Alert>}
      {notice?.kind === 'error' && <Alert title={t('import.gmail.errorTitle')} tone="warning">{t(errorKey(notice.code))}</Alert>}
      {failure && <Alert title={t('import.gmail.errorTitle')} tone="warning">{t(failure)}</Alert>}
      {mode === 'demo' ? <>
        <p className="gmail-status-copy">{t('import.gmail.demoDisabled')}</p>
        <div className="action-row"><PrimaryButton disabled>{t('import.gmail.connect')}</PrimaryButton></div>
      </> : loading ? <p className="gmail-status-copy" role="status">{t('import.gmail.statusLoading')}</p> : <>
        {connection.state === 'active' && <p className="gmail-connection-status gmail-connection-status--active" role="status"><span aria-hidden="true" />{t('import.gmail.statusConnected', { email: connection.maskedEmail ?? t('import.gmail.maskedAccount') })}</p>}
        {connection.state === 'disconnected' && <p className="gmail-status-copy" role="status">{t('import.gmail.statusDisconnected')}</p>}
        {connection.state === 'reauth_required' && <p className="gmail-connection-status gmail-connection-status--warning" role="status"><span aria-hidden="true" />{t('import.gmail.statusReauth')}</p>}
        <div className="action-row">
          {connection.state === 'active' && <PrimaryButton onClick={() => setExpanded((current) => !current)}>{expanded ? t('import.gmail.hideSearch') : t('import.gmail.openSearch')}</PrimaryButton>}
          {connection.state !== 'active' && <PrimaryButton onClick={() => void connect()} disabled={action !== null}>{action === 'connect' ? t('import.gmail.connecting') : connection.state === 'reauth_required' ? t('import.gmail.reconnect') : t('import.gmail.connect')}</PrimaryButton>}
          {connection.state !== 'disconnected' && <SecondaryButton onClick={() => void disconnect()} disabled={action !== null}>{action === 'disconnect' ? t('import.gmail.disconnecting') : t('import.gmail.disconnect')}</SecondaryButton>}
          {failure && <SecondaryButton onClick={() => void refresh()} disabled={loading || action !== null}>{t('import.gmail.retryStatus')}</SecondaryButton>}
        </div>
      </>}
      <span className="field-hint">{t('import.gmail.readonlyHint')}</span>

      {mode === 'authenticated' && connection.state === 'active' && expanded && <div className="gmail-search-panel">
        <div className="gmail-search-heading"><div><h3>{t('import.gmail.searchTitle')}</h3><p>{t('import.gmail.searchCopy')}</p></div><button type="button" className="gmail-preset" onClick={() => setFilters(emptyFilters)}>{t('import.gmail.rocketJobsPreset')}</button></div>
        <div className="gmail-filter-grid">
          <label>{t('import.gmail.senderLabel')}<input type="text" value={filters.sender ?? ''} onChange={(event) => updateFilter('sender', event.target.value)} /></label>
          <label>{t('import.gmail.subjectLabel')}<input type="text" value={filters.subject ?? ''} onChange={(event) => updateFilter('subject', event.target.value)} placeholder={t('import.gmail.subjectPlaceholder')} /></label>
          <label>{t('import.gmail.afterLabel')}<input type="date" value={filters.after ?? ''} onChange={(event) => updateFilter('after', event.target.value)} /></label>
          <label>{t('import.gmail.beforeLabel')}<input type="date" value={filters.before ?? ''} onChange={(event) => updateFilter('before', event.target.value)} /></label>
        </div>
        <div className="action-row"><PrimaryButton onClick={() => void search()} disabled={searchState === 'loading' || importing}>{searchState === 'loading' ? t('import.gmail.searching') : t('import.gmail.search')}</PrimaryButton></div>
        {searchFailure && <Alert title={t('import.gmail.searchErrorTitle')} tone="warning">{t(searchFailure)}</Alert>}
        {searchState === 'idle' && <p className="gmail-empty-state">{t('import.gmail.searchInitial')}</p>}
        {searchState === 'ready' && messages.length === 0 && <p className="gmail-empty-state">{t('import.gmail.noResults')}</p>}
        {messages.length > 0 && <>
          <div className="gmail-results-heading"><h3>{t('import.gmail.resultsTitle', { count: messages.length })}</h3><span>{t('import.gmail.availableCount', { count: availableCount })}</span></div>
          <ul className="gmail-message-list" aria-label={t('import.gmail.resultsAria')}>
            {messages.map((message) => <li key={message.messageRef} className={message.alreadyImported ? 'gmail-message gmail-message--imported' : 'gmail-message'}>
              <label className="gmail-message__selector"><input type="checkbox" checked={selected.has(message.messageRef)} disabled={message.alreadyImported || importing} onChange={() => toggleMessage(message)} aria-label={t('import.gmail.selectMessage', { subject: message.subject || t('import.gmail.noSubject') })} /><span /></label>
              <div className="gmail-message__content"><div className="gmail-message__heading"><strong>{message.subject || t('import.gmail.noSubject')}</strong>{message.alreadyImported && <span className="gmail-imported-badge">{t('import.gmail.alreadyImported')}</span>}</div><span>{message.senderLabel}</span><time dateTime={message.receivedAt}>{receivedDate(message.receivedAt, locale)}</time></div>
            </li>)}
          </ul>
          <div className="gmail-results-actions"><div><strong>{t('import.gmail.selectedCount', { count: selectedCount })}</strong><span>{t('import.gmail.importHint')}</span></div><div className="action-row">{nextPageToken && <SecondaryButton onClick={() => void search(true)} disabled={searchState === 'loading' || importing}>{searchState === 'loading' ? t('import.gmail.loadingMore') : t('import.gmail.loadMore')}</SecondaryButton>}<PrimaryButton onClick={() => void importSelected()} disabled={!selectedCount || importing}>{importing ? t('import.gmail.importing') : t('import.gmail.importSelected')}</PrimaryButton></div></div>
        </>}
      </div>}
    </div>
  </SectionCard>
}
