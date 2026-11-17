import { expect, it, vi } from 'vitest'
import { useResilientNav } from './useResilientNav'

const router = vi.hoisted(() => ({
    push: vi.fn().mockResolvedValue(undefined),
    currentRoute: { value: { name: 'create-link' } },
}))
vi.mock('vue-router', () => ({
    useRouter: () => router,
    isNavigationFailure: () => false,
}))

it('preserves the selected project when navigating to link creation', async () => {
    await useResilientNav().to('create-link', undefined, { projectId: '37' })
    expect(router.push).toHaveBeenCalledWith({
        name: 'create-link', params: undefined, query: { projectId: '37' },
    })
})
