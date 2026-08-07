export const profilePresentationSources = ['cv', 'manual', 'none'] as const
export type ProfilePresentationSource = (typeof profilePresentationSources)[number]

export interface ProfilePresentationMetadata {
  fullName: string | null
  source: ProfilePresentationSource
}

export const emptyProfilePresentation: ProfilePresentationMetadata = { fullName: null, source: 'none' }