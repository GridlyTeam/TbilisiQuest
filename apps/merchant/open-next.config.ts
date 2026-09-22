import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Defaults are right for this app: no ISR cache to configure, because every
// page behind the login is dynamic and the landing page is static output.
export default defineCloudflareConfig()
