import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ContractType, ProfileFieldConfidence, ProfilePriority, UserProfile, UserProfileDraft, WorkMode } from '../contracts/profile'
import { TagInput } from '../components/TagInput'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { defaultProfile } from '../features/profile/profileDefaults'
import { extractTextFromPdf } from '../features/profile/pdfTextExtractor'
import { extractProfileDraft } from '../features/profile/profileExtractor'
import { getProfileQuestions, type ProfileQuestion } from '../features/profile/profileQuestions'
import { loadUserProfile, saveUserProfile } from '../features/profile/profileStorage'
import { validateUserProfile } from '../schemas/profileSchemas'

type OnboardingStep = 'choice' | 'upload' | 'reading' | 'recognition' | 'questions' | 'review' | 'manual' | 'saved'
const priorityLabels: Record<ProfilePriority, string> = { experience: 'Doświadczenie', skills: 'Umiejętności', preferences: 'Preferencje', growth: 'Rozwój' }
const processSteps = ['Sprawdzamy dokument', 'Odczytujemy tekst', 'Rozpoznajemy doświadczenie i umiejętności', 'Przygotowujemy profil do sprawdzenia']
const confidenceLabel = (value: ProfileFieldConfidence) => value === 'missing' ? 'Brak danych' : value === 'high' || value === 'manual' ? 'Rozpoznano' : 'Do sprawdzenia'

function toggle<T extends string>(values: T[], value: T, checked: boolean) { return checked ? [...values, value] : values.filter((item) => item !== value) }

export function ProfilePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<OnboardingStep>('choice')
  const [profile, setProfile] = useState<UserProfile>(defaultProfile)
  const [storedProfile, setStoredProfile] = useState<UserProfile | null>(null)
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

  useEffect(() => {
    const loaded = loadUserProfile()
    if (loaded.profile) { setProfile(loaded.profile); setStoredProfile(loaded.profile) }
    if (params.get('mode') === 'manual') setStep('manual')
    else if (params.get('mode') === 'cv') setStep('upload')
    else if (loaded.profile) setStep('saved')
    if (loaded.warning) setNotice({ tone: 'warning', title: 'Zapis profilu pominięty', text: loaded.warning })
  }, [params])

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
  const acceptRecognition = (draft: UserProfileDraft) => { setRecognition(draft); setProfile(draft.values); setMessage('Rozpoznaliśmy dane z CV. Sprawdź je, a następnie uzupełnij kilka informacji.'); setStep('recognition') }
  const readPdf = async () => {
    if (!selectedFile) { setMessage('Wybierz plik PDF przed rozpoczęciem odczytu.'); return }
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf || selectedFile.size > 5 * 1024 * 1024) { setMessage(!isPdf ? 'Obsługiwane są wyłącznie pliki PDF.' : 'Plik przekracza limit 5 MB.'); return }
    setStep('reading'); setMessage('')
    const result = await extractTextFromPdf(selectedFile)
    if (!result.success) { setStep('upload'); setShowFallback(true); setMessage(result.warnings[0] ?? 'Nie udało się odczytać PDF.'); return }
    try { acceptRecognition(extractProfileDraft(result.text, 'pdf')) } catch (error) { setStep('upload'); setShowFallback(true); setMessage(error instanceof Error ? error.message : 'Nie udało się przygotować profilu.') }
  }
  const readFallback = () => {
    try { acceptRecognition(extractProfileDraft(fallbackText, 'pasted-text')) } catch (error) { setMessage(error instanceof Error ? error.message : 'Wklej więcej tekstu CV.') }
  }
  const save = () => {
    const validation = validateUserProfile(profile)
    if (!validation.success) {
      const nextErrors: Record<string, string> = {}; validation.error.issues.forEach((issue) => { nextErrors[String(issue.path[0] ?? 'form')] = issue.message })
      setErrors(nextErrors); setNotice({ tone: 'warning', title: 'Profil wymaga uzupełnienia', text: 'Popraw oznaczone pola przed zapisem.' }); setManualBack('review'); setStep('manual'); return
    }
    const saved = saveUserProfile(validation.data)
    if (!saved.success) { setNotice({ tone: 'warning', title: 'Nie udało się zapisać profilu', text: 'Sprawdź ustawienia pamięci lokalnej przeglądarki.' }); return }
    setProfile(saved.data); setStoredProfile(saved.data); setRecognition(null); setNotice({ tone: 'success', title: 'Profil zapisany lokalnie', text: 'Możesz teraz przejść do importu ofert.' }); setStep('saved')
  }
  const restart = () => { setProfile(defaultProfile); setRecognition(null); setQuestions([]); setQuestionIndex(0); setMessage(''); setFallbackText(''); setSelectedFile(null); setStep('choice') }
  const openManual = (back: OnboardingStep) => { setManualBack(back); setStep('manual') }
  const currentQuestion = questions[questionIndex]

  return <section className="page page--profile-onboarding">
    <PageHeader eyebrow="Profil zawodowy" title={step === 'saved' ? 'Twój zapisany profil' : 'Utwórz profil zawodowy'} intro={step === 'manual' ? 'Uzupełnij profil ręcznie. Wszystkie dane zapiszą się wyłącznie po Twoim kliknięciu.' : 'Dodaj CV, a przygotujemy większość profilu lokalnie w przeglądarce. Zawsze możesz poprawić wynik przed zapisem.'} />
    {notice && <Alert title={notice.title} tone={notice.tone}>{notice.text}</Alert>}
    {step === 'choice' && <Choice onCv={() => setStep('upload')} onManual={() => openManual('choice')} />}
    {step === 'upload' && <UploadStep selectedFile={selectedFile} setSelectedFile={setSelectedFile} message={message} onRead={readPdf} showFallback={showFallback} setShowFallback={setShowFallback} fallbackText={fallbackText} setFallbackText={setFallbackText} onFallback={readFallback} onBack={() => setStep('choice')} />}
    {step === 'reading' && <ReadingStep />}
    {step === 'recognition' && recognition && <RecognitionStep draft={recognition} onContinue={startQuestions} onOther={() => setStep('upload')} onManual={() => openManual('recognition')} />}
    {step === 'questions' && currentQuestion && <QuestionStep question={currentQuestion} index={questionIndex} total={questions.length} profile={profile} update={update} movePriority={movePriority} onBack={() => questionIndex ? setQuestionIndex((index) => index - 1) : setStep('recognition')} onNext={() => questionIndex === questions.length - 1 ? setStep('review') : setQuestionIndex((index) => index + 1)} />}
    {step === 'review' && <ReviewStep profile={profile} onSave={save} onEdit={() => openManual('review')} onBack={() => questions.length ? setStep('questions') : setStep('recognition')} onRestart={restart} />}
    {step === 'manual' && <ManualForm profile={profile} update={update} movePriority={movePriority} errors={errors} onSave={save} onBack={() => setStep(manualBack)} />}
    {step === 'saved' && <SavedStep profile={storedProfile ?? profile} onEdit={() => openManual('saved')} onImport={() => navigate('/import')} onRestart={restart} />}
  </section>
}

