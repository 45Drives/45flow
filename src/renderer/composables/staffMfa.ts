// Staff two-step sign-in helpers shared by the sign-in screen and Settings.
// The server decides everything; these only call it and name its answers.

/** Sends one POST and returns the parsed JSON, or throws an Error carrying the server's `code` and `status`. */
export type MfaTransport = (path: string, body: Record<string, unknown>) => Promise<any>

export type MfaChallenge = 'required' | 'invalid' | 'locked' | 'enrollment-required' | 'unavailable'

const CHALLENGES: Record<string, MfaChallenge> = {
    mfa_required: 'required',
    invalid_mfa_code: 'invalid',
    mfa_locked: 'locked',
    mfa_enrollment_required: 'enrollment-required',
    mfa_unavailable: 'unavailable',
}

/** The sign-in answer a server error code stands for, or null when it is something else. */
export function mfaChallenge(code: unknown): MfaChallenge | null {
    return typeof code === 'string' ? CHALLENGES[code] ?? null : null
}

/** Browser transport: same-origin, no token (enrollment authenticates with the account password). */
export function browserMfaTransport(fetchImpl: typeof fetch = fetch): MfaTransport {
    return (path, body) => post(fetchImpl, path, body)
}

/** Turn any fetch-like POST into a transport; desktop passes its certificate-pinned fetch. */
export function fetchMfaTransport(send: (path: string, init: RequestInit) => Promise<Response>): MfaTransport {
    return async (path, body) => {
        const res = await send(path, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        return read(res)
    }
}

async function post(fetchImpl: typeof fetch, path: string, body: Record<string, unknown>) {
    return read(await fetchImpl(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }))
}

async function read(res: Response) {
    const data = await res.json().catch(() => null)
    if (res.ok) return data
    throw Object.assign(new Error(data?.message || data?.error || `HTTP ${res.status}`), {
        status: res.status, code: data?.error,
    })
}

export type EnrollmentCredentials = { username: string; password: string }

export const requestEnrollment = (send: MfaTransport, who: EnrollmentCredentials) =>
    send('/api/mfa/enroll/request', who) as Promise<{ requestCode: string; expiresAt: string }>

export const beginEnrollment = (send: MfaTransport, who: EnrollmentCredentials, requestCode: string) =>
    send('/api/mfa/enroll/begin', { ...who, requestCode }) as Promise<{ secret: string; otpauthUri: string; issuer: string; account: string }>

export const confirmEnrollment = (send: MfaTransport, who: EnrollmentCredentials, requestCode: string, code: string) =>
    send('/api/mfa/enroll/confirm', { ...who, requestCode, code }) as Promise<{ recoveryCodes: string[] }>

/** A friendlier line for the answers an enrollment step can get. */
export function enrollmentMessage(error: any): string {
    if (error?.status === 401) return 'That username or password was not accepted.'
    if (error?.code === 'enrollment_not_approved') {
        return 'That code is not approved yet, has expired, or does not match. Ask an administrator to approve it, or request a new one.'
    }
    if (error?.code === 'invalid_mfa_code') return 'That code was not accepted. Wait for the next code and try again.'
    if (error?.code === 'mfa_locked') return 'Too many incorrect attempts. Try again in 15 minutes.'
    return error?.message || 'Something went wrong. Try again.'
}

/** Grouped for reading aloud and copying: ABCD-EFGH-... */
export function formatSecret(secret: string): string {
    return secret.replace(/\s/g, '').match(/.{1,4}/g)?.join(' ') ?? secret
}
