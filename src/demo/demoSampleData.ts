import type { ImportedReport } from '../contracts/import'
import type { UserProfile } from '../contracts/profile'
import { demoOffers } from './offers'

export const demoSampleProfile: UserProfile = {
  primaryRole: 'Process Automation Specialist',
  alternativeRoles: ['Business Process Analyst', 'Operations Analyst'],
  experienceSummary: 'Specjalistka procesów i automatyzacji pracująca z narzędziami operacyjnymi, danymi i usprawnieniami workflow.',
  skills: ['Process mapping', 'Power BI', 'Power Query', 'Power Automate', 'Zapier', 'REST APIs'],
  acceptedWorkModes: ['remote', 'hybrid'],
  acceptedContractTypes: ['employment', 'b2b'],
  acceptedLocations: ['Bydgoszcz'],
  minimumSalary: null,
  studentStatusAvailable: false,
  excludedContractTypes: [],
  excludedWorkModes: [],
  excludedKeywords: [],
  requiresStudentStatus: false,
  additionalMustHave: '',
  additionalBlacklist: '',
  priorities: ['experience', 'skills', 'preferences', 'growth'],
}

export function createDemoSampleReport(): ImportedReport {
  return {
    version: 1,
    source: 'rocketjobs-eml',
    fileName: 'demo-przykladowe-oferty.eml',
    importedAt: '2026-08-01T00:00:00.000Z',
    offers: demoOffers.map((offer) => ({
      id: offer.id,
      title: offer.title,
      company: offer.company,
      location: offer.location,
      workMode: offer.workMode,
      contractType: offer.contractType,
      salary: offer.salary,
      sourceUrl: offer.sourceUrl,
      sourceLabel: 'Oferta demonstracyjna',
      missingFields: [],
      warnings: [],
    })),
    warnings: [],
  }
}
