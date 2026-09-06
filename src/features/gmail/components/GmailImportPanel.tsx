import { useCallback, useEffect, useState } from 'react'
import { Alert, PrimaryButton, SecondaryButton, SectionCard } from '../../../components/ui'
import type { AppMode } from '../../access/AppModeProvider'
import type { GmailConnectionStatusResponse } from '../gmailEdgeContracts'
import { GmailApiError, gmailApiClient, gmailReturnTargetForLocation } from '../gmailApiClient'
import { useI18n } from '../../../i18n/I18nProvider'

type GmailApiClient = typeof gmailApiClient
type GmailNotice = { kind: 'connected' } | { kind: 'error'; code: string } | null
type GmailErrorKey =
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

function errorKey(code: string): GmailErrorKey {
  if (code === 'GMAIL_NOT_CONNECTED' || code === 'GMAIL_REAUTH_REQUIRED' || code === 'GMAIL_OAUTH_CANCELLED') return 'import.gmail.error.auth'
  if (code === 'GMAIL_PERMISSION_DENIED') return 'import.gmail.error.permission'
  if (code === 'GMAIL_RATE_LIMITED') return 'import.gmail.error.rateLimited'
  if (code === 'GMAIL_TIMEOUT') return 'import.gmail.error.timeout'
  if (code === 'GMAIL_PROVIDER_UNAVAILABLE') return 'import.gmail.error.provider'
  return 'import.gmail.error.generic'
}

export function GmailImportPanel({ mode, client = gmailApiClient }: { mode: AppMode | null; client?: GmailApiClient }) {
  const { t } = useI18n()
  const [connection, setConnection] = useState<GmailConnectionStatusResponse>({ state: 'disconnected' })
  const [loading, setLoading] = useState(mode === 'authenticated')
  const [action, setAction] = useState<'connect' | 'disconnect' | null>(null)
  const [failure, setFailure] = useState<GmailErrorKey | null>(null)
  const [notice] = useState<GmailNotice>(() => oauthNotice(window.location.search))

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
    } catch (error) {
      setFailure(errorKey(error instanceof GmailApiError ? error.code : ''))
    } finally {
      setAction(null)
    }
  }

  return <SectionCard title={t('import.gmail.title')} className="import-source-card import-source-card--gmail">
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
          {connection.state !== 'active' && <PrimaryButton onClick={() => void connect()} disabled={action !== null}>{action === 'connect' ? t('import.gmail.connecting') : connection.state === 'reauth_required' ? t('import.gmail.reconnect') : t('import.gmail.connect')}</PrimaryButton>}
          {connection.state !== 'disconnected' && <SecondaryButton onClick={() => void disconnect()} disabled={action !== null}>{action === 'disconnect' ? t('import.gmail.disconnecting') : t('import.gmail.disconnect')}</SecondaryButton>}
          {failure && <SecondaryButton onClick={() => void refresh()} disabled={loading || action !== null}>{t('import.gmail.retryStatus')}</SecondaryButton>}
        </div>
      </>}
      <span className="field-hint">{t('import.gmail.readonlyHint')}</span>
    </div>
  </SectionCard>
}