function Choice({ onCv, onManual }: { onCv: () => void; onManual: () => void }) { return <div className="onboarding-choice"><SectionCard className="choice-card choice-card--recommended"><p className="card-kicker">Polecana ścieżka</p><h2>Dodaj CV</h2><p>Większość profilu przygotujemy na podstawie dokumentu. Potem odpowiesz tylko na kilka brakujących pytań.</p><PrimaryButton onClick={onCv}>Dodaj CV i utwórz profil</PrimaryButton></SectionCard><SectionCard className="choice-card"><p className="card-kicker">Alternatywa</p><h2>Wypełnij profil ręcznie</h2><p>Możesz utworzyć profil bez dodawania CV.</p><SecondaryButton onClick={onManual}>Uzupełnij profil ręcznie</SecondaryButton></SectionCard></div> }

function UploadStep({ selectedFile, setSelectedFile, message, onRead, showFallback, setShowFallback, fallbackText, setFallbackText, onFallback, onBack }: { selectedFile: File | null; setSelectedFile: (file: File | null) => void; message: string; onRead: () => void; showFallback: boolean; setShowFallback: (value: boolean) => void; fallbackText: string; setFallbackText: (value: string) => void; onFallback: () => void; onBack: () => void }) { return <SectionCard className="onboarding-panel upload-panel"><p className="card-kicker">Krok 1 z 3</p><h2>Dodaj CV</h2><p>CV jest przetwarzane lokalnie w przeglądarce i nie jest wysyłane do zewnętrznej usługi.</p><label className="file-input-label">Wybierz PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label><p className="selected-file">{selectedFile ? selectedFile.name : 'Obsługiwany format: PDF, maks. 5 MB'}</p>{message && <Alert title="Nie udało się odczytać dokumentu" tone="warning">{message}</Alert>}<div className="action-row"><SecondaryButton onClick={onBack}>Wróć</SecondaryButton><PrimaryButton onClick={onRead}>Odczytaj CV</PrimaryButton></div><button type="button" className="text-action" onClick={() => setShowFallback(!showFallback)}>{showFallback ? 'Ukryj wklejanie tekstu' : 'Wklej tekst CV zamiast PDF'}</button>{showFallback && <div className="fallback-panel"><label>Wklej tekst CV<textarea rows={8} value={fallbackText} onChange={(event) => setFallbackText(event.target.value)} placeholder="Tekst pozostaje tylko w pamięci bieżącego widoku." /></label><PrimaryButton onClick={onFallback}>Rozpoznaj informacje z tekstu</PrimaryButton></div>}</SectionCard> }

