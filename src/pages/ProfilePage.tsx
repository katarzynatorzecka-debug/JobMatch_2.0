import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ContractType, ProfileFieldConfidence, ProfilePriority, UserProfile, UserProfileDraft, WorkMode } from '../contracts/profile'
import { emptyProfilePresentation } from '../contracts/profilePresentation'
import type { ProfilePresentationMetadata } from '../contracts/profilePresentation'
import { TagInput } from '../components/TagInput'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { defaultProfile } from '../features/profile/profileDefaults'
import { extractTextFromPdf } from '../features/profile/pdfTextExtractor'
import { extractProfileDraft } from '../features/profile/profileExtractor'
import { mapCvTextSemantically, SemanticProfileMappingError } from '../features/profile/semanticProfileMapper'
import { profileIntelligenceFromLegacy, synchronizeProfileIntelligence } from '../features/profile/profileIntelligence'
import { clearPendingProfileDraft, loadPendingProfileDraft, savePendingProfileDraft } from '../features/profile/pendingProfileDraftStorage'
import { getProfileQuestions, type ProfileQuestion } from '../features/profile/profileQuestions'
import { loadUserProfile, saveUserProfile } from '../features/profile/profileStorage'
import { clearProfilePresentation, loadProfilePresentation, saveProfilePresentation } from '../features/profile/profilePresentationStorage'
import { useAppMode } from '../features/access/AppModeProvider'
import { supabaseProfileRepository } from '../features/supabase/repositories'
import { validateUserProfile } from '../schemas/profileSchemas'
import { demoSampleProfile } from '../demo/demoSampleData'

type OnboardingStep = 'choice' | 'upload' | 'reading' | 'mapping' | 'recognition' | 'questions' | 'review' | 'manual' | 'saved'
const priorityLabels: Record<ProfilePriority, string> = { experience: 'Doświadczenie', skills: 'Umiejętności', preferences: 'Preferencje', growth: 'Rozwój' }
const processSteps = ['Sprawdzamy dokument', 'Odczytujemy tekst', 'Rozpoznajemy doświadczenie i umiejętności', 'Przygotowujemy profil do sprawdzenia']
const confidenceLabel = (value: ProfileFieldConfidence) => value === 'missing' ? 'Brak danych' : value === 'high' || value === 'manual' ? 'Rozpoznano' : 'Do sprawdzenia'

function toggle<T extends string>(values: T[], value: T, checked: boolean) { return checked ? [...values, value] : values.filter((item) => item !== value) }

