// SYNTHETIC repositories for v26 item 8 (docs/calibration/v26/ruling-item-8.md): A3's "declares
// neither a build nor a typecheck script" finding fires only when the package has something to
// build or check (B-1), no step is found in the four places read (B-2), and every such place was
// read (B-3). Authored here; nothing is derived from a real repository. Materialised at test time,
// so no nested .github tree is tracked in this repository.

export interface BuildStepFixture {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
}

/** A direct HTTP entrypoint that never reads the request, so A3 applies and branch 3 stays silent. */
const HTTP_ENTRY =
  "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(5400);\n";
const TSCONFIG = '{"compilerOptions":{"strict":true,"outDir":"dist"}}\n';

const manifest = (scripts: Readonly<Record<string, string>>, extra: Record<string, unknown> = {}) =>
  `${JSON.stringify({ name: 'fixture-service', private: true, ...extra, scripts })}\n`;

const TRIGGERS = 'on:\n  pull_request:\n  push:\n    branches: [main]\n';

export function stepsWorkflow(steps: readonly string[]): string {
  return `name: ci\n${TRIGGERS}jobs:\n  job:\n    runs-on: ubuntu-latest\n    steps:\n${steps.map((step) => `      - ${step}\n`).join('')}`;
}

/** Larger than the repository content size limit, so the inventory withholds the file. */
export const OVERSIZED = 'x'.repeat(512_001);

/** B-1 holds and nothing else is present: authored TypeScript, a tsconfig, a start script only. */
const TS_SERVICE: Readonly<Record<string, string>> = {
  'package.json': manifest({ start: 'node dist/main.js' }),
  'tsconfig.json': TSCONFIG,
  'src/main.ts': HTTP_ENTRY,
};

const JS_SERVICE: Readonly<Record<string, string>> = {
  'package.json': manifest({ start: 'node src/main.js' }),
  'src/main.js': HTTP_ENTRY,
};

const withScripts = (scripts: Readonly<Record<string, string>>) => ({
  ...TS_SERVICE,
  'package.json': manifest({ start: 'node dist/main.js', ...scripts }),
});

export const B1 = {
  /** Plain JavaScript run as written: nothing to compile, no type checker configured. */
  javascriptService: { name: 'b1-javascript-service', files: JS_SERVICE },
  /** A declaration file is not authored source. */
  declarationOnly: {
    name: 'b1-declaration-only',
    files: { ...JS_SERVICE, 'types/env.d.ts': 'declare const VERSION: string;\n' },
  },
  /** TypeScript inside a nested package with its own manifest belongs to that package. */
  nestedPackageTypeScript: {
    name: 'b1-nested-package-typescript',
    files: {
      ...JS_SERVICE,
      'tools/codegen/package.json': '{"name":"codegen","private":true}\n',
      'tools/codegen/src/generate.ts': 'export const generate = (): string => "ok";\n',
    },
  },
  /** Authored TypeScript source with no tsconfig. */
  sourceOnly: {
    name: 'b1-source-only',
    files: { 'package.json': TS_SERVICE['package.json'] as string, 'src/main.ts': HTTP_ENTRY },
  },
  /** A tsconfig with JavaScript source. */
  tsconfigOnly: { name: 'b1-tsconfig-only', files: { ...JS_SERVICE, 'tsconfig.json': TSCONFIG } },
} satisfies Record<string, BuildStepFixture>;

/** All three hold: a TypeScript service, no step anywhere, every place read. */
export const ALL_THREE_HOLD: BuildStepFixture = {
  name: 'all-three-hold',
  files: {
    ...TS_SERVICE,
    '.github/workflows/ci.yml': stepsWorkflow(['uses: actions/checkout@v4', 'run: npm ci', 'run: npm test']),
    Dockerfile: 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nRUN npm ci --omit=dev\n',
    Makefile: 'install:\n\tnpm ci\n',
  },
};