function ReadingStep() { return <SectionCard className="onboarding-panel reading-panel"><p className="card-kicker">Odczytywanie CV</p><h2>Przygotowujemy profil do sprawdzenia</h2><ol className="process-steps">{processSteps.map((item, index) => <li className={index < 2 ? 'is-complete' : 'is-active'} key={item}>{item}</li>)}</ol><p className="quiet-note">Może to potrwać chwilę — dokument pozostaje w przeglądarce.</p></SectionCard> }

function RecognitionStep({ draft, onContinue, onOther, onManual }: { draft: UserProfileDraft; onContinue: () => void; onOther: () => void; onManual: () => void }) { const rows: Array<[string, string | string[], ProfileFieldConfidence]> = [['Kierunek zawodowy', draft.values.primaryRole, draft.confidence.primaryRole], ['Podsumowanie doświadczenia', draft.values.experienceSummary, draft.confidence.experienceSummary], ['Najważniejsze umiejętności', draft.values.skills, draft.confidence.skills], ['Role alternatywne', draft.values.alternativeRoles, draft.confidence.alternativeRoles]]; return <SectionCard className="onboarding-panel"><p className="card-kicker">Krok 2 z 3</p><h2>Sprawdź, co rozpoznaliśmy z CV</h2><div className="recognition-list">{rows.map(([label, value, confidence]) => <div key={label}><div><strong>{label}</strong><span className={`recognition-status recognition-status--${confidenceLabel(confidence).replaceAll(' ', '-').toLocaleLowerCase()}`}>{confidenceLabel(confidence)}</span></div><p>{Array.isArray(value) ? value.length ? value.join(', ') : 'Brak danych' : value || 'Brak danych'}</p></div>)}</div><div className="action-row"><PrimaryButton onClick={onContinue}>Dalej: uzupełnij informacje</PrimaryButton><SecondaryButton onClick={onOther}>Wybierz inne CV</SecondaryButton><SecondaryButton onClick={onManual}>Utwórz profil ręcznie</SecondaryButton></div></SectionCard> }

