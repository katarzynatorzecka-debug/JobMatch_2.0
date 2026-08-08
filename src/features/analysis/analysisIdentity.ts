export type AnalysisIdentityInput = {
  userId: string
  jobOfferId: string
  offerVersionId: string
  profileVersionId: string
  promptVersion: string
  modelVersion: string
  algorithmVersion: string
}

export function analysisIdentityMaterial(input: AnalysisIdentityInput) {
  return [input.userId, input.jobOfferId, input.offerVersionId, input.profileVersionId, input.promptVersion, input.modelVersion, input.algorithmVersion].join('|')
}

export async function buildAnalysisIdentity(input: AnalysisIdentityInput) {
  const bytes = new TextEncoder().encode(analysisIdentityMaterial(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
