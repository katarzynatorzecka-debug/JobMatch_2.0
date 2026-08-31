import type { ContractType, UserProfile, WorkMode } from '../../contracts/profile'
import type { ImportedJobOffer } from '../../contracts/import'
import type { FilteredJobOffer, HardFilterReason, HardFilterResult, HardFilterStatus } from '../../contracts/hardFilter'

function normalized(value: string) { return value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))] }
function phraseList(value: string) { return unique(value.split(/[\n,;]+/).map(normalized).filter((item) => item.length >= 2)) }
function offerText(offer: ImportedJobOffer) { return normalized([offer.title, offer.company, offer.location, offer.workMode, offer.contractType, offer.salary, offer.sourceLabel].filter(Boolean).join(' ')) }

function contractValues(value?: string): ContractType[] {
  const source = normalized(value ?? '')
  const found: ContractType[] = []
  if (/\bb2b\b/.test(source)) found.push('b2b')
  if (/umowa o prace|\buop\b|employment/.test(source)) found.push('employment')
  if (/zlecenie|\buz\b|mandate/.test(source)) found.push('mandate')
  if (/freelance|kontrakt/.test(source)) found.push('freelance')
  if (/praktyk|staz|intern/.test(source)) found.push('internship')
  return unique(found) as ContractType[]
}

function workModeValues(value?: string): WorkMode[] {
  const source = normalized(value ?? '')
  const found: WorkMode[] = []
  if (/zdaln|remote/.test(source)) found.push('remote')
  if (/hybryd/.test(source)) found.push('hybrid')
  if (/stacjon|onsite|w biurze/.test(source)) found.push('onsite')
  return unique(found) as WorkMode[]
}

function readable(values: string[]) { return values.join(', ') }

function addReason(reasons: HardFilterReason[], reason: HardFilterReason) {
  if (!reasons.some((item) => item.code === reason.code)) reasons.push(reason)
}

