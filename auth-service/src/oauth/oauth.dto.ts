import { z } from 'zod'

const scopeString = z.string().max(200).optional()

/** Parâmetros da requisição de autorização, repassados pela tela de consentimento. */
export const AuthorizeRequestSchema = z.object({
  response_type: z.string(),
  client_id: z.string().min(1).max(500),
  redirect_uri: z.string().min(1).max(500),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'code_challenge inválido'),
  code_challenge_method: z.string(),
  state: z.string().max(500).optional(),
  scope: scopeString,
  resource: z.string().max(500).optional(),
})
export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>

export const ApproveSchema = z.object({
  request: AuthorizeRequestSchema,
  tenantIds: z.array(z.string().min(1).max(64)).min(1).max(10),
  allowWrite: z.boolean(),
})

/** RFC 7591 — só os campos que usamos; o resto é ignorado. */
export const RegisterClientSchema = z.object({
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
  client_name: z.string().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

export const TokenRequestSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string().min(1).max(200),
    redirect_uri: z.string().min(1).max(500),
    client_id: z.string().min(1).max(500),
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    resource: z.string().max(500).optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(1).max(200),
    client_id: z.string().min(1).max(500),
    scope: scopeString,
    resource: z.string().max(500).optional(),
  }),
])

export const RevokeSchema = z.object({
  token: z.string().min(1).max(200),
  token_type_hint: z.string().optional(),
  client_id: z.string().max(500).optional(),
})

export const IntrospectSchema = z.object({ token: z.string().min(1).max(200) })
