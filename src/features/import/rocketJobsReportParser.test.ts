import { describe, expect, it } from 'vitest'
import { parseRocketJobsReport } from './rocketJobsReportParser'

const report = `RocketJobs\nExample Labs\nWarszawa\nData Automation Specialist\n120–150 PLN/h\nPraca zdalna\nUmowa B2B\nPozostało: 5 dni\nhttps://rocketjobs.pl/oferta/example-data-automation\n\nNorthstar\nGdańsk\nProduct Analyst\nPraca hybrydowa\nUmowa o pracę\nPozostało: 3 dni\nhttps://rocketjobs.pl/oferta/northstar-product-analyst`
const newsletterHeaderAndOffer = `Dopasowaliśmy raport do Twoich preferencji\n**Twoje preferencje: ai, Najlepiej dopasowane, Od wczoraj**96 · RocketJobs · Mamy dla Ciebie nowe oferty\nhttps://rocketjobs.pl/oferta-pracy/newsletter-header\n\nExample Labs\nWarszawa\nData Analyst\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/example-data`
const currentLayoutWithoutElapsedTime = `Dopasowaliśmy raport do Twoich preferencji\n**Twoje preferencje: ai, Najlepiej dopasowane, Od wczoraj**\nhttps://rocketjobs.pl/oferta-pracy/newsletter-header\n\nExample Labs\nWarszawa\nData Analyst\nPraca hybrydowa\nhttps://rocketjobs.pl/oferta-pracy/example-data`
const reportWithLocationsAndUnavailableSalary = `96 · RocketJobs · Armiger sp. z o.o.\nKatowice\nCustomer Success Manager\nBrak widełek wynagrodzenia\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/armiger-customer-success-manager-katowice\n\nKAMSOFT S.A.\nKatowice\nSenior Implementation Specialist\nBrak widełek wynagrodzenia\nPraca hybrydowa\nUmowa o pracę\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/kamsoft-senior-implementation-specialist-katowice\n\nEnergomix S.A.\nPłock\nProject Manager\nBrak widełek wynagrodzenia\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/energomix-project-manager-plock\n\nEduGO P.S.A.\nSopot\nEducation Project Manager\nPraca hybrydowa\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/edugo-education-project-manager-sopot`
const reportWithRocketJobsChrome = `96\nRocketJobs\nTMS Personal\nGdańsk\nBądź pierwszym aplikującym!\nRecruitment Coordinator\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/tms-personal-recruitment-coordinator-gdansk`
const reportWithEmbeddedWorkMode = `EduGO P.S.A.\nSopot\nBądź pierwszym aplikującym!\nInstruktor / Instruktorka tworzenia gier - firma edukacyjna, 100% zdalnie\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/edugo-instruktor-tworzenia-gier-sopot`

describe('parseRocketJobsReport', () => {
  it('extracts normalized offers from anonymous RocketJobs snippets', () => {
    const parsed = parseRocketJobsReport(report)
    expect(parsed.offers).toHaveLength(2)
    expect(parsed.offers[0]).toMatchObject({ title: 'Data Automation Specialist', company: 'Example Labs', sourceLabel: 'RocketJobs' })
    expect(parsed.offers[1].missingFields).toContain('wynagrodzenie')
  })
  it('deduplicates the same source URL deterministically', () => {
    const parsed = parseRocketJobsReport(`${report}\n${report}`)
    expect(parsed.offers).toHaveLength(2)
    expect(parsed.warnings.some((warning) => warning.code === 'duplicate')).toBe(true)
  })
  it('ignores a newsletter header link while preserving the following offer card', () => {
    const parsed = parseRocketJobsReport(newsletterHeaderAndOffer)
    expect(parsed.offers).toHaveLength(1)
    expect(parsed.offers[0]).toMatchObject({ title: 'Data Analyst', company: 'Example Labs' })
    expect(parsed.offers[0]?.title).not.toContain('Twoje preferencje')
  })

  it('parses the current compact card layout without an elapsed-time line', () => {
    expect(parseRocketJobsReport(currentLayoutWithoutElapsedTime).offers).toMatchObject([{ title: 'Data Analyst', company: 'Example Labs' }])
  })

  it('keeps city names and unavailable-salary copy out of titles while preserving their fields', () => {
    expect(parseRocketJobsReport(reportWithLocationsAndUnavailableSalary).offers).toMatchObject([
      { title: 'Customer Success Manager', company: 'Armiger sp. z o.o.', location: 'Katowice', salary: undefined },
      { title: 'Senior Implementation Specialist', company: 'KAMSOFT S.A.', location: 'Katowice', workMode: 'Praca hybrydowa', contractType: 'Umowa o pracę', salary: undefined },
      { title: 'Project Manager', company: 'Energomix S.A.', location: 'Płock', salary: undefined },
      { title: 'Education Project Manager', company: 'EduGO P.S.A.', location: 'Sopot', workMode: 'Praca hybrydowa' },
    ])
  })

  it('rejects RocketJobs chrome and keeps a real role as the title', () => {
    expect(parseRocketJobsReport(reportWithRocketJobsChrome).offers).toMatchObject([
      { title: 'Recruitment Coordinator', company: 'TMS Personal', location: 'Gdańsk' },
    ])
  })

  it('keeps a title containing embedded work mode separate from an unlisted city', () => {
    expect(parseRocketJobsReport(reportWithEmbeddedWorkMode).offers).toMatchObject([
      { title: 'Instruktor / Instruktorka tworzenia gier - firma edukacyjna', company: 'EduGO P.S.A.', location: 'Sopot', workMode: '100% zdalnie' },
    ])
  })

  it('repairs legacy report URLs before storing an offer', () => {
    const parsed = parseRocketJobsReport(`Example Labs\nWarszawa\nSEO Specialist\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta/example-seo?utm_campaign=no-category?utm_source=mail`)
    expect(parsed.offers[0]?.sourceUrl).toBe('https://rocketjobs.pl/oferta-pracy/example-seo?utm_campaign=no-category&utm_source=mail')
  })

  it('uses the recognized location when repairing a legacy report URL', () => {
    const parsed = parseRocketJobsReport(`Internet Plus\nPoznań\nMłodszy Specjalista SEO\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta/internet-plus-seo-kielce-marketing-marketing`)
    expect(parsed.offers[0]?.sourceUrl).toBe('https://rocketjobs.pl/oferta-pracy/internet-plus-seo-poznan-marketing-marketing')
  })
})