function QuestionStep({ question, index, total, profile, update, movePriority, onBack, onNext }: { question: ProfileQuestion; index: number; total: number; profile: UserProfile; update: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void; movePriority: (index: number, direction: -1 | 1) => void; onBack: () => void; onNext: () => void }) { return <SectionCard className="onboarding-panel question-panel"><p className="card-kicker">Pytanie {index + 1} z {total}</p><div className="question-progress"><span style={{ width: `${((index + 1) / total) * 100}%` }} /></div><h2>{question.title}</h2><p>{question.description}</p>{question.id === 'role' && <div className="field-grid"><label>Rola główna<input value={profile.primaryRole} onChange={(event) => update('primaryRole', event.target.value)} /></label><TagInput label="Role alternatywne" values={profile.alternativeRoles} onChange={(values) => update('alternativeRoles', values)} /></div>}{question.id === 'workModes' && <ChoiceChecks values={profile.acceptedWorkModes} labels={[['remote', 'Zdalnie'], ['hybrid', 'Hybrydowo'], ['onsite', 'Stacjonarnie']]} onChange={(values) => update('acceptedWorkModes', values)} />}{question.id === 'contracts' && <ChoiceChecks values={profile.acceptedContractTypes} labels={[['employment', 'Umowa o pracę'], ['b2b', 'B2B'], ['freelance', 'Freelance'], ['mandate', 'Umowa zlecenie']]} onChange={(values) => update('acceptedContractTypes', values)} />}{question.id === 'locations' && <TagInput label="Preferowane lokalizacje" hint="Zatwierdź Enterem, przecinkiem, średnikiem lub po opuszczeniu pola." values={profile.acceptedLocations} onChange={(values) => update('acceptedLocations', values)} placeholder="np. Nowy Sącz" />}{question.id === 'criteria' && <div className="field-grid"><label>Must-have<textarea rows={4} value={profile.additionalMustHave} onChange={(event) => update('additionalMustHave', event.target.value)} /></label><label>Warunki, których nie akceptujesz<textarea rows={4} value={profile.additionalBlacklist} onChange={(event) => update('additionalBlacklist', event.target.value)} /></label></div>}{question.id === 'priorities' && <PriorityList priorities={profile.priorities} move={movePriority} />}<div className="action-row action-row--spaced"><SecondaryButton onClick={onBack}>Wstecz</SecondaryButton><PrimaryButton onClick={onNext}>{question.optional ? 'Pomiń lub dalej' : index === total - 1 ? 'Zobacz gotowy profil' : 'Dalej'}</PrimaryButton></div></SectionCard> }

function ChoiceChecks<T extends WorkMode | ContractType>({ values, labels, onChange }: { values: T[]; labels: readonly (readonly [T, string])[]; onChange: (values: T[]) => void }) { return <div className="choice-checks">{labels.map(([value, label]) => <label className="checkbox-label" key={value}><input type="checkbox" checked={values.includes(value)} onChange={(event) => onChange(toggle(values, value, event.target.checked))} />{label}</label>)}</div> }
function PriorityList({ priorities, move }: { priorities: ProfilePriority[]; move: (index: number, direction: -1 | 1) => void }) { return <ol className="priority-list">{priorities.map((item, index) => <li key={item}><span>{index + 1}. {priorityLabels[item]}</span><span><button type="button" onClick={() => move(index, -1)} disabled={!index}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === priorities.length - 1}>↓</button></span></li>)}</ol> }

function ReviewStep({ profile, onSave, onEdit, onBack, onRestart }: { profile: UserProfile; onSave: () => void; onEdit: () => void; onBack: () => void; onRestart: () => void }) { return <SectionCard className="onboarding-panel review-panel"><p className="card-kicker">Gotowy profil</p><h2>Twój profil jest gotowy</h2><ProfileSummary profile={profile} /><div className="action-row"><PrimaryButton onClick={onSave}>Zapisz profil</PrimaryButton><SecondaryButton onClick={onEdit}>Edytuj szczegóły</SecondaryButton><SecondaryButton onClick={onBack}>Wróć do pytań</SecondaryButton><button className="text-action" type="button" onClick={onRestart}>Zacznij od nowa</button></div></SectionCard> }

function SavedStep({ profile, onEdit, onImport, onRestart }: { profile: UserProfile; onEdit: () => void; onImport: () => void; onRestart: () => void }) { return <SectionCard className="onboarding-panel review-panel"><p className="card-kicker">Profil zapisany</p><h2>Twój profil jest gotowy</h2><ProfileSummary profile={profile} /><div className="action-row"><PrimaryButton onClick={onImport}>Przejdź do importu ofert</PrimaryButton><SecondaryButton onClick={onEdit}>Edytuj szczegóły</SecondaryButton><button className="text-action" type="button" onClick={onRestart}>Utwórz nowy profil</button></div></SectionCard> }