export function ProfilePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { mode, session } = useAppMode()
  const [step, setStep] = useState<OnboardingStep>('choice')
  const [profile, setProfile] = useState<UserProfile>(defaultProfile)
  const [storedProfile, setStoredProfile] = useState<UserProfile | null>(null)
  const [presentation, setPresentation] = useState<ProfilePresentationMetadata>(emptyProfilePresentation)
  const [recognition, setRecognition] = useState<UserProfileDraft | null>(null)
  const [questions, setQuestions] = useState<ProfileQuestion[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fallbackText, setFallbackText] = useState('')
  const [showFallback, setShowFallback] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; title: string; text: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [manualBack, setManualBack] = useState<OnboardingStep>('choice')
  const [profileLoading, setProfileLoading] = useState(true)
  const pendingDraftScope = mode === 'authenticated' && session ? `user:${session.user.id}` : mode === 'demo' ? 'demo' : null

  useEffect(() => {
    if (mode === null) return
    if (mode === 'authenticated' && session) return
    const loaded = loadUserProfile()
    const pending = pendingDraftScope ? loadPendingProfileDraft(pendingDraftScope) : { draft: null }
    if (loaded.profile) { setStoredProfile(loaded.profile); if (!pending.draft) setProfile(loaded.profile) }
    setPresentation(pending.draft?.presentation ?? loadProfilePresentation().presentation)
    if (pending.draft) { setRecognition(pending.draft); setProfile(pending.draft.values); setStep('recognition'); setNotice({ tone: 'success', title: 'Przywrócono niezapisany szkic profilu', text: 'Szkic pozostaje tylko w tej sesji przeglądarki, dopóki go nie zapiszesz albo nie zaczniesz od nowa.' }) }
    else if (params.get('mode') === 'manual') setStep('manual')
    else if (params.get('mode') === 'cv') setStep('upload')
    else if (loaded.profile) setStep('saved')
    if (loaded.warning) setNotice({ tone: 'warning', title: 'Zapis profilu pominięty', text: loaded.warning })
    if (pending.warning) setNotice({ tone: 'warning', title: 'Szkic profilu pominięty', text: pending.warning })
    setProfileLoading(false)
  }, [mode, params, pendingDraftScope, session])

  useEffect(() => {
    if (mode !== 'authenticated' || !session) return
    let active = true
    setProfileLoading(true)
    const pending = pendingDraftScope ? loadPendingProfileDraft(pendingDraftScope) : { draft: null }
    if (pending.draft) { setRecognition(pending.draft); setProfile(pending.draft.values); setPresentation(pending.draft.presentation ?? emptyProfilePresentation); setStep('recognition'); setNotice({ tone: 'success', title: 'Przywrócono niezapisany szkic profilu', text: 'Szkic pozostaje tylko w tej sesji przeglądarki, dopóki go nie zapiszesz albo nie zaczniesz od nowa.' }) }
    if (pending.warning) setNotice({ tone: 'warning', title: 'Szkic profilu pominięty', text: pending.warning })
    void supabaseProfileRepository(session.user).load().then((loaded) => {
      if (!active) return
      if (loaded.data) { const localPresentation = loadProfilePresentation().presentation; setStoredProfile(loaded.data); if (!pending.draft) { setProfile(loaded.data); setPresentation(loaded.presentation.fullName ? loaded.presentation : localPresentation); if (!params.get('mode')) setStep('saved') } }
      if (loaded.error) setNotice({ tone: 'warning', title: 'Blad odczytu profilu', text: loaded.error })
    }).finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
  }, [mode, params, pendingDraftScope, session])

  useEffect(() => {
    if (!pendingDraftScope || !recognition) return
    savePendingProfileDraft({ ...recognition, values: profile, presentation }, pendingDraftScope)
  }, [pendingDraftScope, presentation, profile, recognition])

  const update = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => { setProfile((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: '' })) }
  const movePriority = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= profile.priorities.length) return
    const priorities = [...profile.priorities]; [priorities[index], priorities[target]] = [priorities[target], priorities[index]]
    update('priorities', priorities)
  }
  const startQuestions = () => {
    if (!recognition) return
    const nextQuestions = getProfileQuestions(recognition, profile)
    setQuestions(nextQuestions); setQuestionIndex(0); setStep(nextQuestions.length ? 'questions' : 'review')
  }
  const acceptRecognition = (draft: UserProfileDraft) => { setRecognition(draft); setProfile(draft.values); setPresentation(draft.presentation ?? emptyProfilePresentation); if (pendingDraftScope) savePendingProfileDraft(draft, pendingDraftScope); setMessage('Rozpoznaliśmy dane z CV. Sprawdź je, a następnie uzupełnij kilka informacji.'); setStep('recognition') }
  const mapDraft = async (text: string, source: 'pdf' | 'pasted-text') => {
    if (mode !== 'authenticated' || !session) return extractProfileDraft(text, source)
    return mapCvTextSemantically(text, source)
  }
  const mappingError = (error: unknown) => error instanceof SemanticProfileMappingError
    ? error.code === 'CV_MAPPER_UNAVAILABLE' ? 'Mapa semantyczna CV nie jest teraz dostępna. Spróbuj ponownie po zalogowaniu.'
      : error.code === 'CV_MAPPER_INVALID_RESPONSE' ? 'Nie udało się bezpiecznie odczytać wyniku mapowania CV. Spróbuj ponownie.'
        : 'Nie udało się przygotować mapy semantycznej CV. Spróbuj ponownie.'
    : error instanceof Error ? error.message : 'Nie udało się przygotować profilu.'
  const readPdf = async () => {
    if (!selectedFile) { setMessage('Wybierz plik PDF przed rozpoczęciem odczytu.'); return }
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf || selectedFile.size > 5 * 1024 * 1024) { setMessage(!isPdf ? 'Obsługiwane są wyłącznie pliki PDF.' : 'Plik przekracza limit 5 MB.'); return }
    if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope)
    setStep('reading'); setMessage('')
    const result = await extractTextFromPdf(selectedFile)
    if (!result.success) { setStep('upload'); setShowFallback(true); setMessage(result.warnings[0] ?? 'Nie udało się odczytać PDF.'); return }
    setStep('mapping')
    try { acceptRecognition(await mapDraft(result.text, 'pdf')) } catch (error) { setStep('upload'); setShowFallback(true); setMessage(mappingError(error)) }
  }
  const updatePresentationName = (fullName: string) => setPresentation({ fullName, source: fullName.trim() ? 'manual' : 'none' })
  const readFallback = async () => {
    if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope)
    try { acceptRecognition(await mapDraft(fallbackText, 'pasted-text')) } catch (error) { setMessage(mappingError(error)) }
  }
  const loadSampleProfile = () => {
    const saved = saveUserProfile(demoSampleProfile)
    if (!saved.success) { setNotice({ tone: 'warning', title: 'Nie udaÅ‚o siÄ™ wczytaÄ‡ profilu', text: String(saved.error) }); return }
    const savedPresentation = saveProfilePresentation({ fullName: 'Sarah Mitchell', source: 'manual' })
    if (!savedPresentation.success) { setNotice({ tone: 'warning', title: 'Nie udaÅ‚o siÄ™ wczytaÄ‡ nazwy profilu', text: savedPresentation.error }); return }
    if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope)
    setProfile(saved.data); setStoredProfile(saved.data); setPresentation(savedPresentation.data); setRecognition(null); setStep('saved')
    setNotice({ tone: 'success', title: 'Wczytano przykÅ‚adowy profil', text: 'MoÅ¼esz teraz przejÅ›Ä‡ do importu ofert.' })
  }
  const save = async () => {
    const synchronized = synchronizeProfileIntelligence(profile)
    const validation = validateUserProfile(synchronized)
    if (!validation.success) {
      const nextErrors: Record<string, string> = {}; validation.error.issues.forEach((issue) => { nextErrors[String(issue.path[0] ?? 'form')] = issue.message })
      setErrors(nextErrors); setNotice({ tone: 'warning', title: 'Profil wymaga uzupełnienia', text: 'Popraw oznaczone pola przed zapisem.' }); setManualBack('review'); setStep('manual'); return
    }
    if (mode === 'authenticated' && session) {
      const saved = await supabaseProfileRepository(session.user).save(validation.data, presentation)
      if (!saved.data) { setNotice({ tone: 'warning', title: 'Nie udalo sie zapisac profilu', text: saved.error ?? 'Sprobuj ponownie.' }); return }
      if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope)
      setProfile(saved.data); setStoredProfile(saved.data); setPresentation(saved.presentation.fullName ? saved.presentation : saveProfilePresentation(presentation).success ? presentation : saved.presentation); setRecognition(null); setNotice({ tone: 'success', title: 'Profil zapisany w chmurze', text: 'Mozesz teraz przejsc do importu ofert.' }); setStep('saved'); return
    }
    const saved = saveUserProfile(validation.data)
    if (!saved.success) { setNotice({ tone: 'warning', title: 'Nie udało się zapisać profilu', text: 'Sprawdź ustawienia pamięci lokalnej przeglądarki.' }); return }
    const savedPresentation = saveProfilePresentation(presentation)
    if (!savedPresentation.success) { setNotice({ tone: 'warning', title: 'Nie udało się zapisać nazwy profilu', text: savedPresentation.error }); return }
    if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope)
    setProfile(saved.data); setStoredProfile(saved.data); setPresentation(savedPresentation.data); setRecognition(null); setNotice({ tone: 'success', title: 'Profil zapisany lokalnie', text: 'Możesz teraz przejść do importu ofert.' }); setStep('saved')
  }
  const restart = async () => {
    if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope)
    setPresentation(emptyProfilePresentation); setProfile(defaultProfile); setRecognition(null); setQuestions([]); setQuestionIndex(0); setMessage(''); setFallbackText(''); setSelectedFile(null); setStep('choice')
    try {
      if (mode === 'authenticated' && session) await supabaseProfileRepository(session.user).clearPresentation()
      else clearProfilePresentation()
    } catch {
      setNotice({ tone: 'warning', title: 'Nie udało się wyczyścić nazwy profilu', text: 'Spróbuj ponownie przed zapisaniem nowego profilu.' })
    }
  }
  const openManual = (back: OnboardingStep) => { setManualBack(back); setStep('manual') }
  const currentQuestion = questions[questionIndex]

  if (profileLoading) return <section className="page page--loading-surface" aria-busy="true"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only" role="status">Ładowanie profilu</span></section>

  return <section className="page page--profile-onboarding">
    <PageHeader eyebrow="Profil zawodowy" title={step === 'saved' ? 'Twój zapisany profil' : 'Utwórz profil zawodowy'} intro={step === 'manual' ? 'Uzupełnij profil ręcznie. Wszystkie dane zapiszą się wyłącznie po Twoim kliknięciu.' : mode === 'authenticated' && session ? 'Dodaj CV, a przygotujemy większość profilu do sprawdzenia. Zawsze możesz poprawić wynik przed zapisem.' : 'Dodaj CV, a przygotujemy większość profilu lokalnie w przeglądarce. Zawsze możesz poprawić wynik przed zapisem.'} />
    {notice && <Alert title={notice.title} tone={notice.tone}>{notice.text}</Alert>}
    {step === 'choice' && <Choice onCv={() => setStep('upload')} onManual={() => openManual('choice')} />}
    {step === 'upload' && <UploadStep selectedFile={selectedFile} setSelectedFile={setSelectedFile} message={message} onRead={readPdf} showFallback={showFallback} setShowFallback={setShowFallback} fallbackText={fallbackText} setFallbackText={setFallbackText} onFallback={readFallback} onBack={() => setStep('choice')} onSample={mode === 'demo' ? loadSampleProfile : undefined} usesSemanticMapper={mode === 'authenticated' && Boolean(session)} />}
    {(step === 'reading' || step === 'mapping') && <ReadingStep phase={step} usesSemanticMapper={mode === 'authenticated' && Boolean(session)} />}
    {step === 'recognition' && recognition && <RecognitionStep draft={recognition} onContinue={startQuestions} onOther={() => { if (pendingDraftScope) clearPendingProfileDraft(pendingDraftScope); setRecognition(null); setStep('upload') }} onManual={() => openManual('recognition')} />}
    {step === 'questions' && currentQuestion && <QuestionStep question={currentQuestion} index={questionIndex} total={questions.length} profile={profile} update={update} movePriority={movePriority} onBack={() => questionIndex ? setQuestionIndex((index) => index - 1) : setStep('recognition')} onNext={() => questionIndex === questions.length - 1 ? setStep('review') : setQuestionIndex((index) => index + 1)} />}
    {step === 'review' && <ReviewStep profile={profile} presentation={presentation} onSave={save} onEdit={() => openManual('review')} onBack={() => questions.length ? setStep('questions') : setStep('recognition')} onRestart={restart} />}
    {step === 'manual' && <ManualForm profile={profile} presentation={presentation} updatePresentationName={updatePresentationName} update={update} movePriority={movePriority} errors={errors} onSave={save} onBack={() => setStep(manualBack)} />}
    {step === 'saved' && <SavedStep profile={storedProfile ?? profile} presentation={presentation} onEdit={() => openManual('saved')} onImport={() => navigate('/import')} onRestart={restart} />}
  </section>
}