export function evaluateOffer(profile: UserProfile, offer: ImportedJobOffer): HardFilterResult {
  const reasons: HardFilterReason[] = []
  const missingInformation = [...offer.missingFields]
  const checkedCriteria: string[] = []
  const text = offerText(offer)
  const hardPreferences = profile.intelligence?.workPreferences
  const hardLocations = (hardPreferences?.locations ?? []).filter((item) => item.isHard).map((item) => normalized(item.value))
  const hardModes = (hardPreferences?.workModes ?? []).filter((item) => item.isHard).map((item) => item.value)
  const hardContracts = (hardPreferences?.employmentTypes ?? []).filter((item) => item.isHard).map((item) => item.value)

  checkedCriteria.push('Typ umowy')
  const contracts = contractValues(offer.contractType)
  if (!offer.contractType) { addReason(reasons, { code: 'missing-contract', label: 'Brak informacji o rodzaju umowy.', category: 'contract' }); missingInformation.push('rodzaj umowy') }
  else if (!contracts.length) addReason(reasons, { code: 'ambiguous-contract', label: 'Rodzaj umowy wymaga sprawdzenia.', category: 'contract', offerValue: offer.contractType })
  else if (contracts.some((value) => profile.excludedContractTypes.includes(value))) addReason(reasons, { code: 'excluded-contract', label: 'Oferta zawiera wykluczony typ umowy.', category: 'contract', profileValue: readable(profile.excludedContractTypes), offerValue: offer.contractType })
  else if (hardContracts.length && !contracts.some((value) => hardContracts.includes(value))) addReason(reasons, { code: 'hard-contract-mismatch', label: 'Oferta nie spełnia jawnie ustawionego twardego warunku formy zatrudnienia.', category: 'contract', profileValue: readable(hardContracts), offerValue: offer.contractType })
  // Accepted terms are soft preferences. Only an explicitly excluded term is a Hard Filter signal.

  checkedCriteria.push('Tryb pracy')
  const workModes = workModeValues(offer.workMode)
  if (!offer.workMode) { addReason(reasons, { code: 'missing-work-mode', label: 'Brak informacji o trybie pracy.', category: 'work-mode' }); missingInformation.push('tryb pracy') }
  else if (!workModes.length) addReason(reasons, { code: 'ambiguous-work-mode', label: 'Tryb pracy wymaga sprawdzenia.', category: 'work-mode', offerValue: offer.workMode })
  else if (workModes.some((value) => profile.excludedWorkModes.includes(value))) addReason(reasons, { code: 'excluded-work-mode', label: 'Oferta zawiera wykluczony tryb pracy.', category: 'work-mode', profileValue: readable(profile.excludedWorkModes), offerValue: offer.workMode })
  else if (hardModes.length && !workModes.some((value) => hardModes.includes(value))) addReason(reasons, { code: 'hard-work-mode-mismatch', label: 'Oferta nie spełnia jawnie ustawionego twardego warunku trybu pracy.', category: 'work-mode', profileValue: readable(hardModes), offerValue: offer.workMode })
  // Accepted modes are soft preferences. Only an explicitly excluded mode is a Hard Filter signal.

  // Location and salary are soft by default. A user can promote a location explicitly to hard.
  if (hardLocations.length) {
    checkedCriteria.push('Twarda lokalizacja')
    const offerLocation = normalized(offer.location ?? '')
    if (!offerLocation) { addReason(reasons, { code: 'hard-location-missing', label: 'Brak informacji potrzebnej do sprawdzenia twardej lokalizacji.', category: 'location' }); missingInformation.push('lokalizacja') }
    else if (!hardLocations.some((value) => offerLocation.includes(value) || value.includes(offerLocation))) addReason(reasons, { code: 'hard-location-mismatch', label: 'Oferta nie spełnia jawnie ustawionego twardego warunku lokalizacji.', category: 'location', profileValue: readable(hardLocations), offerValue: offer.location })
  }

  checkedCriteria.push('Wykluczone słowa')
  const blockedPhrases = unique([...profile.excludedKeywords.map(normalized), ...phraseList(profile.additionalBlacklist)])
  blockedPhrases.forEach((phrase) => { if (phrase && text.includes(phrase)) addReason(reasons, { code: `excluded-keyword:${phrase}`, label: 'Oferta zawiera wykluczone słowo lub frazę.', category: 'keyword', profileValue: phrase, offerValue: phrase }) })

  if (profile.requiresStudentStatus) {
    checkedCriteria.push('Status studenta')
    if (/\bstudent\w*\b/.test(text) && !profile.studentStatusAvailable) addReason(reasons, { code: 'student-status-required', label: 'Oferta wymaga statusu studenta, którego profil nie potwierdza.', category: 'student-status' })
    else if (!/\bstudent\w*\b/.test(text)) { addReason(reasons, { code: 'student-status-missing', label: 'Brak informacji, czy oferta wymaga statusu studenta.', category: 'student-status' }); missingInformation.push('wymóg statusu studenta') }
  }

  const mustHave = phraseList(profile.additionalMustHave)
  if (mustHave.length) {
    checkedCriteria.push('Dodatkowe must-have')
    if (!mustHave.some((phrase) => text.includes(phrase))) addReason(reasons, { code: 'must-have-not-confirmed', label: 'Dodatkowe must-have nie jest potwierdzone przez dostępne dane oferty.', category: 'must-have', profileValue: readable(mustHave) })
  }

  const status: HardFilterStatus = reasons.some((reason) => ['excluded-contract', 'excluded-work-mode', 'student-status-required', 'hard-contract-mismatch', 'hard-work-mode-mismatch', 'hard-location-mismatch'].includes(reason.code) || reason.code.startsWith('excluded-keyword:')) ? 'fail' : reasons.length ? 'weak' : 'pass'
  return { offerId: offer.id, status, reasons, missingInformation: unique(missingInformation), checkedCriteria: unique(checkedCriteria) }
}

export function evaluateOffers(profile: UserProfile, offers: ImportedJobOffer[]): FilteredJobOffer[] {
  return offers.map((offer) => ({ offer, result: evaluateOffer(profile, offer) }))
}
