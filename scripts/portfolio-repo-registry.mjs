// Shared registry of the operator's local git checkouts used by the session-trace and
// stratum-b measurement scripts. Cejel's own repository (and the other repositories with
// no disclosure restriction) are listed here directly. Repositories under an operator
// non-disclosure ruling are never written into this public file as literals: they are
// loaded at run time from a local, non-committed JSON file named by
// CEJEL_PRIVATE_PORTFOLIO_CONFIG_PATH. Without that variable set, every script in this
// family still runs — it only sees the public repositories below.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OPERATOR_HOME = homedir();

export function projectPath(name) {
  return join(OPERATOR_HOME, 'projects', name);
}

export const PUBLIC_REPOSITORIES = [
  { slug: 'BargLabs/alfred', product: 'alfred', localPath: projectPath('alfred'), tip: '76a631be63cf1be2cd4d9c6b303626a7124864c4', scope: 'primary' },
  { slug: 'BargLabs/cejel', product: 'cejel', localPath: projectPath('cejel'), tip: '97564ad17ddde4c64d213f78c98d316c01b0c12a', scope: 'primary' },
  { slug: 'houman44/site-machine', product: 'site-machine', localPath: projectPath('site-machine'), tip: '1e4106f131f9af27a9a314a0dbb2ecc35c09b441', scope: 'expansion', nestedProjectFolder: true },
  { slug: 'houman44/barglabs-site', product: 'barglabs-site', localPath: projectPath('barglabs-site'), tip: '1e164da9400b0c7b8f073f2df5bafad3af48d643', scope: 'expansion', nestedProjectFolder: true },
  { slug: 'BargLabs/cejel-site', product: 'cejel-site', localPath: projectPath('cejel-site'), tip: '5ed796e3dc9926ae69e0b2b018026c099d211a2e', scope: 'expansion', nestedProjectFolder: true },
];

const PRIVATE_CONFIG_PATH_ENV = 'CEJEL_PRIVATE_PORTFOLIO_CONFIG_PATH';

function emptyPrivateConfig() {
  return { repositories: [], sessionTraceExistingOverlapKeys: [], priorExposureIdentities: [], sessionArchiveSecondaryExports: [] };
}

export function loadPrivatePortfolioConfig() {
  const configPath = process.env[PRIVATE_CONFIG_PATH_ENV];
  if (!configPath) return emptyPrivateConfig();
  if (!existsSync(configPath)) {
    throw new Error(`${PRIVATE_CONFIG_PATH_ENV} points to a missing file: ${configPath}`);
  }
  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  return { ...emptyPrivateConfig(), ...parsed };
}

export function portfolioRepositories() {
  const privateRepositories = loadPrivatePortfolioConfig().repositories.map((repo) => ({
    ...repo,
    localPath: repo.localPath ?? projectPath(repo.product),
  }));
  return [...PUBLIC_REPOSITORIES, ...privateRepositories];
}