function Choice({ onCv, onManual }: { onCv: () => void; onManual: () => void }) { return <div className="onboarding-choice"><SectionCard className="choice-card choice-card--recommended"><p className="card-kicker">Polecana ścieżka</p><h2>Dodaj CV</h2><p>Większość profilu przygotujemy na podstawie dokumentu. Potem odpowiesz tylko na kilka brakujących pytań.</p><PrimaryButton onClick={onCv}>Dodaj CV i utwórz profil</PrimaryButton></SectionCard><SectionCard className="choice-card"><p className="card-kicker">Alternatywa</p><h2>Wypełnij profil ręcznie</h2><p>Możesz utworzyć profil bez dodawania CV.</p><SecondaryButton onClick={onManual}>Uzupełnij profil ręcznie</SecondaryButton></SectionCard></div> }

function UploadStep({ selectedFile, setSelectedFile, message, onRead, showFallback, setShowFallback, fallbackText, setFallbackText, onFallback, onBack, onSample, usesSemanticMapper }: { selectedFile: File | null; setSelectedFile: (file: File | null) => void; message: string; onRead: () => void; showFallback: boolean; setShowFallback: (value: boolean) => void; fallbackText: string; setFallbackText: (value: string) => void; onFallback: () => void; onBack: () => void; onSample?: () => void; usesSemanticMapper: boolean }) { return <SectionCard className="onboarding-panel upload-panel"><p className="card-kicker">Krok 1 z 3</p><h2>Dodaj CV</h2><p>{usesSemanticMapper ? 'Tekst z CV odczytamy lokalnie, a następnie jednorazowo przekażemy do zabezpieczonej funkcji analizy. Nie zapisujemy pliku PDF ani pełnego tekstu CV.' : 'CV jest przetwarzane lokalnie w przeglądarce i nie jest wysyłane do zewnętrznej usługi.'}</p><label className={`file-input-label${selectedFile ? ' file-input-label--selected' : ''}`}>{selectedFile ? 'Wybierz inny PDF' : 'Wybierz PDF'}<input type="file" accept="application/pdf,.pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label><p className={`selected-file${selectedFile ? ' selected-file--chosen' : ''}`}>{selectedFile ? <>Wybrany plik: <strong>{selectedFile.name}</strong></> : 'Obsługiwany format: PDF, maks. 5 MB'}</p>{message && <Alert title="Nie udało się odczytać dokumentu" tone="warning">{message}</Alert>}<div className="action-row"><SecondaryButton onClick={onBack}>Wróć</SecondaryButton><PrimaryButton onClick={onRead}>Odczytaj CV</PrimaryButton>{onSample && <SecondaryButton onClick={onSample}>Wgraj przykładowy profil</SecondaryButton>}</div><button type="button" className="text-action" onClick={() => setShowFallback(!showFallback)}>{showFallback ? 'Ukryj wklejanie tekstu' : 'Wklej tekst CV zamiast PDF'}</button>{showFallback && <div className="fallback-panel"><label>Wklej tekst CV<textarea rows={8} value={fallbackText} onChange={(event) => setFallbackText(event.target.value)} placeholder="Tekst pozostaje tylko w pamięci bieżącego widoku." /></label><PrimaryButton onClick={onFallback}>Rozpoznaj informacje z tekstu</PrimaryButton></div>}</SectionCard> }

function ReadingStep({ phase, usesSemanticMapper }: { phase: 'reading' | 'mapping'; usesSemanticMapper: boolean }) { const activeIndex = phase === 'mapping' ? 2 : 0; return <SectionCard className="onboarding-panel reading-panel" aria-busy="true"><p className="card-kicker">Odczytywanie CV</p><h2>Przygotowujemy profil do sprawdzenia</h2><ol className="process-steps">{processSteps.map((item, index) => <li className={index < activeIndex ? 'is-complete' : index === activeIndex ? 'is-active' : 'is-pending'} key={item}>{item}</li>)}</ol><p className="sr-only" role="status">{processSteps[activeIndex]}</p><p className="quiet-note">{usesSemanticMapper ? 'Plik PDF pozostaje w przeglądarce. Do zabezpieczonej analizy przekazujemy jednorazowo wyłącznie odczytany tekst.' : 'Dokument pozostaje w przeglądarce.'}</p></SectionCard> }

function RecognitionStep({ draft, onContinue, onOther, onManual }: { draft: UserProfileDraft; onContinue: () => void; onOther: () => void; onManual: () => void }) {
  const rows: Array<[string, string | string[], ProfileFieldConfidence]> = [['Kierunek zawodowy', draft.values.primaryRole, draft.confidence.primaryRole], ['Podsumowanie doświadczenia', draft.values.experienceSummary, draft.confidence.experienceSummary], ['Najważniejsze umiejętności', draft.values.skills, draft.confidence.skills], ['Role alternatywne', draft.values.alternativeRoles, draft.confidence.alternativeRoles]]
  const intelligence = profileIntelligenceFromLegacy(draft.values)
  const facts = intelligence.candidateFacts
  const factRows: Array<[string, string]> = ([
    ['Łączne doświadczenie', facts.totalExperienceYears === null ? '' : `${facts.totalExperienceYears} lat`],
    ['Projekty', (facts.projects ?? []).map((item) => `${item.name} — ${item.role}; ${item.stack.join(', ')}`).join(' | ')],
    ['Obszary doświadczenia', facts.experienceAreas.map((item) => item.area).join(', ')],
    ['Odpowiedzialności', facts.responsibilities.map((item) => item.capability).join(', ')],
    ['Domeny', facts.domains.map((item) => item.name).join(', ')],
    ['Osiągnięcia', facts.achievements.map((item) => item.capability).join(', ')],
    ['Języki', facts.languages.map((item) => item.level ? `${item.name} (${item.level})` : item.name).join(', ')],
    ['Edukacja', facts.education.map((item) => item.issuer ? `${item.name} — ${item.issuer}` : item.name).join(', ')],
    ['Certyfikaty', facts.certifications.map((item) => item.issuer ? `${item.name} — ${item.issuer}` : item.name).join(', ')],
  ] as Array<[string, string]>).filter(([, value]) => Boolean(value))
  const preferenceRows: Array<[string, string]> = ([['Lokalizacje wskazane w CV', draft.values.acceptedLocations.join(', ')], ['Tryby pracy wskazane w CV', draft.values.acceptedWorkModes.join(', ')], ['Formy współpracy wskazane w CV', draft.values.acceptedContractTypes.join(', ')]] as Array<[string, string]>)
    .filter(([, value]) => Boolean(value))
  return <SectionCard className="onboarding-panel"><p className="card-kicker">Krok 2 z 3</p><h2>Sprawdź, co rozpoznaliśmy z CV</h2><div className="recognition-list">{rows.map(([label, value, confidence]) => <div key={label}><div><strong>{label}</strong><span className={`recognition-status recognition-status--${confidenceLabel(confidence).replaceAll(' ', '-').toLocaleLowerCase()}`}>{confidenceLabel(confidence)}</span></div><p>{Array.isArray(value) ? value.length ? value.join(', ') : 'Brak danych' : value || 'Brak danych'}</p></div>)}</div>{factRows.length > 0 && <details className="profile-intelligence-details" open><summary>Rozpoznane fakty zawodowe z CV</summary><dl className="profile-review-list">{factRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}{preferenceRows.length > 0 && <details className="profile-intelligence-details"><summary>Informacje o dostępności wskazane w CV</summary><p className="field-hint">Potwierdź je później jako swoje aktualne preferencje.</p><dl className="profile-review-list">{preferenceRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}<p className="field-hint">Must-have, blacklista, twarde ograniczenia i priorytety pozostają puste — uzupełnisz je ręcznie, jeśli są dla Ciebie ważne.</p><div className="action-row"><PrimaryButton onClick={onContinue}>Dalej: uzupełnij informacje</PrimaryButton><SecondaryButton onClick={onOther}>Wybierz inne CV</SecondaryButton><SecondaryButton onClick={onManual}>Utwórz profil ręcznie</SecondaryButton></div></SectionCard>
}

function QuestionStep({ question, index, total, profile, update, movePriority, onBack, onNext }: { question: ProfileQuestion; index: number; total: number; profile: UserProfile; update: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void; movePriority: (index: number, direction: -1 | 1) => void; onBack: () => void; onNext: () => void }) { return <SectionCard className="onboarding-panel question-panel"><p className="card-kicker">Pytanie {index + 1} z {total}</p><div className="question-progress"><span style={{ width: `${((index + 1) / total) * 100}%` }} /></div><h2>{question.title}</h2><p>{question.description}</p>{question.id === 'role' && <div className="field-grid"><label>Rola główna<input value={profile.primaryRole} onChange={(event) => update('primaryRole', event.target.value)} /></label><TagInput label="Role alternatywne" values={profile.alternativeRoles} onChange={(values) => update('alternativeRoles', values)} /></div>}{question.id === 'workModes' && <ChoiceChecks values={profile.acceptedWorkModes} labels={[['remote', 'Zdalnie'], ['hybrid', 'Hybrydowo'], ['onsite', 'Stacjonarnie']]} onChange={(values) => update('acceptedWorkModes', values)} />}{question.id === 'contracts' && <ChoiceChecks values={profile.acceptedContractTypes} labels={[['employment', 'Umowa o pracę'], ['b2b', 'B2B'], ['freelance', 'Freelance'], ['mandate', 'Umowa zlecenie']]} onChange={(values) => update('acceptedContractTypes', values)} />}{question.id === 'locations' && <TagInput label="Preferowane lokalizacje" hint="Zatwierdź Enterem, przecinkiem, średnikiem lub po opuszczeniu pola." values={profile.acceptedLocations} onChange={(values) => update('acceptedLocations', values)} placeholder="np. Nowy Sącz" />}{question.id === 'criteria' && <div className="field-grid"><label>Must-have<textarea rows={4} value={profile.additionalMustHave} onChange={(event) => update('additionalMustHave', event.target.value)} /></label><label>Warunki, których nie akceptujesz<textarea rows={4} value={profile.additionalBlacklist} onChange={(event) => update('additionalBlacklist', event.target.value)} /></label></div>}{question.id === 'priorities' && <PriorityList priorities={profile.priorities} move={movePriority} />}<div className="action-row action-row--spaced"><SecondaryButton onClick={onBack}>Wstecz</SecondaryButton><PrimaryButton onClick={onNext}>{question.optional ? 'Pomiń lub dalej' : index === total - 1 ? 'Zobacz gotowy profil' : 'Dalej'}</PrimaryButton></div></SectionCard> }

function ChoiceChecks<T extends WorkMode | ContractType>({ values, labels, onChange }: { values: T[]; labels: readonly (readonly [T, string])[]; onChange: (values: T[]) => void }) { return <div className="choice-checks">{labels.map(([value, label]) => <label className="checkbox-label" key={value}><input type="checkbox" checked={values.includes(value)} onChange={(event) => onChange(toggle(values, value, event.target.checked))} />{label}</label>)}</div> }
function PriorityList({ priorities, move }: { priorities: ProfilePriority[]; move: (index: number, direction: -1 | 1) => void }) { return <ol className="priority-list">{priorities.map((item, index) => <li key={item}><span>{index + 1}. {priorityLabels[item]}</span><span><button type="button" onClick={() => move(index, -1)} disabled={!index}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === priorities.length - 1}>↓</button></span></li>)}</ol> }

function ReviewStep({ profile, presentation, onSave, onEdit, onBack, onRestart }: { profile: UserProfile; presentation: ProfilePresentationMetadata; onSave: () => void; onEdit: () => void; onBack: () => void; onRestart: () => void }) { return <SectionCard className="onboarding-panel review-panel"><p className="card-kicker">Gotowy profil</p><h2>{presentation.fullName || 'Twój profil jest gotowy'}</h2><ProfileSummary profile={profile} /><ProfileIntelligenceDetails profile={profile} /><div className="action-row"><PrimaryButton onClick={onSave}>Zapisz profil</PrimaryButton><SecondaryButton onClick={onEdit}>Edytuj szczegóły</SecondaryButton><SecondaryButton onClick={onBack}>Wróć do pytań</SecondaryButton><button className="text-action" type="button" onClick={onRestart}>Zacznij od nowa</button></div></SectionCard> }

function SavedStep({ profile, presentation, onEdit, onImport, onRestart }: { profile: UserProfile; presentation: ProfilePresentationMetadata; onEdit: () => void; onImport: () => void; onRestart: () => void }) { return <SectionCard className="onboarding-panel review-panel"><p className="card-kicker">Profil zapisany</p><h2>{presentation.fullName || 'Twój profil jest gotowy'}</h2><ProfileSummary profile={profile} /><ProfileIntelligenceDetails profile={profile} /><div className="action-row"><PrimaryButton onClick={onImport}>Przejdź do importu ofert</PrimaryButton><SecondaryButton onClick={onEdit}>Edytuj szczegóły</SecondaryButton><button className="text-action" type="button" onClick={onRestart}>Utwórz nowy profil</button></div></SectionCard> }

function ProfileSummary({ profile }: { profile: UserProfile }) { const rows: Array<[string, string]> = [['Rola główna', profile.primaryRole], ['Role alternatywne', profile.alternativeRoles.join(', ')], ['Podsumowanie doświadczenia', profile.experienceSummary], ['Umiejętności', profile.skills.join(', ')], ['Preferowane lokalizacje', profile.acceptedLocations.join(', ')], ['Tryby pracy', profile.acceptedWorkModes.join(', ')], ['Formy zatrudnienia', profile.acceptedContractTypes.join(', ')], ['Must-have', profile.additionalMustHave], ['Blacklista', profile.additionalBlacklist], ['Priorytety', profile.priorities.map((item) => priorityLabels[item]).join(' → ')]]; return <dl className="profile-review-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Brak danych'}</dd></div>)}</dl> }
function ProfileIntelligenceDetails({ profile }: { profile: UserProfile }) { const facts = profile.intelligence?.candidateFacts; if (!facts) return null; const rows: Array<[string, string]> = [['Projekty', (facts.projects ?? []).map((item) => `${item.name} — ${item.role}; ${item.stack.join(', ')}; ${item.result || 'rezultat nieopisany'}`).join(' | ')], ['Doświadczenie', facts.experienceAreas.map((item) => item.area).join(', ')], ['Kompetencje i odpowiedzialności', facts.responsibilities.map((item) => item.capability).join(', ')], ['Domeny', facts.domains.map((item) => item.name).join(', ')], ['Osiągnięcia', facts.achievements.map((item) => item.capability).join(', ')], ['Języki', facts.languages.map((item) => item.level ? `${item.name} (${item.level})` : item.name).join(', ')], ['Edukacja', facts.education.map((item) => item.name).join(', ')], ['Certyfikaty', facts.certifications.map((item) => item.name).join(', ')]]; return <details className="profile-intelligence-details"><summary>Rozwiń szczegóły doświadczenia i kompetencji</summary>{facts.experienceEntries.length > 0 && <div className="form-stack"><strong>Historia zawodowa</strong>{facts.experienceEntries.map((entry, index) => <p key={`${entry.role}-${index}`}><strong>{entry.role}</strong>{entry.company ? ` · ${entry.company}` : ''}{entry.startDate || entry.endDate || entry.duration ? ` · ${[entry.startDate, entry.endDate].filter(Boolean).join(' – ') || entry.duration}` : ''}</p>)}</div>}<dl className="profile-review-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Brak danych'}</dd></div>)}</dl></details> }

function ManualForm({ profile, presentation, updatePresentationName, update, movePriority, errors, onSave, onBack }: { profile: UserProfile; presentation: ProfilePresentationMetadata; updatePresentationName: (fullName: string) => void; update: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void; movePriority: (index: number, direction: -1 | 1) => void; errors: Record<string, string>; onSave: () => void; onBack: () => void }) { const fieldError = (key: string) => errors[key] && <span className="field-error">{errors[key]}</span>; const workModes = [['remote', 'Zdalnie'], ['hybrid', 'Hybrydowo'], ['onsite', 'Stacjonarnie']] as const; const contracts = [['employment', 'Umowa o pracę'], ['b2b', 'B2B'], ['freelance', 'Freelance'], ['mandate', 'Umowa zlecenie']] as const; return <form className="form-stack manual-profile-form" onSubmit={(event) => { event.preventDefault(); onSave() }}><SectionCard title="Kierunek zawodowy"><div className="field-grid"><label>Imię i nazwisko<input value={presentation.fullName ?? ''} onChange={(event) => updatePresentationName(event.target.value)} /></label><label>Rola główna<input value={profile.primaryRole} onChange={(event) => update('primaryRole', event.target.value)} />{fieldError('primaryRole')}</label><TagInput label="Role alternatywne" values={profile.alternativeRoles} onChange={(values) => update('alternativeRoles', values)} /></div></SectionCard><SectionCard title="Doświadczenie"><label>Podsumowanie doświadczenia<textarea rows={5} value={profile.experienceSummary} onChange={(event) => update('experienceSummary', event.target.value)} />{fieldError('experienceSummary')}</label></SectionCard><SectionCard title="Umiejętności"><TagInput label="Umiejętności" values={profile.skills} onChange={(values) => update('skills', values)} />{fieldError('skills')}</SectionCard><StructuredFactsEditor profile={profile} update={update} /><SectionCard title="Preferencje"><TagInput label="Preferowane lokalizacje" hint="Domyślnie są miękką preferencją; możesz jawnie ustawić ograniczenie jako twarde niżej." values={profile.acceptedLocations} onChange={(values) => update('acceptedLocations', values)} placeholder="np. Zielona Góra" />{fieldError('acceptedLocations')}<label>Minimum wynagrodzenia<input type="number" min="0" value={profile.minimumSalary ?? ''} onChange={(event) => update('minimumSalary', event.target.value ? Number(event.target.value) : null)} /></label><fieldset><legend>Akceptowane tryby pracy</legend><ChoiceChecks values={profile.acceptedWorkModes} labels={workModes} onChange={(values) => update('acceptedWorkModes', values)} /></fieldset><fieldset><legend>Akceptowane formy zatrudnienia</legend><ChoiceChecks values={profile.acceptedContractTypes} labels={contracts} onChange={(values) => update('acceptedContractTypes', values)} /></fieldset><HardPreferenceControls profile={profile} update={update} /><label className="checkbox-label"><input type="checkbox" checked={profile.studentStatusAvailable} onChange={(event) => update('studentStatusAvailable', event.target.checked)} />Mogę korzystać ze statusu studenta</label></SectionCard><SectionCard title="Kryteria"><label className="checkbox-label"><input type="checkbox" checked={profile.requiresStudentStatus} onChange={(event) => update('requiresStudentStatus', event.target.checked)} />Wymagany status studenta</label><div className="field-grid"><label>Must-have<textarea rows={3} value={profile.additionalMustHave} onChange={(event) => update('additionalMustHave', event.target.value)} /></label><label>Blacklista<textarea rows={3} value={profile.additionalBlacklist} onChange={(event) => update('additionalBlacklist', event.target.value)} /></label></div></SectionCard><SectionCard title="Priorytety"><PriorityList priorities={profile.priorities} move={movePriority} /></SectionCard><div className="action-row"><SecondaryButton type="button" onClick={onBack}>Wróć do prostego podsumowania</SecondaryButton><PrimaryButton type="submit">Zapisz profil</PrimaryButton></div></form> }

function HardPreferenceControls({ profile, update }: { profile: UserProfile; update: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void }) {
  const intelligence = profileIntelligenceFromLegacy(profile)
  const toggleHard = <T extends string>(kind: 'locations' | 'workModes' | 'employmentTypes', value: T, isHard: boolean) => { const next = structuredClone(intelligence); const item = next.workPreferences[kind].find((entry) => entry.value === value); if (item) item.isHard = isHard; update('intelligence', next) }
  const row = <T extends string>(label: string, kind: 'locations' | 'workModes' | 'employmentTypes', values: T[]) => values.length ? <fieldset><legend>{label}</legend>{values.map((value) => <label className="checkbox-label" key={value}><input type="checkbox" checked={Boolean(intelligence.workPreferences[kind].find((item) => item.value === value)?.isHard)} onChange={(event) => toggleHard(kind, value, event.target.checked)} />Traktuj „{value}” jako twarde ograniczenie</label>)}</fieldset> : null
  return <div className="form-stack"><p className="field-hint">Preferencje są miękkie, dopóki jawnie nie oznaczysz ich jako twardego ograniczenia.</p>{row('Lokalizacja', 'locations', profile.acceptedLocations)}{row('Tryb pracy', 'workModes', profile.acceptedWorkModes)}{row('Forma zatrudnienia', 'employmentTypes', profile.acceptedContractTypes)}</div>
}

function StructuredFactsEditor({ profile, update }: { profile: UserProfile; update: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void }) {
  const intelligence = profileIntelligenceFromLegacy(profile)
  const manualEvidence = (text: string) => [{ source: 'user' as const, text: `Potwierdzone ręcznie: ${text}`.slice(0, 180), section: null, userConfirmed: true }]
  const set = (key: 'experienceAreas' | 'responsibilities' | 'domains' | 'achievements' | 'languages' | 'education' | 'certifications', values: string[]) => {
    const next = structuredClone(intelligence)
    if (key === 'experienceAreas') next.candidateFacts[key] = values.map((area) => ({ area, yearsApprox: null, recency: 'unknown', evidence: manualEvidence(area) }))
    else if (key === 'responsibilities' || key === 'achievements') next.candidateFacts[key] = values.map((capability) => ({ capability, evidence: manualEvidence(capability) }))
    else if (key === 'domains') next.candidateFacts[key] = values.map((name) => ({ name, yearsApprox: null, evidence: manualEvidence(name) }))
    else if (key === 'languages') next.candidateFacts[key] = values.map((name) => ({ name, level: null, evidence: manualEvidence(name) }))
    else next.candidateFacts[key] = values.map((name) => ({ name, issuer: null, evidence: manualEvidence(name) }))
    update('intelligence', next)
  }
  const updateEntry = (index: number, field: 'role' | 'company' | 'startDate' | 'endDate' | 'duration', value: string) => { const next = structuredClone(intelligence); const entry = next.candidateFacts.experienceEntries[index]; if (!entry) return; if (field === 'role') entry.role = value.trim() || 'Nowa rola'; else entry[field] = value.trim() || null; delete entry.status; entry.confidence = null; entry.evidence = manualEvidence(entry.role || value); update('intelligence', next) }
  const addEntry = () => { const next = structuredClone(intelligence); next.candidateFacts.experienceEntries.push({ role: 'Nowa rola', company: null, startDate: null, endDate: null, duration: null, responsibilities: [], achievements: [], domains: [], evidence: manualEvidence('Nowa rola'), confidence: null }); update('intelligence', next) }
  return <details className="profile-intelligence-details" open><summary>Fakty zawodowe z CV — rozwiń i popraw ręcznie</summary><p className="field-hint">Pola rozpoznane z CV są propozycją. Ręczna edycja ma pierwszeństwo; zapisujemy tylko krótkie dowody.</p><div className="form-stack"><fieldset><legend>Historia zawodowa</legend>{intelligence.candidateFacts.experienceEntries.map((entry, index) => <div className="field-grid" key={`${entry.role}-${index}`}><label>Rola<input value={entry.role} onChange={(event) => updateEntry(index, 'role', event.target.value)} /></label><label>Firma (opcjonalnie)<input value={entry.company ?? ''} onChange={(event) => updateEntry(index, 'company', event.target.value)} /></label><label>Od<input value={entry.startDate ?? ''} onChange={(event) => updateEntry(index, 'startDate', event.target.value)} /></label><label>Do / obecnie<input value={entry.endDate ?? ''} onChange={(event) => updateEntry(index, 'endDate', event.target.value)} /></label><TagInput label="Odpowiedzialności" values={entry.responsibilities.map((item) => item.capability)} onChange={(values) => { const next = structuredClone(intelligence); next.candidateFacts.experienceEntries[index]!.responsibilities = values.map((capability) => ({ capability, evidence: manualEvidence(capability), confidence: null })); update('intelligence', next) }} /></div>)}<SecondaryButton type="button" onClick={addEntry}>Dodaj doświadczenie</SecondaryButton></fieldset><label>Łączne lata doświadczenia<input type="number" min="0" max="60" value={intelligence.candidateFacts.totalExperienceYears ?? ''} onChange={(event) => { const next = structuredClone(intelligence); next.candidateFacts.totalExperienceYears = event.target.value ? Number(event.target.value) : null; update('intelligence', next) }} /></label><fieldset><legend>Poziom użycia umiejętności</legend>{intelligence.candidateFacts.skills.map((skill) => <label key={skill.name}>{skill.name}<select value={skill.evidenceLevel} onChange={(event) => { const next = structuredClone(intelligence); const target = next.candidateFacts.skills.find((item) => item.name === skill.name); if (target) { target.evidenceLevel = event.target.value as typeof target.evidenceLevel; target.evidence = manualEvidence(target.name); delete target.status; target.confidence = null }; update('intelligence', next) }}><option value="professional">zawodowo</option><option value="project">w projekcie</option><option value="learning">w nauce</option><option value="mentioned">tylko wymieniona</option></select></label>)}</fieldset><fieldset><legend>Docelowy poziom stanowiska</legend><select value={intelligence.careerTargets.targetSeniority[0] ?? 'unknown'} onChange={(event) => { const next = structuredClone(intelligence); next.careerTargets.targetSeniority = [event.target.value as typeof next.careerTargets.targetSeniority[number]]; update('intelligence', next) }}><option value="unknown">brak danych</option><option value="junior">junior</option><option value="mid">mid</option><option value="senior">senior</option><option value="lead">lead</option><option value="manager">manager</option></select></fieldset><TagInput label="Kierunki rozwoju" values={intelligence.careerTargets.careerDirections} onChange={(values) => { const next = structuredClone(intelligence); next.careerTargets.careerDirections = values; update('intelligence', next) }} /><label>Kontekst zmiany kierunku<textarea rows={2} value={intelligence.careerTargets.transitionContext ?? ''} onChange={(event) => { const next = structuredClone(intelligence); next.careerTargets.transitionContext = event.target.value.trim() || null; update('intelligence', next) }} /></label><TagInput label="Obszary doświadczenia" values={intelligence.candidateFacts.experienceAreas.map((item) => item.area)} onChange={(values) => set('experienceAreas', values)} /><TagInput label="Odpowiedzialności / możliwości" values={intelligence.candidateFacts.responsibilities.map((item) => item.capability)} onChange={(values) => set('responsibilities', values)} /><TagInput label="Domeny" values={intelligence.candidateFacts.domains.map((item) => item.name)} onChange={(values) => set('domains', values)} /><TagInput label="Osiągnięcia" values={intelligence.candidateFacts.achievements.map((item) => item.capability)} onChange={(values) => set('achievements', values)} /><TagInput label="Języki" values={intelligence.candidateFacts.languages.map((item) => item.name)} onChange={(values) => set('languages', values)} /><TagInput label="Edukacja" values={intelligence.candidateFacts.education.map((item) => item.name)} onChange={(values) => set('education', values)} /><TagInput label="Certyfikaty" values={intelligence.candidateFacts.certifications.map((item) => item.name)} onChange={(values) => set('certifications', values)} /></div></details>
}
