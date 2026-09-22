'use server'

import { getMemberships } from './venues'
import { isPlatformAdmin } from './admin'

/**
 * Where a signed-in account belongs.
 *
 * One login serves three audiences now that the landing page and the portal
 * share an address. Sending everyone to /drops meant an operator with no venue
 * of their own -- and any player who signed in out of curiosity -- landed on a
 * "you have no venue" screen.
 *
 * A server action rather than a plain export from lib/venues: the login page is
 * a client component, and everything in that module reaches for cookies.
 */
export async function resolveHome(): Promise<string> {
  const [memberships, admin] = await Promise.all([
    getMemberships(),
    isPlatformAdmin(),
  ])

  if (memberships.length > 0) return '/drops'
  if (admin) return '/admin/venues'
  // A registered business with no venue yet: send them to the application
  // form, or to its "we are reviewing" state if they have already sent one.
  return '/apply'
}
