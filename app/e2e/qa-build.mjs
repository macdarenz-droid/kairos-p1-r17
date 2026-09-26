// QA build with a throwaway activation key: the private key stays in e2e/.qa/ (git-ignored),
// the public key goes into the build, and the tests sign activation receipts with the private key.
import { execSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
mkdirSync('e2e/.qa', { recursive: true });
writeFileSync('e2e/.qa/qa-key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));

execSync('npx vite build', {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_KAIROS_ACTIVATION_ENDPOINT: 'https://activation.qa.invalid/v1/activate',
    VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI: spki,
    VITE_BUILD_ID: 'qa-e2e',
    VITE_KAIROS_API_URL: 'https://api.qa.invalid',
  },
});