function ProfileSummary({ profile }: { profile: UserProfile }) { const rows: Array<[string, string]> = [['Rola główna', profile.primaryRole], ['Role alternatywne', profile.alternativeRoles.join(', ')], ['Podsumowanie doświadczenia', profile.experienceSummary], ['Umiejętności', profile.skills.join(', ')], ['Preferowane lokalizacje', profile.acceptedLocations.join(', ')], ['Tryby pracy', profile.acceptedWorkModes.join(', ')], ['Formy zatrudnienia', profile.acceptedContractTypes.join(', ')], ['Must-have', profile.additionalMustHave], ['Blacklista', profile.additionalBlacklist], ['Priorytety', profile.priorities.map((item) => priorityLabels[item]).join(' → ')]]; return <dl className="profile-review-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Brak danych'}</dd></div>)}</dl> }

function ManualForm({ profile, update, movePriority, errors, onSave, onBack }: { profile: UserProfile; update: <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => void; movePriority: (index: number, direction: -1 | 1) => void; errors: Record<string, string>; onSave: () => void; onBack: () => void }) { const fieldError = (key: string) => errors[key] && <span className="field-error">{errors[key]}</span>; const workModes = [['remote', 'Zdalnie'], ['hybrid', 'Hybrydowo'], ['onsite', 'Stacjonarnie']] as const; const contracts = [['employment', 'Umowa o pracę'], ['b2b', 'B2B'], ['freelance', 'Freelance'], ['mandate', 'Umowa zlecenie']] as const; return <form className="form-stack manual-profile-form" onSubmit={(event) => { event.preventDefault(); onSave() }}><SectionCard title="Kierunek zawodowy"><div className="field-grid"><label>Rola główna<input value={profile.primaryRole} onChange={(event) => update('primaryRole', event.target.value)} />{fieldError('primaryRole')}</label><TagInput label="Role alternatywne" values={profile.alternativeRoles} onChange={(values) => update('alternativeRoles', values)} /></div></SectionCard><SectionCard title="Doświadczenie"><label>Podsumowanie doświadczenia<textarea rows={5} value={profile.experienceSummary} onChange={(event) => update('experienceSummary', event.target.value)} />{fieldError('experienceSummary')}</label></SectionCard><SectionCard title="Umiejętności"><TagInput label="Umiejętności" values={profile.skills} onChange={(values) => update('skills', values)} />{fieldError('skills')}</SectionCard><SectionCard title="Preferencje"><TagInput label="Preferowane lokalizacje" hint="Enter, przecinek, średnik lub opuszczenie pola dodaje lokalizację." values={profile.acceptedLocations} onChange={(values) => update('acceptedLocations', values)} placeholder="np. Zielona Góra" />{fieldError('acceptedLocations')}<label>Minimum wynagrodzenia<input type="number" min="0" value={profile.minimumSalary ?? ''} onChange={(event) => update('minimumSalary', event.target.value ? Number(event.target.value) : null)} /></label><fieldset><legend>Akceptowane tryby pracy</legend><ChoiceChecks values={profile.acceptedWorkModes} labels={workModes} onChange={(values) => update('acceptedWorkModes', values)} /></fieldset><fieldset><legend>Akceptowane formy zatrudnienia</legend><ChoiceChecks values={profile.acceptedContractTypes} labels={contracts} onChange={(values) => update('acceptedContractTypes', values)} /></fieldset><label className="checkbox-label"><input type="checkbox" checked={profile.studentStatusAvailable} onChange={(event) => update('studentStatusAvailable', event.target.checked)} />Mogę korzystać ze statusu studenta</label></SectionCard><SectionCard title="Kryteria"><fieldset><legend>Wykluczone tryby pracy</legend><ChoiceChecks values={profile.excludedWorkModes} labels={workModes} onChange={(values) => update('excludedWorkModes', values)} /></fieldset><fieldset><legend>Wykluczone formy zatrudnienia</legend><ChoiceChecks values={profile.excludedContractTypes} labels={contracts} onChange={(values) => update('excludedContractTypes', values)} /></fieldset><label className="checkbox-label"><input type="checkbox" checked={profile.requiresStudentStatus} onChange={(event) => update('requiresStudentStatus', event.target.checked)} />Wymagany status studenta</label><TagInput label="Wykluczone słowa kluczowe" values={profile.excludedKeywords} onChange={(values) => update('excludedKeywords', values)} /><div className="field-grid"><label>Must-have<textarea rows={3} value={profile.additionalMustHave} onChange={(event) => update('additionalMustHave', event.target.value)} /></label><label>Blacklista<textarea rows={3} value={profile.additionalBlacklist} onChange={(event) => update('additionalBlacklist', event.target.value)} /></label></div></SectionCard><SectionCard title="Priorytety"><PriorityList priorities={profile.priorities} move={movePriority} /></SectionCard><div className="action-row"><SecondaryButton type="button" onClick={onBack}>Wróć do prostego podsumowania</SecondaryButton><PrimaryButton type="submit">Zapisz profil</PrimaryButton></div></form> }