export const B2 = {
  scripts: {
    /** A script named `compile` that runs tsc. */
    positive: { name: 'b2-script-compile-tsc', files: withScripts({ compile: 'tsc' }) },
    /** `echo tscope`: the vocabulary word appears only as a substring of an argument. */
    negative: { name: 'b2-script-substring-trap', files: withScripts({ lint: 'echo tscope' }) },
  },
  ci: {
    positive: {
      name: 'b2-ci-npx-tsc',
      files: {
        ...TS_SERVICE,
        '.github/workflows/ci.yml': stepsWorkflow(['uses: actions/checkout@v4', 'run: npx tsc --noEmit']),
      },
    },
    /** A path containing `webpack` is an argument, not a command word. */
    negative: {
      name: 'b2-ci-path-trap',
      files: {
        ...TS_SERVICE,
        '.github/workflows/ci.yml': stepsWorkflow([
          'uses: actions/checkout@v4',
          'run: node tools/webpack-report/index.js',
          'run: echo tscope',
        ]),
      },
    },
  },
  dockerfile: {
    /** The card's fixture: RUN calls a script under another name that runs tsup. */
    scriptReference: {
      name: 'b2-dockerfile-script-reference',
      files: {
        ...withScripts({ 'build:server': 'tsup src/main.ts' }),
        Dockerfile: 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nRUN pnpm run build:server\n',
      },
    },
    /** The step exists in the Dockerfile and nowhere else. */
    positive: {
      name: 'b2-dockerfile-direct-tsc',
      files: {
        ...TS_SERVICE,
        Dockerfile:
          'FROM node:22-alpine AS build\nWORKDIR /srv\nCOPY . .\nRUN --mount=type=cache,target=/root/.npm npm ci \\\n    && npx tsc -p .\n',
      },
    },
    /** Exec form. */
    execForm: {
      name: 'b2-dockerfile-exec-form',
      files: {
        ...TS_SERVICE,
        Dockerfile: 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nRUN ["npx", "tsc", "-p", "."]\n',
      },
    },
    negative: {
      name: 'b2-dockerfile-path-trap',
      files: {
        ...TS_SERVICE,
        Dockerfile: 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nRUN cp -r config/webpack /srv/config\n',
      },
    },
  },
  recipe: {
    /** A Makefile target under another name runs tsc. */
    positive: { name: 'b2-makefile-tsc', files: { ...TS_SERVICE, Makefile: 'compile:\n\ttsc -p .\n' } },
    /** A justfile `build` target is a task runner's build target, whatever it runs. */
    buildTarget: {
      name: 'b2-justfile-build-target',
      files: { ...TS_SERVICE, justfile: 'build:\n    node scripts/bundle.js\n' },
    },
    negative: {
      name: 'b2-makefile-path-trap',
      files: { ...TS_SERVICE, Makefile: 'assets:\n\tcp -r src/webpack-assets dist/\n' },
    },
  },
} satisfies Record<string, Record<string, BuildStepFixture>>;

function workspaceCapFiles(): Record<string, string> {
  const files: Record<string, string> = {
    'package.json': manifest({ start: 'node dist/main.js' }, { workspaces: ['packages/*'] }),
    'tsconfig.json': TSCONFIG,
    'src/main.ts': HTTP_ENTRY,
  };
  for (let index = 0; index < 201; index += 1) {
    const name = `p${String(index).padStart(3, '0')}`;
    files[`packages/${name}/package.json`] = `{"name":"@fixture/${name}","scripts":{"start":"node index.js"}}\n`;
  }
  return files;
}

export const B3 = {
  withheldWorkflow: {
    name: 'b3-withheld-workflow',
    files: { ...TS_SERVICE, '.github/workflows/large.yml': `# ${OVERSIZED}\n` },
  },
  reusableWorkflow: {
    name: 'b3-reusable-workflow',
    files: {
      ...TS_SERVICE,
      '.github/workflows/ci.yml': `name: ci\n${TRIGGERS}jobs:\n  shared:\n    uses: org/shared/.github/workflows/build.yml@v1\n`,
    },
  },
  localAction: {
    name: 'b3-local-action',
    files: {
      ...TS_SERVICE,
      '.github/workflows/ci.yml': stepsWorkflow(['uses: actions/checkout@v4', 'uses: ./.github/actions/setup']),
      '.github/actions/setup/action.yml':
        'name: setup\nruns:\n  using: composite\n  steps:\n    - run: npm ci\n      shell: bash\n',
    },
  },
  workspaceCap: { name: 'b3-workspace-cap', files: workspaceCapFiles() },
  withheldDockerfile: {
    name: 'b3-withheld-dockerfile',
    files: { ...TS_SERVICE, Dockerfile: `FROM node:22-alpine\n# ${OVERSIZED}\n` },
  },
  withheldMakefile: {
    name: 'b3-withheld-makefile',
    files: { ...TS_SERVICE, Makefile: `# ${OVERSIZED}\n` },
  },
  unparseableCommand: {
    name: 'b3-unparseable-command',
    files: {
      ...TS_SERVICE,
      '.github/workflows/ci.yml': stepsWorkflow(['uses: actions/checkout@v4', 'run: echo "unterminated']),
    },
  },
  unparseableManifest: {
    name: 'b3-unparseable-workspace-manifest',
    files: {
      ...TS_SERVICE,
      'package.json': manifest({ start: 'node dist/main.js' }, { workspaces: ['packages/*'] }),
      'packages/api/package.json': '{"name": "api", "scripts": {\n',
    },
  },
  unreadableWorkspaceDeclaration: {
    name: 'b3-unreadable-workspace-declaration',
    files: { ...TS_SERVICE, 'pnpm-workspace.yaml': 'packages:\n  nested:\n    - apps/*\n' },
  },
  otherCiSystem: {
    name: 'b3-other-ci-system',
    files: { ...TS_SERVICE, '.gitlab-ci.yml': 'build:\n  script:\n    - npm ci\n' },
  },
} satisfies Record<string, BuildStepFixture>;

/** B-1 fails, so branch 1 stops firing and the HEALTHCHECK branch after it is evaluated. */
export const CHAIN_HEALTHCHECK: BuildStepFixture = {
  name: 'chain-healthcheck',
  files: {
    'package.json': manifest({ start: 'node src/service.js' }),
    'src/service.js': "console.log('service');\n",
    Dockerfile: 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nCMD ["node", "src/service.js"]\n',
  },
};

export const ALL_BUILD_STEP_FIXTURES: readonly BuildStepFixture[] = [
  ...Object.values(B1),
  ALL_THREE_HOLD,
  ...Object.values(B2).flatMap((place) => Object.values(place)),
  ...Object.values(B3),
  CHAIN_HEALTHCHECK,
];
